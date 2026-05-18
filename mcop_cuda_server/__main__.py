"""Run as ``python -m mcop_cuda_server``."""

from __future__ import annotations

import sys

from .server import main


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
