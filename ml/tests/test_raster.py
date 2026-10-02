import json
from pathlib import Path

import numpy as np

from afterglow_ml.parity import parity_cases
from afterglow_ml.raster import SIZE, doodle_image, prepare, rasterize, simplify

PARITY = Path(__file__).resolve().parents[2] / "fixtures" / "doodle-raster-parity.json"


def test_an_empty_drawing_is_black() -> None:
    assert doodle_image([]).sum() == 0
    assert doodle_image([]).shape == (SIZE, SIZE)


def test_a_horizontal_line_lights_the_middle_rows() -> None:
    image = doodle_image([[(0.0, 0.0), (100.0, 0.0)]])
    lit_rows = np.nonzero(image.max(axis=1) > 0.5)[0]
    assert set(lit_rows) <= {13, 14}
    assert image[14, 2:26].min() > 0.4
    assert image[:10].sum() == 0


def test_drawings_are_centered_and_keep_their_proportions() -> None:
    image = doodle_image([[(500.0, 100.0), (500.0, 700.0)]])
    cols = np.nonzero(image.max(axis=0) > 0.5)[0]
    assert set(cols) <= {13, 14}
    rows = np.nonzero(image.max(axis=1) > 0.5)[0]
    assert rows.min() <= 3 and rows.max() >= 24


def test_a_dot_is_a_small_blob_in_the_middle() -> None:
    image = doodle_image([[(42.0, 42.0)]])
    # The dot falls on the corner of the four middle pixels.
    assert image[13:15, 13:15].min() > 0.75
    assert image.sum() < 10


def test_prepare_matches_quick_draws_simplified_form() -> None:
    strokes = prepare([[(600.0, 400.0), (700.0, 400.0), (800.0, 400.0)], [(600.0, 500.0)]])
    # Top-left aligned, longer side 255, collinear points simplified away.
    assert np.allclose(strokes[0], [(0.0, 0.0), (255.0, 0.0)])
    assert np.allclose(strokes[1], [(0.0, 127.5)])


def test_simplify_keeps_corners_and_ends() -> None:
    path = [(0.0, 0.0), (5.0, 0.1), (10.0, 0.0), (10.0, 5.0), (10.0, 10.0)]
    assert simplify(path, 1.0) == [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0)]


def test_rasterize_values_stay_in_range() -> None:
    image = rasterize([[(0.0, 0.0), (255.0, 255.0)], [(0.0, 255.0), (255.0, 0.0)]])
    assert image.min() >= 0 and image.max() <= 1


def test_the_parity_file_is_up_to_date() -> None:
    # Regenerate with `uv run afterglow-ml parity` after changing the rasterizer.
    committed = json.loads(PARITY.read_text("utf-8"))
    assert committed["cases"] == parity_cases()
