// === SkAi — COSTANTI GLOBALI (MV2, no export) ===

const OLLAMA_BASE_URL = "http://localhost:11434";

// 0 = NESSUN timeout sulla generazione: la richiesta non viene mai abortita,
// il modello può metterci quanto vuole. L'utente viene solo avvisato.
const OLLAMA_TIMEOUT  = 0;

// Dopo quanti ms di SILENZIO (nessun token ricevuto) avvisare che è lento.
const OLLAMA_SLOW_MS        = 25000;
// Ogni quanto ripetere l'avviso se continua a non arrivare nulla.
const OLLAMA_SLOW_REPEAT_MS = 30000;

// Timeout delle sole probe rapide (lista modelli / health check): hanno un
// fallback e non bloccano nulla, ma vanno larghe o Ollama sotto carico
// (modello pesante in caricamento) risulta erroneamente "non raggiungibile".
const OLLAMA_PROBE_TIMEOUT  = 15000;
const OLLAMA_HEALTH_TIMEOUT = 10000;

const MAX_AI_TABS     = 10;

// Popolato automaticamente da loadHeaviestModel() all'avvio:
// legge /api/tags da Ollama e seleziona il modello con size più alta.
let OLLAMA_MODEL = "qwen2.5:14b";   // fallback se Ollama non è raggiungibile

const SYSTEM_PROMPT = `
Sei SkAi, un agente browser intelligente integrato in Firefox.
Rispondi SEMPRE e SOLO con un oggetto JSON valido. Mai testo libero.

Struttura della risposta:
{
  "decision": "chat" | "search" | "navigate" | "multi_search" | "read_page" | "workflow",
  "reply": "testo da mostrare in chat (se decision=chat)",
  "actions": [ ... lista di azioni da eseguire ... ],
  "reasoning": "breve spiegazione del perché hai scelto questa action (max 20 parole)"
}

Tipi di action disponibili:
- { "type": "open_tab",   "url": "...", "topic": "..." }
- { "type": "search",     "query": "...", "engine": "google"|"ddg"|"brave", "topic": "...", "new_tab": true }
- { "type": "navigate",   "url": "...", "tab_id": null }
- { "type": "read_page",  "tab_id": null, "summarize": true }
- { "type": "close_tab",  "topic": "..." }
- { "type": "reply_chat", "text": "..." }
- { "type": "notify",     "title": "...", "message": "..." }
- { "type": "workflow",   "steps": [ ...nested actions... ] }

Regole:
1. Se la domanda richiede info aggiornate o specifiche → usa search o navigate
2. Se la domanda è concettuale e puoi rispondere → usa chat
3. Per ricerche complesse → usa multi_search con più tab per argomenti diversi
4. Apri tab separate per argomenti distinti (mai tutto in una tab)
5. Il campo "topic" serve come etichetta leggibile per la tab
`;

const SEARCH_ENGINES = {
  google: "https://www.google.com/search?q=",
  ddg:    "https://duckduckgo.com/?q=",
  brave:  "https://search.brave.com/search?q="
};

const STATUS = {
  IDLE:      "idle",
  THINKING:  "thinking",
  SEARCHING: "searching",
  READING:   "reading",
  DONE:      "done",
  ERROR:     "error"
};
