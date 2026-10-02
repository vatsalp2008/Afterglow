"""The doodle model's classes (ADR 0015).

Forty Quick, Draw! categories that are distinct from each other and can be drawn in the
air in a few strokes. Circle, square, triangle and line are left out: shape snapping
handles those. The order is the model's output order, written to ``classes.json`` with
the model.
"""

CLASSES: tuple[str, ...] = (
    "apple",
    "banana",
    "bicycle",
    "bird",
    "butterfly",
    "cactus",
    "car",
    "cat",
    "cloud",
    "crown",
    "cup",
    "diamond",
    "door",
    "envelope",
    "eye",
    "fish",
    "flower",
    "guitar",
    "hand",
    "hat",
    "house",
    "key",
    "ladder",
    "light bulb",
    "lightning",
    "moon",
    "mountain",
    "mushroom",
    "pizza",
    "rainbow",
    "smiley face",
    "snail",
    "snake",
    "snowman",
    "spider",
    "star",
    "sun",
    "sword",
    "tree",
    "umbrella",
)
