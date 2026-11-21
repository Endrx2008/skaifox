/* Copyright (C) 2026 Enrico Miot (EndrX)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
// === SKAI for Firefox — global constants (MV2, no modules) ===

const OLLAMA_BASE_URL = "http://localhost:11434";

// 0 = NO timeout on the answer: the request is never aborted, the model may
// take as long as it needs. The user only gets a notice (and a Stop button).
const OLLAMA_TIMEOUT  = 0;

// After this many ms of SILENCE (no token received) tell the user it is slow.
const OLLAMA_SLOW_MS        = 25000;
// Repeat the notice this often while nothing arrives.
const OLLAMA_SLOW_REPEAT_MS = 30000;

// Timeouts of the quick probes only (model list / health check). Generous,
// or an Ollama busy loading a big model would look "unreachable".
const OLLAMA_PROBE_TIMEOUT  = 15000;
const OLLAMA_HEALTH_TIMEOUT = 10000;

const MAX_AI_TABS     = 10;

// Set at start-up by loadBiggestModel(): the installed model with the most
// parameters (details.parameter_size of /api/tags), like every SKAI tool.
// Empty while no model is known.
let OLLAMA_MODEL = "";

const SYSTEM_PROMPT = `
You are SKAI, the browser agent of Skorpion OS, built into Firefox.
ALWAYS answer with ONE valid JSON object and nothing else. Never plain text.

Shape of the answer:
{
  "decision": "chat" | "search" | "navigate" | "multi_search" | "read_page" | "workflow",
  "reply": "text to show in the chat (when decision is chat)",
  "actions": [ ... list of actions to run ... ],
  "reasoning": "why you chose these actions (at most 20 words)"
}

Available actions:
- { "type": "open_tab",   "url": "...", "topic": "..." }
- { "type": "search",     "query": "...", "engine": "google"|"ddg"|"brave", "topic": "...", "new_tab": true }
- { "type": "navigate",   "url": "...", "tab_id": null }
- { "type": "read_page",  "tab_id": null, "summarize": true }
- { "type": "close_tab",  "topic": "..." }
- { "type": "reply_chat", "text": "..." }
- { "type": "notify",     "title": "...", "message": "..." }
- { "type": "workflow",   "steps": [ ...nested actions... ] }

Rules:
1. If the question needs up-to-date or specific information, use search or navigate.
2. If it is a question you can answer yourself, use chat.
3. For complex research use multi_search: one search action per subject.
4. Open separate tabs for separate subjects (never everything in one tab).
5. "topic" is a short readable label for the tab.
6. Write "reply" and every text for the user in the language the user writes in.
`;

const SEARCH_ENGINES = {
  google: "https://www.google.com/search?q=",
  ddg:    "https://duckduckgo.com/?q=",
  brave:  "https://search.brave.com/search?q="
};
const DEFAULT_SEARCH_ENGINE = "ddg";
// Names models use for the same engines.
const SEARCH_ENGINE_ALIASES = {
  duckduckgo: "ddg", "duck duck go": "ddg", duck: "ddg",
  "google.com": "google", "brave search": "brave", "search.brave.com": "brave", "duckduckgo.com": "ddg"
};

const STATUS = {
  IDLE:      "idle",
  THINKING:  "thinking",
  SEARCHING: "searching",
  READING:   "reading",
  DONE:      "done",
  ERROR:     "error"
};

// Shorthand for the add-on's translations (_locales/<lang>/messages.json).
function t(key, ...subs) {
  return browser.i18n.getMessage(key, subs.map(String)) || key;
}
