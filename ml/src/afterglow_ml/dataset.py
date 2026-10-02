"""Rasterized train, validation and test splits (ADR 0015).

Each class's drawings are shuffled with a fixed seed and split 80/10/10, then rasterized
with ``raster.doodle_image`` and stored as uint8 arrays in ``data/cache/<split>.npz``
(``x``: N x 28 x 28, ``y``: class indices). Rasterizing runs in parallel, once.
"""

import os
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from afterglow_ml.quickdraw import Drawing, iter_drawings
from afterglow_ml.raster import Point, doodle_image

SPLITS = ("train", "val", "test")
SEED = 20261001


@dataclass(frozen=True, slots=True)
class Split:
    x: NDArray[np.uint8]
    y: NDArray[np.int16]


def split_indices(count: int, seed: int = SEED) -> dict[str, NDArray[np.int64]]:
    """A fixed shuffle of ``count`` items, split 80/10/10."""
    order = np.random.default_rng(seed).permutation(count)
    train_end = count * 8 // 10
    val_end = count * 9 // 10
    return {"train": order[:train_end], "val": order[train_end:val_end], "test": order[val_end:]}


def drawing_strokes(drawing: Drawing) -> list[list[Point]]:
    return [
        [(float(x), float(y)) for x, y in zip(xs, ys, strict=True)] for xs, ys in drawing.strokes
    ]


def to_uint8(image: NDArray[np.float32]) -> NDArray[np.uint8]:
    return np.round(image * 255).astype(np.uint8)


def _rasterize_file(path: str) -> NDArray[np.uint8]:
    with open(path, encoding="utf-8") as f:
        drawings = list(iter_drawings(f))
    return np.stack([to_uint8(doodle_image(drawing_strokes(d))) for d in drawings])


def build_splits(raw_dir: Path, classes: Sequence[str], per_class: int) -> dict[str, Split]:
    """Rasterizes the first ``per_class`` drawings of every class into the three splits."""
    paths = [str(raw_dir / f"{c}.ndjson") for c in classes]
    with ProcessPoolExecutor(max_workers=os.cpu_count()) as pool:
        images = list(pool.map(_rasterize_file, paths))
    xs: dict[str, list[NDArray[np.uint8]]] = {s: [] for s in SPLITS}
    ys: dict[str, list[NDArray[np.int16]]] = {s: [] for s in SPLITS}
    for label, class_images in enumerate(images):
        if len(class_images) < per_class:
            raise ValueError(f"{classes[label]}: {len(class_images)} drawings, need {per_class}")
        class_images = class_images[:per_class]
        for split, idx in split_indices(per_class).items():
            xs[split].append(class_images[idx])
            ys[split].append(np.full(len(idx), label, dtype=np.int16))
    return {s: Split(np.concatenate(xs[s]), np.concatenate(ys[s])) for s in SPLITS}


def save_splits(splits: dict[str, Split], cache_dir: Path) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    for name, split in splits.items():
        np.savez_compressed(cache_dir / f"{name}.npz", x=split.x, y=split.y)


def load_split(cache_dir: Path, name: str) -> Split:
    with np.load(cache_dir / f"{name}.npz") as data:
        return Split(data["x"], data["y"])
