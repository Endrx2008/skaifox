# skaifox — SKAI for Firefox

A Firefox add-on of [Skorpion OS](https://github.com/Endrx2008/skorpion_os): **SKAI** in a sidebar that
can search the web, open and read pages and run small workflows of tabs for you.
*Italiano: [README.it.md](README.it.md).*

## Install

Download `skai@skorpion.xpi` from the [latest release](https://github.com/Endrx2008/skaifox/releases/latest)
(signed by Mozilla), then in Firefox open **Add-ons and themes → gear icon → Install Add-on From File**
and select it. Needs Firefox 109 or newer.

Open or close the sidebar with the 🦂 button in the toolbar, or **View → Sidebar → SKAI**. The
sidebar speaks Firefox's language (English or Italian); SKAI answers in the language you write in.

## How it works

You write in the sidebar; SKAI answers with a JSON action that the add-on checks and runs:

| Action | Does |
|---|---|
| `reply_chat` | answers in the chat |
| `search` | searches Google, DuckDuckGo or Brave in a new tab |
| `open_tab` / `navigate` | opens a site in a new tab / in the current one |
| `read_page` | reads and summarises a page |
| `close_tab` | closes the tabs of a topic |
| `notify` | shows a notification |
| `workflow` | several of the above, one after the other |

Tabs opened by SKAI are grouped by topic (at most 10).

## SKAI

The add-on talks to the local Ollama (`http://localhost:11434`) and uses the installed model with the most
parameters. Without Ollama or a model the sidebar shows the same "AI features are disabled" message as
every SKAI tool. There is no time limit on an answer: a slow model only gets a notice and a **Stop** button.
Nothing leaves the computer except the searches and pages you or SKAI open. In Skorpion OS Ollama and its
model come from the SKAI setup wizard, and SKAI Manager (Alt + F9) changes them.

## Development

Load the source without packing it: `about:debugging` → **This Firefox** → **Load Temporary Add-on** →
`manifest.json` of this repository.

```sh
python3 tools/build_xpi.py      # → dist/skai@skorpion.xpi (unsigned)
```

Regular Firefox installs only add-ons signed by Mozilla: the release `.xpi` is the signed one (for
example `npx web-ext sign --channel=unlisted` with your addons.mozilla.org API keys).

| Path | What it is |
|---|---|
| `manifest.json` | WebExtension manifest (version 2) |
| `src/shared/constants.js` | Ollama address, timeouts, system prompt, search engines |
| `src/shared/ollama.js` | Ollama client (model choice, streaming) |
| `src/background/background.js` | runs the actions, keeps the history |
| `src/content/content.js` | reads the pages |
| `src/sidebar/` | the sidebar |
| `_locales/en`, `_locales/it` | the texts of the add-on |
| `tools/build_xpi.py` | builds the `.xpi` |

## License

GPL-3.0-or-later, see [LICENSE](LICENSE). © 2026 Enrico Miot (EndrX), founder and maintainer of Skorpion OS.
