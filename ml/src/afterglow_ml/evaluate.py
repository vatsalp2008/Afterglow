"""Evaluation for ml/REPORT.md (ADR 0015).

Scores an exported ONNX model with onnxruntime, the way the browser runs it:
- top-1 and top-3 accuracy on the held-out Quick, Draw! test split, per class too;
- the confusion matrix, as a table of the most-confused pairs and an SVG;
- accuracy on doodles drawn in the air with Afterglow (``fixtures/doodles``,
  recorded with ``?record=doodles``), rasterized exactly as the studio does;
- CPU inference latency for one drawing.
"""

import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from afterglow_ml.dataset import Split, to_uint8
from afterglow_ml.export import predict, session
from afterglow_ml.raster import Point, doodle_image


@dataclass(frozen=True, slots=True)
class Scores:
    top1: float
    top3: float
    per_class: dict[str, float]
    count: int


def score(logits: NDArray[np.float32], y: NDArray[np.int16], classes: tuple[str, ...]) -> Scores:
    order = np.argsort(-logits, axis=1)
    top1 = order[:, 0] == y
    top3 = (order[:, :3] == y[:, None]).any(axis=1)
    per_class = {c: float(top1[y == i].mean()) for i, c in enumerate(classes) if (y == i).any()}
    return Scores(float(top1.mean()), float(top3.mean()), per_class, len(y))


def confusion(logits: NDArray[np.float32], y: NDArray[np.int16], n: int) -> NDArray[np.int64]:
    matrix = np.zeros((n, n), dtype=np.int64)
    np.add.at(matrix, (y.astype(np.int64), logits.argmax(1)), 1)
    return matrix


def top_confusions(
    matrix: NDArray[np.int64], classes: tuple[str, ...], k: int = 12
) -> list[dict[str, Any]]:
    """The most frequent mistakes, as shares of the true class."""
    rows = matrix.sum(axis=1, keepdims=True).clip(min=1)
    shares = matrix / rows
    np.fill_diagonal(shares, 0)
    flat = np.argsort(-shares, axis=None)[:k]
    return [
        {
            "drawn": classes[int(i // len(classes))],
            "guessed": classes[int(i % len(classes))],
            "share": float(shares.flat[i]),
        }
        for i in flat
    ]


def confusion_svg(matrix: NDArray[np.int64], classes: tuple[str, ...]) -> str:
    """The row-normalized confusion matrix as a heat map."""
    n = len(classes)
    cell = 14
    label = 110
    size = label + n * cell
    rows = matrix.sum(axis=1, keepdims=True).clip(min=1)
    shares = matrix / rows
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size + 10} {size + 10}" '
        f'width="{size + 10}" height="{size + 10}" font-family="sans-serif" font-size="9">',
        f'<rect width="{size + 10}" height="{size + 10}" fill="#ffffff"/>',
    ]
    for i, name in enumerate(classes):
        y = label + i * cell + cell * 0.7
        parts.append(f'<text x="{label - 4}" y="{y:.1f}" text-anchor="end">{name}</text>')
        x = label + i * cell + cell * 0.7
        turn = f"rotate(-60 {x:.1f} {label - 4})"
        parts.append(f'<text x="{x:.1f}" y="{label - 4}" transform="{turn}">{name}</text>')
        for j in range(n):
            v = float(shares[i, j])
            if v <= 0:
                continue
            # Diagonal in blue, mistakes in red; darker is more.
            color = (
                f"rgba(40,90,200,{v:.3f})" if i == j else f"rgba(210,50,40,{min(1.0, v * 4):.3f})"
            )
            at = f'x="{label + j * cell}" y="{label + i * cell}"'
            parts.append(f'<rect {at} width="{cell}" height="{cell}" fill="{color}"/>')
    parts.append("</svg>")
    return "\n".join(parts)


def latency_ms(model_path: Path, runs: int = 500) -> dict[str, float]:
    sess = session(model_path)
    x = np.zeros((1, 28, 28), dtype=np.uint8)
    predict(sess, x)
    times = []
    for _ in range(runs):
        t0 = time.perf_counter()
        predict(sess, x)
        times.append((time.perf_counter() - t0) * 1000)
    return {"p50": float(np.percentile(times, 50)), "p95": float(np.percentile(times, 95))}


def load_air_doodles(doodles_dir: Path, classes: tuple[str, ...]) -> tuple[Split, list[str]]:
    """The air-drawn doodles as images and labels, and who drew them."""
    images: list[NDArray[np.uint8]] = []
    labels: list[int] = []
    people: list[str] = []
    for path in sorted(doodles_dir.glob("*.json")):
        data = json.loads(path.read_text("utf-8"))
        if data.get("format") != "afterglow.labeled" or data.get("kind") != "doodles":
            raise ValueError(f"{path.name}: not a labeled doodle set")
        people.append(str(data["person"]))
        for item in data["items"]:
            if item["label"] not in classes:
                raise ValueError(f"{path.name}: {item['label']!r} isn't one of the model's classes")
            strokes: list[list[Point]] = [
                [(float(p["x"]), float(p["y"])) for p in s["points"]] for s in item["strokes"]
            ]
            images.append(to_uint8(doodle_image(strokes)))
            labels.append(classes.index(item["label"]))
    x = np.stack(images) if images else np.zeros((0, 28, 28), dtype=np.uint8)
    return Split(x, np.array(labels, dtype=np.int16)), people


def evaluate(
    model_path: Path, test: Split, doodles_dir: Path, classes: tuple[str, ...]
) -> dict[str, Any]:
    sess = session(model_path)
    test_logits = predict(sess, test.x)
    matrix = confusion(test_logits, test.y, len(classes))
    air, people = load_air_doodles(doodles_dir, classes)
    result: dict[str, Any] = {
        "model": model_path.name,
        "bytes": model_path.stat().st_size,
        "test": asdict(score(test_logits, test.y, classes)),
        "top_confusions": top_confusions(matrix, classes),
        "latency_ms_cpu": latency_ms(model_path),
        "air": None,
    }
    if len(air.y):
        air_logits = predict(sess, air.x)
        air_scores = score(air_logits, air.y, classes)
        # The same classes on the test split, for a like-for-like comparison.
        mask = np.isin(test.y, np.unique(air.y))
        result["air"] = {
            **asdict(air_scores),
            "people": people,
            "test_same_classes": asdict(score(test_logits[mask], test.y[mask], classes)),
            "guesses": [
                {"drawn": classes[int(t)], "guessed": classes[int(g)]}
                for t, g in zip(air.y, air_logits.argmax(1), strict=True)
                if t != g
            ],
        }
    result["confusion_svg"] = confusion_svg(matrix, classes)
    return result
