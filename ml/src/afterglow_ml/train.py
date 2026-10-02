"""Training (ADR 0015).

AdamW with a one-cycle schedule and light label smoothing, on the Apple GPU (MPS) when
there is one. The best epoch on the validation split is kept in ``runs/<name>/``.

Augmentation runs on the GPU, per batch, and stands in for how strokes drawn in the air
differ from Quick, Draw!'s mouse and touch drawings:
- small rotations, scaling, shear and shifts (an affine warp);
- a gentle, smooth wobble (a low-resolution random displacement field), like a hand
  wavering in the air;
- line thickness varied by dilating or blurring.

``augment=False`` trains the same model without it, for the domain-shift comparison.
"""

import json
import math
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F  # noqa: N812 (PyTorch's convention)

from afterglow_ml.dataset import Split
from afterglow_ml.model import DoodleNet, parameter_count


@dataclass(frozen=True, slots=True)
class TrainConfig:
    epochs: int = 12
    batch: int = 512
    lr: float = 3e-3
    weight_decay: float = 1e-4
    label_smoothing: float = 0.05
    augment: bool = True
    seed: int = 7


def device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def augment(x: torch.Tensor, generator: torch.Generator) -> torch.Tensor:
    """``x``: N x 1 x 28 x 28 in [0, 1], on any device."""
    n = x.shape[0]
    dev = x.device

    def uniform(lo: float, hi: float, *shape: int) -> torch.Tensor:
        return lo + (hi - lo) * torch.rand(*shape, generator=generator).to(dev)

    angle = uniform(-math.radians(12), math.radians(12), n)
    scale = uniform(0.85, 1.15, n)
    stretch = uniform(0.92, 1.08, n)
    shear = uniform(-0.15, 0.15, n)
    shift = uniform(-2 / 14, 2 / 14, n, 2)
    cos = torch.cos(angle)
    sin = torch.sin(angle)
    sx = 1 / (scale * stretch)
    sy = stretch / scale
    theta = torch.stack(
        [
            torch.stack([cos * sx, (-sin + shear) * sx, shift[:, 0]], dim=1),
            torch.stack([sin * sy, cos * sy, shift[:, 1]], dim=1),
        ],
        dim=1,
    )
    grid = F.affine_grid(theta, list(x.shape), align_corners=False)
    # The wobble: random offsets on a 4 x 4 grid, smoothly upsampled, up to about a pixel.
    wobble = uniform(-1, 1, n, 2, 4, 4) * (1.0 / 14)
    grid = grid + F.interpolate(wobble, size=(28, 28), mode="bicubic", align_corners=True).permute(
        0, 2, 3, 1
    )
    out = F.grid_sample(x, grid, mode="bilinear", padding_mode="zeros", align_corners=False)
    # Thicker lines for some, softer for others.
    pick = torch.rand(n, generator=generator).to(dev)
    thick = F.max_pool2d(out, 3, stride=1, padding=1)
    soft = F.avg_pool2d(out, 3, stride=1, padding=1, count_include_pad=False)
    mask_thick = (pick < 0.25).float().view(n, 1, 1, 1)
    mask_soft = ((pick >= 0.25) & (pick < 0.45)).float().view(n, 1, 1, 1)
    out = (
        mask_thick * thick
        + mask_soft * (0.5 * out + 0.5 * soft)
        + (1 - mask_thick - mask_soft) * out
    )
    return out.clamp(0, 1)


def _batches(count: int, size: int, generator: torch.Generator) -> list[torch.Tensor]:
    order = torch.randperm(count, generator=generator)
    return [order[i : i + size] for i in range(0, count, size)]


@torch.no_grad()
def accuracy(model: torch.nn.Module, x: torch.Tensor, y: torch.Tensor, batch: int = 4096) -> float:
    model.eval()
    correct = 0
    for i in range(0, len(y), batch):
        logits = model(x[i : i + batch].float().div(255).unsqueeze(1))
        correct += int((logits.argmax(1) == y[i : i + batch]).sum())
    return correct / len(y)


def train(
    train_split: Split, val_split: Split, classes: int, out_dir: Path, config: TrainConfig
) -> dict[str, object]:
    """Trains, keeps the best validation epoch in ``out_dir/model.pt``, returns the history."""
    torch.manual_seed(config.seed)
    generator = torch.Generator().manual_seed(config.seed)
    dev = device()
    x = torch.from_numpy(train_split.x).to(dev)
    y = torch.from_numpy(train_split.y.astype(np.int64)).to(dev)
    vx = torch.from_numpy(val_split.x).to(dev)
    vy = torch.from_numpy(val_split.y.astype(np.int64)).to(dev)

    model = DoodleNet(classes).to(dev)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=config.lr, weight_decay=config.weight_decay
    )
    steps = config.epochs * math.ceil(len(y) / config.batch)
    schedule = torch.optim.lr_scheduler.OneCycleLR(optimizer, max_lr=config.lr, total_steps=steps)
    loss_fn = torch.nn.CrossEntropyLoss(label_smoothing=config.label_smoothing)

    out_dir.mkdir(parents=True, exist_ok=True)
    history: list[dict[str, float]] = []
    best = -1.0
    started = time.perf_counter()
    for epoch in range(1, config.epochs + 1):
        model.train()
        total = torch.zeros((), device=dev)
        for idx in _batches(len(y), config.batch, generator):
            idx_dev = idx.to(dev)
            xb = x[idx_dev].float().div(255).unsqueeze(1)
            if config.augment:
                xb = augment(xb, generator)
            loss = loss_fn(model(xb), y[idx_dev])
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            schedule.step()
            # Summed on the device: reading the loss every step would wait for the GPU.
            total += loss.detach() * len(idx)
        mean_loss = float(total) / len(y)
        val = accuracy(model, vx, vy)
        history.append(
            {
                "epoch": epoch,
                "loss": mean_loss,
                "val": val,
                "seconds": time.perf_counter() - started,
            }
        )
        print(f"epoch {epoch:2}: loss {mean_loss:.4f}  val {val:.4f}", flush=True)
        if val > best:
            best = val
            torch.save(model.state_dict(), out_dir / "model.pt")
    summary: dict[str, object] = {
        "config": asdict(config),
        "parameters": parameter_count(model),
        "device": str(dev),
        "best_val": best,
        "history": history,
    }
    (out_dir / "train.json").write_text(json.dumps(summary, indent=2) + "\n", "utf-8")
    return summary


def load_model(run_dir: Path, classes: int) -> DoodleNet:
    model = DoodleNet(classes)
    model.load_state_dict(torch.load(run_dir / "model.pt", map_location="cpu", weights_only=True))
    model.eval()
    return model
