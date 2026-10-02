import json
from pathlib import Path

import numpy as np

from afterglow_ml.dataset import build_splits, split_indices
from afterglow_ml.download import class_url, keep_recognized


def test_splits_are_fixed_disjoint_and_80_10_10() -> None:
    a = split_indices(100)
    b = split_indices(100)
    assert all(np.array_equal(a[k], b[k]) for k in a)
    assert [len(a[k]) for k in ("train", "val", "test")] == [80, 10, 10]
    assert len(set(np.concatenate(list(a.values())).tolist())) == 100


def _line(word: str, recognized: bool = True) -> str:
    return json.dumps(
        {
            "word": word,
            "recognized": recognized,
            "key_id": "1",
            "drawing": [[[0, 100, 200], [0, 50, 0]]],
        }
    )


def test_keeps_only_recognized_drawings_and_stops_early() -> None:
    lines = [_line("cat", False), _line("cat"), "not json", _line("cat"), _line("cat")]
    assert len(keep_recognized(lines, 2)) == 2
    assert class_url("smiley face").endswith("/smiley%20face.ndjson")


def test_builds_balanced_splits(tmp_path: Path) -> None:
    for word in ("cat", "sun"):
        (tmp_path / f"{word}.ndjson").write_text("\n".join(_line(word) for _ in range(10)) + "\n")
    splits = build_splits(tmp_path, ["cat", "sun"], per_class=10)
    assert splits["train"].x.shape == (16, 28, 28)
    assert splits["train"].x.dtype == np.uint8
    assert np.bincount(splits["test"].y).tolist() == [1, 1]
