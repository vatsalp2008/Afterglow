"""``afterglow-ml``: the doodle model's pipeline, one step per command (see README.md)."""

import argparse
import json
import sys
from pathlib import Path

from afterglow_ml.classes import CLASSES

ML_DIR = Path(__file__).resolve().parents[2]
REPO = ML_DIR.parent
DATA = ML_DIR / "data"
PER_CLASS = 20_000


def _download(args: argparse.Namespace) -> None:
    from afterglow_ml.download import download_class

    for i, word in enumerate(CLASSES, start=1):
        count = download_class(word, DATA / "raw", args.per_class)
        print(f"{i:2}/{len(CLASSES)} {word}: {count} drawings", flush=True)


def _build(args: argparse.Namespace) -> None:
    from afterglow_ml.dataset import build_splits, save_splits

    splits = build_splits(DATA / "raw", CLASSES, args.per_class)
    save_splits(splits, DATA / "cache")
    for name, split in splits.items():
        print(f"{name}: {len(split.y)} images")


RUNS = ML_DIR / "runs"
WEB_MODELS = REPO / "apps" / "web" / "public" / "models"
REPORT = ML_DIR / "report"


def _train(args: argparse.Namespace) -> None:
    from afterglow_ml.dataset import load_split
    from afterglow_ml.train import TrainConfig, train

    config = TrainConfig(epochs=args.epochs, augment=not args.no_augment)
    cache = DATA / "cache"
    summary = train(
        load_split(cache, "train"), load_split(cache, "val"), len(CLASSES), RUNS / args.name, config
    )
    print(f"best validation accuracy {summary['best_val']:.4f}, {summary['parameters']} parameters")


def _export(args: argparse.Namespace) -> None:
    from afterglow_ml.dataset import load_split
    from afterglow_ml.export import export_model, ship
    from afterglow_ml.train import load_model

    run = RUNS / args.name
    cache = DATA / "cache"
    checks = export_model(
        load_model(run, len(CLASSES)), run, load_split(cache, "val"), load_split(cache, "test")
    )
    print(json.dumps(checks, indent=2))
    if args.ship:
        ship(run / str(checks["shipped"]), CLASSES, WEB_MODELS)
        print(f"shipped {checks['shipped']} to {WEB_MODELS.relative_to(REPO)}")


def _evaluate(args: argparse.Namespace) -> None:
    from afterglow_ml.dataset import load_split
    from afterglow_ml.evaluate import evaluate

    test = load_split(DATA / "cache", "test")
    REPORT.mkdir(exist_ok=True)
    results = {}
    for name in args.names:
        run = RUNS / name
        shipped = json.loads((run / "export.json").read_text("utf-8"))["shipped"]
        result = evaluate(run / shipped, test, REPO / "fixtures" / "doodles", CLASSES)
        (REPORT / f"confusion-{name}.svg").write_text(result.pop("confusion_svg"), "utf-8")
        result["train"] = json.loads((run / "train.json").read_text("utf-8"))
        results[name] = result
        air = result["air"]
        air_text = (
            f", air-drawn top-1 {air['top1']:.3f} ({air['count']})"
            if air
            else ", no air-drawn doodles yet"
        )
        top1, top3 = result["test"]["top1"], result["test"]["top3"]
        print(f"{name}: test top-1 {top1:.4f} top-3 {top3:.4f}{air_text}")
    (REPORT / "results.json").write_text(json.dumps(results, indent=2) + "\n", "utf-8")
    print(f"wrote {(REPORT / 'results.json').relative_to(REPO)}")


def _parity(_: argparse.Namespace) -> None:
    from afterglow_ml.parity import write_parity

    path = REPO / "fixtures" / "doodle-raster-parity.json"
    write_parity(path)
    print(f"wrote {path.relative_to(REPO)}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="afterglow-ml", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    download = commands.add_parser("download", help="stream the Quick, Draw! subset into data/raw")
    download.add_argument("--per-class", type=int, default=PER_CLASS)
    download.set_defaults(run=_download)
    build = commands.add_parser(
        "build", help="rasterize data/raw into train/val/test in data/cache"
    )
    build.add_argument("--per-class", type=int, default=PER_CLASS)
    build.set_defaults(run=_build)
    train = commands.add_parser("train", help="train a model into runs/<name>")
    train.add_argument("--name", default="augmented")
    train.add_argument("--epochs", type=int, default=12)
    train.add_argument("--no-augment", action="store_true", help="for the domain-shift comparison")
    train.set_defaults(run=_train)
    export = commands.add_parser("export", help="export runs/<name> to ONNX, quantized")
    export.add_argument("--name", default="augmented")
    export.add_argument(
        "--ship", action="store_true", help="copy the model into apps/web/public/models"
    )
    export.set_defaults(run=_export)
    evaluate = commands.add_parser(
        "evaluate", help="score runs on the test split and air-drawn doodles"
    )
    evaluate.add_argument("names", nargs="*", default=["augmented", "plain"])
    evaluate.set_defaults(run=_evaluate)
    parity = commands.add_parser("parity", help="rewrite fixtures/doodle-raster-parity.json")
    parity.set_defaults(run=_parity)
    args = parser.parse_args(argv)
    args.run(args)


if __name__ == "__main__":
    main(sys.argv[1:])
