# SkAi — Firefox Plugin

Plugin Firefox con AI agent integrata via Ollama (Qwen2.5).
Parte del progetto **SkAi**.

---

## Struttura del progetto

```
skai-firefox/
├── manifest.json                  ← Manifest WebExtension v2
├── icons/
│   ├── skorpion-16.png
│   ├── skorpion-32.png
│   ├── skorpion-48.png
│   ├── skorpion-96.png
│   └── skorpion-128.png
└── src/
    ├── shared/
    │   ├── constants.js           ← Costanti globali, system prompt, config
    │   └── ollama.js              ← Client REST per Ollama (streaming)
    ├── background/
    │   └── background.js          ← Orchestratore — gestisce toggle sidebar e azioni
    ├── content/
    │   └── content.js             ← Iniettato in ogni pagina
    └── sidebar/
        ├── sidebar.html           ← UI sidebar
        ├── sidebar.css            ← Design SkAi
        └── sidebar.js             ← Logica sidebar
```

---

## Prerequisiti

1. **Firefox 109+** (supporto Manifest v2 + sidebar_action)
2. **Ollama** installato e in esecuzione
3. **Modello Qwen2.5** scaricato:
   ```bash
   ollama pull qwen2.5:14b
   ```
   *(oppure `qwen2.5:7b` per macchine meno potenti)*
4. Ollama deve girare su `localhost:11434` (default)
   - In SkAi questo è gestito automaticamente

---

## Installazione (sviluppo)

1. Apri Firefox e vai su `about:debugging`
2. Clicca **"Questo Firefox"** (o "This Firefox")
3. Clicca **"Carica componente aggiuntivo temporaneo"**
4. Seleziona il file `manifest.json` di questo progetto

### Aprire/chiudere la sidebar
- **Click sull'icona** 🦂 nella toolbar → apre o chiude la sidebar
- Oppure: `Visualizza > Sidebar > SkAi`

---

## Come funziona

### Flusso principale

```
Utente scrive → Sidebar.js → Background.js → Ollama (Qwen2.5)
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

Ollama risponde sempre con un JSON strutturato:

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
  "reasoning": "Cerco info aggiornate sul kernel"
}
```

### Tipi di action supportati

| Action           | Descrizione                              |
|------------------|------------------------------------------|
| `reply_chat`     | Risponde direttamente in chat            |
| `search`         | Cerca su web (Google/DDG/Brave)          |
| `open_tab`       | Apre una URL in nuova tab                |
| `navigate`       | Naviga nella tab corrente                |
| `read_page`      | Legge/riassume una pagina                |
| `close_tab`      | Chiude le tab di un topic                |
| `notify`         | Notifica browser                         |
| `workflow`       | Lista di azioni annidate (pipeline)      |

---

## Configurazione avanzata

Modifica `src/shared/constants.js` per:
- Cambiare modello (`OLLAMA_MODEL`)
- Cambiare porta Ollama (`OLLAMA_BASE_URL`)
- Personalizzare il system prompt (`SYSTEM_PROMPT`)
- Aggiungere motori di ricerca (`SEARCH_ENGINES`)

---

## Changelog

### v1.0.1
- ✅ Aggiunto `browser_action`: click sull'icona apre/chiude la sidebar
- ✅ Fix icona notifiche (`skai-48.svg` → `skorpion-48.png`)
- ✅ Allineato nome modello a `qwen2.5:14b` ovunque
- ✅ Streaming parser rifatto: estrazione `reply` robusta senza regex greedy
- ✅ Manifest: aggiunto `open_at_install: false`

---

## Prossimi step (roadmap)

- [ ] Persistenza storia su `browser.storage.local`
- [ ] Workflow builder visuale
- [ ] Support multi-modello (selettore in UI)
- [ ] RAG locale: indicizzazione pagine visitate
- [ ] Export sessioni di ricerca come markdown
- [ ] Hotkey globale per aprire la sidebar
- [ ] Integrazione con altri servizi SkAi
