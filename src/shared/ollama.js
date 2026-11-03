// === SkAi — CLIENT OLLAMA (MV2, XMLHttpRequest per bypassare CORS) ===

// =========================================================
// SELEZIONE AUTOMATICA DEL MODELLO PIÙ PESANTE
// Chiama /api/tags e ordina per size (byte) discendente.
// Popola OLLAMA_MODEL con il modello più grande installato.
// =========================================================
function loadHeaviestModel() {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", OLLAMA_BASE_URL + "/api/tags", true);
    xhr.timeout = OLLAMA_PROBE_TIMEOUT;

    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data   = JSON.parse(xhr.responseText);
          const models = data.models || [];

          if (models.length === 0) {
            console.warn("[SkAi] Nessun modello trovato in Ollama, uso fallback:", OLLAMA_MODEL);
            resolve();
            return;
          }

          // Ordina per size (byte) decrescente — il più pesante prima
          models.sort((a, b) => (b.size || 0) - (a.size || 0));

          const chosen = models[0];
          OLLAMA_MODEL = chosen.name;

          const sizeMB = chosen.size ? (chosen.size / 1024 / 1024).toFixed(0) + " MB" : "dimensione sconosciuta";
          console.log(`[SkAi] Modello selezionato: ${OLLAMA_MODEL} (${sizeMB})`);
          console.log("[SkAi] Modelli disponibili:", models.map(m => `${m.name} (${(m.size/1024/1024).toFixed(0)} MB)`).join(", "));

          broadcast({ type: "MODEL_LOADED", model: OLLAMA_MODEL, sizeMB });
        } catch(e) {
          console.warn("[SkAi] Errore parsing /api/tags:", e.message, "— uso fallback:", OLLAMA_MODEL);
        }
      } else {
        console.warn("[SkAi] /api/tags HTTP", xhr.status, "— uso fallback:", OLLAMA_MODEL);
      }
      resolve();
    };

    xhr.onerror   = function() { console.warn("[SkAi] Ollama non raggiungibile, uso fallback:", OLLAMA_MODEL); resolve(); };
    xhr.ontimeout = function() { console.warn("[SkAi] Timeout /api/tags, uso fallback:", OLLAMA_MODEL); resolve(); };

    xhr.send();
  });
}

// =========================================================
// CHAT
// =========================================================
// Richiesta di generazione attualmente in corso (per l'interruzione manuale).
let currentChatXHR = null;

// Interrompe la generazione in corso — l'unica cosa che può fermare askOllama,
// visto che non c'è più nessun timeout automatico.
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
    // 0 → la richiesta non scade mai: aspettiamo il modello quanto serve.
    xhr.timeout = OLLAMA_TIMEOUT;

    currentChatXHR = xhr;

    let rawText = "";
    let lastPos = 0;

    // --- Watchdog "ci sta mettendo molto" -------------------------------
    // Non interrompe niente: conta solo da quanto tempo non arriva un token
    // e manda un avviso alla sidebar, ripetendolo finché resta fermo.
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
        // Riprende a produrre: togli l'avviso e riarma il watchdog.
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
      reject(new Error("Ollama non raggiungibile su localhost:11434"));
    };

    xhr.onabort = function() {
      stopWatchdog();
      reject(new Error("Generazione interrotta"));
    };

    // Resta come rete di sicurezza se OLLAMA_TIMEOUT viene rimesso a > 0.
    xhr.ontimeout = function() {
      stopWatchdog();
      reject(new Error("Timeout: Ollama non risponde"));
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
// HEALTH CHECK (usato da background.js)
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
// PARSER RISPOSTA AI
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
    reply:     text || "Non ho capito la richiesta.",
    actions:   [],
    reasoning: "fallback"
  };
}
