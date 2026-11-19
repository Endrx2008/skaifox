/* Copyright (C) 2026 Enrico Miot (EndrX)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
// === SKAI for Firefox — Ollama client (MV2, XMLHttpRequest to get past CORS) ===

// =========================================================
// MODEL CHOICE: the installed model with the most parameters
// (details.parameter_size of /api/tags), like every SKAI tool; the size on
// disk only breaks ties. Sets OLLAMA_MODEL; resolves true when a model was
// found, false when Ollama is unreachable or has no model.
// =========================================================
function parameterCount(model) {
  const text  = String((model.details && model.details.parameter_size) || "").trim();
  const match = /^([\d.]+)\s*([kKmMbBtT])?/.exec(text);
  if (!match) return 0;
  const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(match[2] || "").toLowerCase()] || 1;
  return parseFloat(match[1]) * mult;
}

function pickBiggestModel(models) {
  if (!models.length) return null;
  return models.reduce((a, b) => {
    const pa = parameterCount(a), pb = parameterCount(b);
    if (pb !== pa) return pb > pa ? b : a;
    return (b.size || 0) > (a.size || 0) ? b : a;
  });
}

function loadBiggestModel() {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", OLLAMA_BASE_URL + "/api/tags", true);
    xhr.timeout = OLLAMA_PROBE_TIMEOUT;

    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const models = JSON.parse(xhr.responseText).models || [];
          const chosen = pickBiggestModel(models);
          if (!chosen) {
            console.warn("[SKAI] Ollama has no model installed");
            OLLAMA_MODEL = "";
            resolve(false);
            return;
          }
          OLLAMA_MODEL = chosen.name;
          console.log(`[SKAI] Model: ${OLLAMA_MODEL} (${(chosen.details && chosen.details.parameter_size) || "?"} parameters)`);
          broadcast({ type: "MODEL_LOADED", model: OLLAMA_MODEL });
          resolve(true);
          return;
        } catch(e) {
          console.warn("[SKAI] Unreadable /api/tags:", e.message);
        }
      } else {
        console.warn("[SKAI] /api/tags HTTP", xhr.status);
      }
      resolve(false);
    };

    xhr.onerror   = function() { console.warn("[SKAI] Ollama unreachable"); resolve(false); };
    xhr.ontimeout = function() { console.warn("[SKAI] /api/tags timed out"); resolve(false); };

    xhr.send();
  });
}

// =========================================================
// CHAT
// =========================================================
// The answer being generated now (so that Stop can abort it).
let currentChatXHR = null;

// Stops the answer being generated: the only thing that stops askOllama,
// since there is no automatic timeout.
function abortOllama() {
  if (!currentChatXHR) return false;
  currentChatXHR.abort();
  return true;
}

function askOllama(userMessage, history, onChunk) {
  history = history || [];

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user",   content: userMessage }
  ];

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", OLLAMA_BASE_URL + "/api/chat", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    // 0 → the request never expires: wait for the model as long as needed.
    xhr.timeout = OLLAMA_TIMEOUT;

    currentChatXHR = xhr;

    let rawText = "";
    let lastPos = 0;

    // --- "It is taking long" watchdog ----------------------------------
    // Stops nothing: it counts how long no token has arrived and tells the
    // sidebar, again and again while the model stays silent.
    const startedAt  = Date.now();
    let lastActivity = Date.now();
    let lastNotify   = 0;
    let warned       = false;

    const watchdog = setInterval(function() {
      const now  = Date.now();
      const idle = now - lastActivity;
      if (idle < OLLAMA_SLOW_MS) return;
      if (lastNotify && now - lastNotify < OLLAMA_SLOW_REPEAT_MS) return;
      lastNotify = now;
      warned     = true;
      broadcast({
        type:       "AI_SLOW",
        model:      OLLAMA_MODEL,
        elapsedSec: Math.round((now - startedAt) / 1000),
        idleSec:    Math.round(idle / 1000),
        streaming:  rawText.length > 0
      });
    }, 1000);

    function stopWatchdog() {
      clearInterval(watchdog);
      if (warned) broadcast({ type: "AI_SLOW_END" });
      if (currentChatXHR === xhr) currentChatXHR = null;
    }

    function markActivity() {
      lastActivity = Date.now();
      if (warned) {
        // Writing again: remove the notice and re-arm the watchdog.
        warned     = false;
        lastNotify = 0;
        broadcast({ type: "AI_SLOW_END" });
      }
    }
    // --------------------------------------------------------------------

    xhr.onprogress = function() {
      markActivity();

      const chunk = xhr.responseText.slice(lastPos);
      lastPos = xhr.responseText.length;

      const lines = chunk.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.message && parsed.message.content) {
            rawText += parsed.message.content;
            if (onChunk) onChunk(parsed.message.content, rawText);
          }
        } catch(e) {}
      }
    };

    xhr.onload = function() {
      stopWatchdog();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parseAIResponse(rawText));
      } else {
        reject(new Error("Ollama HTTP " + xhr.status + ": " + xhr.statusText));
      }
    };

    xhr.onerror = function() {
      stopWatchdog();
      const err = new Error(t("errUnreachable"));
      err.unavailable = true;
      reject(err);
    };

    xhr.onabort = function() {
      stopWatchdog();
      const err = new Error(t("stopped"));
      err.aborted = true;
      reject(err);
    };

    // Safety net, in case OLLAMA_TIMEOUT is set above 0 again.
    xhr.ontimeout = function() {
      stopWatchdog();
      reject(new Error(t("errTimeout")));
    };

    xhr.send(JSON.stringify({
      model:   OLLAMA_MODEL,
      messages: messages,
      stream:  true,
      options: { temperature: 0.3, top_p: 0.9 }
    }));
  });
}

// =========================================================
// HEALTH CHECK (used by background.js)
// =========================================================
function checkOllamaHealth() {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", OLLAMA_BASE_URL + "/api/tags", true);
    xhr.timeout = OLLAMA_HEALTH_TIMEOUT;
    xhr.onload    = function() { resolve(xhr.status >= 200 && xhr.status < 300); };
    xhr.onerror   = function() { resolve(false); };
    xhr.ontimeout = function() { resolve(false); };
    xhr.send();
  });
}

// =========================================================
// AI ANSWER PARSER
// =========================================================
function parseAIResponse(raw) {
  const text = raw.trim();
  try { return JSON.parse(text); } catch(e) {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch(e) {} }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) { try { return JSON.parse(braceMatch[0]); } catch(e) {} }
  return {
    decision:  "chat",
    reply:     text || t("notUnderstood"),
    actions:   [],
    reasoning: "fallback"
  };
}
