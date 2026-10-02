"""The doodle classifier: a small CNN on 28x28 images in [0, 1] (ADR 0015).

Three 3x3 convolution blocks (32, 64, 96 channels, each halving the image) and two dense
layers: about 190k parameters, under 1 MB as float32 and about a quarter of that
quantized to int8.
"""

import torch
from torch import nn


class DoodleNet(nn.Module):
    def __init__(self, classes: int) -> None:
        super().__init__()

        def block(c_in: int, c_out: int) -> nn.Sequential:
            return nn.Sequential(
                nn.Conv2d(c_in, c_out, 3, padding=1, bias=False),
                nn.BatchNorm2d(c_out),
                nn.ReLU(),
                nn.MaxPool2d(2),
            )

        self.features = nn.Sequential(block(1, 32), block(32, 64), block(64, 96))
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(96 * 3 * 3, 128),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """``x``: N x 1 x 28 x 28 in [0, 1]. Returns logits, N x classes."""
        out: torch.Tensor = self.head(self.features(x))
        return out


def parameter_count(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())
