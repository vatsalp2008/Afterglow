import json

import pytest

from afterglow_ml.quickdraw import DrawingFormatError, iter_drawings, parse_drawing


def line(**overrides: object) -> str:
    record: dict[str, object] = {
        "word": "cat",
        "countrycode": "US",
        "timestamp": "2017-03-09 00:28:55.637750 UTC",
        "recognized": True,
        "key_id": "5891796615823360",
        "drawing": [[[0, 10, 20], [5, 5, 30]], [[100, 255], [0, 40]]],
    }
    record.update(overrides)
    return json.dumps(record)


def test_parses_a_simplified_drawing() -> None:
    d = parse_drawing(line())
    assert d.word == "cat"
    assert d.recognized is True
    assert d.strokes[0] == ((0, 10, 20), (5, 5, 30))
    assert d.point_count == 5


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"drawing": [[[0, 1], [0]]]}, "equal length"),
        ({"drawing": [[[0, 256], [0, 1]]]}, "0-255"),
        ({"drawing": [[[0, 1.5], [0, 1]]]}, "integers"),
        ({"drawing": [[[True], [1]]]}, "integers"),
        ({"drawing": []}, "non-empty list"),
        ({"drawing": [[[0, 1]]]}, "[xs, ys]"),
        ({"word": ""}, "word"),
    ],
)
def test_rejects_malformed_drawings(overrides: dict[str, object], message: str) -> None:
    with pytest.raises(DrawingFormatError, match=message):
        parse_drawing(line(**overrides))


def test_rejects_invalid_json() -> None:
    with pytest.raises(DrawingFormatError, match="invalid JSON"):
        parse_drawing("{nope")


def test_iterates_lines_skipping_blanks_and_naming_bad_lines() -> None:
    drawings = list(iter_drawings([line(), "", "   ", line(word="dog")]))
    assert [d.word for d in drawings] == ["cat", "dog"]
    with pytest.raises(DrawingFormatError, match="line 2"):
        list(iter_drawings([line(), "[]"]))
