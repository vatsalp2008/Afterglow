# afterglow-ml

The doodle recognizer's training pipeline (Phase 5): download a subset of Google's Quick, Draw! dataset, rasterize strokes to 28x28 with the same logic as the browser, train a small CNN in PyTorch, export it to ONNX, and report accuracy, including on doodles drawn in the air with Afterglow.

So far it contains the parser for the dataset's simplified NDJSON format.

```sh
uv sync
uv run ruff check . && uv run ruff format --check .
uv run mypy
uv run pytest
```
