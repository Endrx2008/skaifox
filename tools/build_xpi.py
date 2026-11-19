#!/usr/bin/env python3
# Copyright (C) 2026 Enrico Miot (EndrX)
# Licensed under GNU GPL v3 or later — see the LICENSE file or <https://www.gnu.org/licenses/>
# SPDX-License-Identifier: GPL-3.0-or-later
"""python3 tools/build_xpi.py [outdir] -> skai@skorpion.xpi (unsigned; Mozilla signs it for release)"""
import sys, zipfile
from pathlib import Path
root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1] if len(sys.argv) > 1 else root / "dist"); out.mkdir(parents=True, exist_ok=True)
target = out / "skai@skorpion.xpi"
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
    for top in ("manifest.json", "LICENSE", "icons", "src", "_locales"):
        path = root / top
        for f in sorted([path] if path.is_file() else path.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(root).as_posix())
print("built", target)
