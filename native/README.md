# skaifox-memory — SKAI for Firefox and SKAI_ Memory

SKAI_ Memory (`/var/lib/skai/SKAI_ Memory`, installed with **sk_notes**) is the memory shared by every SKAI
app. A Firefox add-on cannot read files on its own, so it uses this small program, a *native messaging
host*: Firefox starts it when the add-on `skai@skorpion` needs the memory.

* **Before an answer:** SKAI looks up what the other SKAI apps know about your message and gives it to the model.
* **After an answer:** a short record of the exchange is kept in `plugins/skaifox/chat-<date>.md`.
  Like every SKAI app, skaifox can change only its own notes (`plugins/skaifox.md`, `plugins/skaifox/`).

| File | Installed as |
|---|---|
| `skaifox-memory-host` | `/usr/lib/skai/skaifox-memory-host` |
| `skaifox_memory.json` | `/usr/lib/mozilla/native-messaging-hosts/skaifox_memory.json` |

Install: the `skaifox-memory_<version>_all.deb` of the release (Debian), `packaging/arch/PKGBUILD` (Arch), or
`sudo sh native/install.sh` from a checkout. To write in the memory the user must be in the group `skai`
(`sudo usermod -aG skai <user>`, then log in again). Without the host or without sk_notes the add-on works
exactly as before, just without the shared memory.

Protocol (one request, one answer): `{"op":"ping"}`, `{"op":"recall","query":…}` → `{"text":…}`,
`{"op":"remember","question":…,"reply":…}` → `{"saved":true|false}`.
