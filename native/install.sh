#!/bin/sh
# Copyright (C) 2026 Enrico Miot (EndrX)
# SPDX-License-Identifier: GPL-3.0-or-later
# Install the SKAI_ Memory host for SKAI for Firefox from a checkout (the .deb / PKGBUILD do the same).
# Run as root: sudo sh native/install.sh
set -eu
[ "$(id -u)" = 0 ] || { echo "run as root: sudo sh native/install.sh" >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
install -D -m 0755 "$here/skaifox-memory-host" /usr/lib/skai/skaifox-memory-host
install -D -m 0644 "$here/skaifox_memory.json" /usr/lib/mozilla/native-messaging-hosts/skaifox_memory.json
echo "done. SKAI_ Memory itself comes with sk_notes; to write, the user must be in the group 'skai'."
