"""ONNX export and int8 quantization (ADR 0015).

The trained model is exported to ONNX (float32) and checked against PyTorch with
onnxruntime. It's then quantized statically to int8 (QDQ format, weights per channel),
calibrated on validation images. The int8 model ships if it loses at most
``MAX_QUANT_DROP`` of top-1 accuracy on the test split; otherwise the float32 one does.
Both are well under 1 MB.
"""

import json
from collections.abc import Iterator
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from numpy.typing import NDArray
from onnxruntime.quantization import (
    CalibrationDataReader,
    QuantFormat,
    QuantType,
    quantize_static,
)
from onnxruntime.quantization.shape_inference import quant_pre_process

from afterglow_ml.dataset import Split

MAX_QUANT_DROP = 0.01
INPUT = "image"
OUTPUT = "logits"


def to_input(x: NDArray[np.uint8]) -> NDArray[np.float32]:
    """uint8 images, N x 28 x 28, to the model's input: N x 1 x 28 x 28 in [0, 1]."""
    return (x.astype(np.float32) / 255.0)[:, None, :, :]


def export_onnx(model: torch.nn.Module, path: Path) -> None:
    model.eval()
    example = torch.zeros(1, 1, 28, 28)
    batch = torch.export.Dim("batch", min=1, max=4096)
    program = torch.onnx.export(
        model,
        (example,),
        input_names=[INPUT],
        output_names=[OUTPUT],
        dynamic_shapes=({0: batch},),
        dynamo=True,
    )
    if program is None:
        raise RuntimeError("ONNX export returned nothing")
    program.save(str(path))


def session(path: Path) -> ort.InferenceSession:
    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def predict(
    sess: ort.InferenceSession, x: NDArray[np.uint8], batch: int = 2048
) -> NDArray[np.float32]:
    """Logits for uint8 images."""
    outs = [
        np.asarray(sess.run([OUTPUT], {INPUT: to_input(x[i : i + batch])})[0], dtype=np.float32)
        for i in range(0, len(x), batch)
    ]
    return np.concatenate(outs)


class _Calibration(CalibrationDataReader):  # type: ignore[misc]  # onnxruntime ships no types
    def __init__(self, x: NDArray[np.uint8], batch: int = 64) -> None:
        self._batches: Iterator[NDArray[np.float32]] = iter(
            to_input(x[i : i + batch]) for i in range(0, len(x), batch)
        )

    def get_next(self) -> dict[str, NDArray[np.float32]] | None:
        nxt = next(self._batches, None)
        return None if nxt is None else {INPUT: nxt}


def quantize(fp32: Path, int8: Path, calibration: NDArray[np.uint8]) -> None:
    prepared = int8.with_suffix(".prep.onnx")
    quant_pre_process(str(fp32), str(prepared))
    quantize_static(
        str(prepared),
        str(int8),
        _Calibration(calibration),
        quant_format=QuantFormat.QDQ,
        per_channel=True,
        activation_type=QuantType.QUInt8,
        weight_type=QuantType.QInt8,
    )
    prepared.unlink()


def top1(logits: NDArray[np.float32], y: NDArray[np.int16]) -> float:
    return float((logits.argmax(1) == y).mean())


def export_model(
    model: torch.nn.Module,
    out_dir: Path,
    val: Split,
    test: Split,
) -> dict[str, object]:
    """Writes ``model.fp32.onnx`` and ``model.int8.onnx`` to ``out_dir``; returns the checks."""
    out_dir.mkdir(parents=True, exist_ok=True)
    fp32 = out_dir / "model.fp32.onnx"
    int8 = out_dir / "model.int8.onnx"
    export_onnx(model, fp32)

    sample = test.x[:512]
    with torch.no_grad():
        reference = model(torch.from_numpy(to_input(sample))).numpy()
    exported = predict(session(fp32), sample)
    max_diff = float(np.abs(reference - exported).max())
    if max_diff > 1e-3 or not np.array_equal(reference.argmax(1), exported.argmax(1)):
        raise RuntimeError(f"ONNX disagrees with PyTorch (max difference {max_diff})")

    # Calibration: 1,024 validation images, spread over the classes.
    rng = np.random.default_rng(1)
    quantize(fp32, int8, val.x[rng.choice(len(val.x), 1024, replace=False)])
    acc_fp32 = top1(predict(session(fp32), test.x), test.y)
    acc_int8 = top1(predict(session(int8), test.x), test.y)
    chosen = int8 if acc_fp32 - acc_int8 <= MAX_QUANT_DROP else fp32
    checks: dict[str, object] = {
        "max_difference_vs_pytorch": max_diff,
        "test_top1_fp32": acc_fp32,
        "test_top1_int8": acc_int8,
        "bytes_fp32": fp32.stat().st_size,
        "bytes_int8": int8.stat().st_size,
        "shipped": chosen.name,
    }
    (out_dir / "export.json").write_text(json.dumps(checks, indent=2) + "\n", "utf-8")
    return checks


def ship(model_path: Path, classes: tuple[str, ...], web_models: Path) -> None:
    """Copies the chosen model into the studio, with its class list."""
    web_models.mkdir(parents=True, exist_ok=True)
    (web_models / "doodle.onnx").write_bytes(model_path.read_bytes())
    meta = {
        "version": 1,
        "input": {"name": INPUT, "size": 28},
        "output": OUTPUT,
        "classes": list(classes),
    }
    (web_models / "doodle.json").write_text(json.dumps(meta, indent=2) + "\n", "utf-8")
