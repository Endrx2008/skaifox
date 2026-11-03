# SkAi — Firefox Plugin

Firefox plugin with an integrated AI agent via Ollama (Qwen2.5).
Part of the **SkAi** project.

---

## Project structure

```
skai-firefox/
├── manifest.json                  ← WebExtension Manifest v2
├── icons/
│   ├── skorpion-16.png
│   ├── skorpion-32.png
│   ├── skorpion-48.png
│   ├── skorpion-96.png
│   └── skorpion-128.png
└── src/
    ├── shared/
    │   ├── constants.js           ← Global constants, system prompt, config
    │   └── ollama.js              ← REST client for Ollama (streaming)
    ├── background/
    │   └── background.js          ← Orchestrator — handles sidebar toggle and actions
    ├── content/
    │   └── content.js             ← Injected into every page
    └── sidebar/
        ├── sidebar.html           ← Sidebar UI
        ├── sidebar.css            ← SkAi design
        └── sidebar.js             ← Sidebar logic
```

---

## Requirements

1. **Firefox 109+** (Manifest v2 + sidebar_action support)
2. **Ollama** installed and running
3. **Qwen2.5 model** downloaded:
   ```bash
   ollama pull qwen2.5:14b
   ```
   *(or `qwen2.5:7b` for less powerful machines)*
4. Ollama must run on `localhost:11434` (default)
   - In SkAi this is handled automatically

---

## Installation (development)

1. Open Firefox and go to `about:debugging`
2. Click **"This Firefox"**
3. Click **"Load Temporary Add-on"**
4. Select this project's `manifest.json` file

### Opening/closing the sidebar
- **Click the icon** 🦂 in the toolbar → opens or closes the sidebar
- Or: `View > Sidebar > SkAi`

---

## How it works

### Main flow

```
User types → Sidebar.js → Background.js → Ollama (Qwen2.5)
                                 ↓
                        JSON action response
                                 ↓
                       Action Router (switch)
                                 ↓
          ┌──────────────────────────────────┐
          │  reply_chat  search  open_tab     │
          │  navigate    read_page  workflow  │
          └──────────────────────────────────┘
```

### JSON Actions

Ollama always replies with a structured JSON:

```json
{
  "decision": "search",
  "reply": null,
  "actions": [
    {
      "type": "search",
      "query": "Linux kernel 6.8 release notes",
      "engine": "ddg",
      "topic": "linux-kernel",
      "new_tab": true,
      "read_after": true
    }
  ],
  "reasoning": "Searching for up-to-date info on the kernel"
}
```

### Supported action types

| Action           | Description                              |
|------------------|------------------------------------------|
| `reply_chat`     | Replies directly in chat                 |
| `search`         | Searches the web (Google/DDG/Brave)      |
| `open_tab`       | Opens a URL in a new tab                 |
| `navigate`       | Navigates in the current tab             |
| `read_page`      | Reads/summarizes a page                  |
| `close_tab`      | Closes the tabs of a topic               |
| `notify`         | Browser notification                     |
| `workflow`       | List of nested actions (pipeline)        |

---

## Advanced configuration

Edit `src/shared/constants.js` to:
- Change the model (`OLLAMA_MODEL`)
- Change the Ollama port (`OLLAMA_BASE_URL`)
- Customize the system prompt (`SYSTEM_PROMPT`)
- Add search engines (`SEARCH_ENGINES`)

---
