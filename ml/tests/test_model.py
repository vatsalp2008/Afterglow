from pathlib import Path

import numpy as np
import torch

from afterglow_ml.dataset import Split
from afterglow_ml.evaluate import confusion, score, top_confusions
from afterglow_ml.export import export_onnx, predict, session, to_input
from afterglow_ml.model import DoodleNet, parameter_count
from afterglow_ml.train import augment


def test_the_model_is_small_and_classifies_28x28_images() -> None:
    model = DoodleNet(40).eval()
    assert model(torch.zeros(3, 1, 28, 28)).shape == (3, 40)
    # Under 1 MB as float32.
    assert parameter_count(model) * 4 < 1_000_000


def test_augmentation_keeps_images_in_range_and_shape() -> None:
    x = torch.zeros(4, 1, 28, 28)
    x[:, :, 10:18, 13:15] = 1
    out = augment(x, torch.Generator().manual_seed(0))
    assert out.shape == x.shape
    assert float(out.min()) >= 0 and float(out.max()) <= 1
    assert float(out.sum()) > 0


def test_onnx_export_agrees_with_pytorch(tmp_path: Path) -> None:
    torch.manual_seed(0)
    model = DoodleNet(5).eval()
    path = tmp_path / "model.onnx"
    export_onnx(model, path)
    images = np.random.default_rng(0).integers(0, 255, (6, 28, 28), dtype=np.uint8)
    with torch.no_grad():
        expected = model(torch.from_numpy(to_input(images))).numpy()
    assert np.allclose(predict(session(path), images), expected, atol=1e-4)


def test_scores_count_top_1_top_3_and_confusions() -> None:
    logits = np.array([[3, 2, 1, 0], [0, 3, 2, 1], [1, 2, 3, 0], [3, 0, 2, 1]], dtype=np.float32)
    y = np.array([0, 2, 2, 1], dtype=np.int16)
    classes = ("a", "b", "c", "d")
    s = score(logits, y, classes)
    assert s.top1 == 0.5
    assert s.top3 == 0.75
    assert s.per_class == {"a": 1.0, "b": 0.0, "c": 0.5}
    matrix = confusion(logits, y, 4)
    assert matrix[2, 1] == 1 and matrix[1, 0] == 1
    worst = top_confusions(matrix, classes, k=1)[0]
    assert worst == {"drawn": "b", "guessed": "a", "share": 1.0}


def test_splits_hold_uint8_images() -> None:
    split = Split(np.zeros((2, 28, 28), dtype=np.uint8), np.array([0, 1], dtype=np.int16))
    assert to_input(split.x).shape == (2, 1, 28, 28)
