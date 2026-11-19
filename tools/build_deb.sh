#!/bin/sh
# Copyright (C) 2026 Enrico Miot (EndrX)
# Licensed under GNU GPL v3 or later — see the LICENSE file or <https://www.gnu.org/licenses/>
# SPDX-License-Identifier: GPL-3.0-or-later
# Build dist/skaifox-memory_<version>_all.deb: the program that lets SKAI for Firefox use SKAI_ Memory.
# Installs /usr/lib/skai/skaifox-memory-host and its Firefox manifest in /usr/lib/mozilla/native-messaging-hosts.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
VERSION=$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')
STAGE="$ROOT/build/deb/skaifox-memory_${VERSION}_all"
rm -rf "$STAGE"
install -d -m 755 "$STAGE/DEBIAN" "$STAGE/usr/lib/skai" "$STAGE/usr/lib/mozilla/native-messaging-hosts" \
                  "$STAGE/usr/share/doc/skaifox-memory"
install -m 755 native/skaifox-memory-host "$STAGE/usr/lib/skai/"
install -m 644 native/skaifox_memory.json "$STAGE/usr/lib/mozilla/native-messaging-hosts/"
install -m 644 native/README.md "$STAGE/usr/share/doc/skaifox-memory/"
cat > "$STAGE/usr/share/doc/skaifox-memory/copyright" <<TXT
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: skaifox
Upstream-Contact: Enrico Miot (EndrX)

Files: *
Copyright: 2026 Enrico Miot
License: GPL-3.0-or-later
 On Debian systems the full text is in /usr/share/common-licenses/GPL-3.
TXT
SIZE=$(du -sk "$STAGE/usr" | cut -f1)
cat > "$STAGE/DEBIAN/control" <<CTL
Package: skaifox-memory
Version: $VERSION
Section: web
Priority: optional
Architecture: all
Installed-Size: $SIZE
Depends: python3 (>= 3.9)
Recommends: sk-notes (>= 0.5.0), firefox-esr | firefox
Maintainer: Enrico Miot (EndrX) <maintainer@localhost>
Homepage: https://github.com/Endrx2008/skaifox
Description: SKAI for Firefox - access to SKAI_ Memory
 Small native messaging host that lets the Firefox add-on SKAI for Firefox
 (skai@skorpion) read SKAI_ Memory, the memory shared by every SKAI app of
 Skorpion OS, and keep its own notes there. The memory itself comes with
 sk_notes; writing needs the user to be in the group 'skai'.
CTL
find "$STAGE" -type d -exec chmod 755 {} +
chmod 644 "$STAGE/usr/share/doc/skaifox-memory/copyright"
mkdir -p "$ROOT/dist"
fakeroot dpkg-deb --build -Zxz "$STAGE" "$ROOT/dist/skaifox-memory_${VERSION}_all.deb" >/dev/null
echo "built dist/skaifox-memory_${VERSION}_all.deb"
