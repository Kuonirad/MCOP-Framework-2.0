#!/usr/bin/env python3
"""
Back-compat shim — project metadata lives in pyproject.toml (PEP 621).

Kept so that legacy tooling invoking `python setup.py …` still works,
but all build configuration is now managed by setuptools.build_meta.
"""

from setuptools import setup

setup()
