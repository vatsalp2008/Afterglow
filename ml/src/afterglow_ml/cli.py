"""``afterglow-ml``: the doodle model's pipeline, one step per command (see README.md)."""

import argparse
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
    parity = commands.add_parser("parity", help="rewrite fixtures/doodle-raster-parity.json")
    parity.set_defaults(run=_parity)
    args = parser.parse_args(argv)
    args.run(args)


if __name__ == "__main__":
    main(sys.argv[1:])
