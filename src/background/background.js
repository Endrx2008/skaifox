// === SkAi — BACKGROUND SCRIPT (orchestratore) ===
// Manifest v2 — no ES modules
// constants.js e ollama.js sono caricati prima di questo file dal manifest

const state = {
  history:     [],
  sessions:    {},
  status:      STATUS.IDLE,
  ollamaReady: false
};

// =========================================================
// TOGGLE SIDEBAR — click sull'icona del plugin
// =========================================================
browser.browserAction.onClicked.addListener(async () => {
  try {
    await browser.sidebarAction.toggle();
  } catch (e) {
    browser.sidebarAction.open();
  }
});

// =========================================================
// INIT — seleziona il modello più pesante, poi verifica Ollama
// =========================================================
async function init() {
  await loadHeaviestModel();
  state.ollamaReady = await checkOllamaHealth();
  console.log(`[SkAi] Ollama ${state.ollamaReady ? "✓ online" : "✗ offline"} — modello: ${OLLAMA_MODEL}`);
  broadcastStatus();
}
init();

// =========================================================
// MESSAGE ROUTER
// =========================================================
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "USER_MESSAGE":
      handleUserMessage(msg.text, msg.pageContext)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
    case "GET_STATUS":
      sendResponse({ status: state.status, ollamaReady: state.ollamaReady, model: OLLAMA_MODEL });
      return false;
    case "GET_HISTORY":
      sendResponse({ history: state.history });
      return false;
    case "CLEAR_HISTORY":
      state.history = [];
      sendResponse({ ok: true });
      return false;
    case "GET_SESSIONS":
      sendResponse({ sessions: state.sessions });
      return false;
    case "CLOSE_SESSION":
      closeSession(msg.topic).then(sendResponse);
      return true;
    case "CHECK_OLLAMA":
      checkOllamaHealth().then(ok => {
        state.ollamaReady = ok;
        sendResponse({ ok });
      });
      return true;
    case "RELOAD_MODEL":
      // Ri-seleziona il modello più pesante (utile se l'utente ha pullato nuovi modelli)
      loadHeaviestModel().then(() => sendResponse({ model: OLLAMA_MODEL }));
      return true;
    case "GET_MODEL":
      sendResponse({ model: OLLAMA_MODEL });
      return false;
    case "STOP_GENERATION":
      sendResponse({ stopped: abortOllama() });
      return false;
  }
});

// =========================================================
// GESTIONE MESSAGGI UTENTE
// =========================================================
async function handleUserMessage(text, pageContext = null) {
  if (!state.ollamaReady) {
    state.ollamaReady = await checkOllamaHealth();
    if (!state.ollamaReady) throw new Error("Ollama non raggiungibile su localhost:11434");
  }
  setStatus(STATUS.THINKING);
  const enrichedText = pageContext
    ? `[Pagina corrente: "${pageContext.title}" — ${pageContext.url}]\n\n${text}`
    : text;
  let streamBuffer = "";
  const onChunk = (chunk, full) => {
    streamBuffer = full;
    broadcast({ type: "AI_STREAM_CHUNK", chunk, full });
  };
  let aiResponse;
  try {
    aiResponse = await askOllama(enrichedText, state.history, onChunk);
  } catch (err) {
    const aborted = err.message === "Generazione interrotta";
    setStatus(aborted ? STATUS.IDLE : STATUS.ERROR);
    broadcast({ type: "AI_ERROR", message: err.message, aborted });
    throw err;
  }
  state.history.push({ role: "user",      content: text });
  state.history.push({ role: "assistant", content: streamBuffer });
  if (state.history.length > 40) state.history = state.history.slice(-40);
  const results = await executeActions(aiResponse);
  setStatus(STATUS.DONE);
  return { aiResponse, results };
}

// =========================================================
// ACTION EXECUTOR
// =========================================================
async function executeActions(aiResp) {
  const results = [];
  const actions = aiResp.actions ?? [];
  if (aiResp.decision === "chat" && aiResp.reply) {
    actions.unshift({ type: "reply_chat", text: aiResp.reply });
  }
  for (const action of actions) {
    try {
      const result = await executeAction(action);
      results.push({ action, result, ok: true });
    } catch (err) {
      results.push({ action, error: err.message, ok: false });
      broadcast({ type: "ACTION_ERROR", action, error: err.message });
    }
  }
  broadcast({ type: "ACTIONS_DONE", results, decision: aiResp.decision });
  return results;
}

async function executeAction(action) {
  switch (action.type) {
    case "reply_chat":
      broadcast({ type: "CHAT_REPLY", text: action.text });
      return { replied: true };

    case "open_tab": {
      setStatus(STATUS.SEARCHING);
      const tab = await browser.tabs.create({ url: action.url, active: false });
      registerTabInSession(action.topic ?? "generale", tab.id);
      broadcast({ type: "TAB_OPENED", tabId: tab.id, url: action.url, topic: action.topic });
      return { tabId: tab.id };
    }

    case "search": {
      setStatus(STATUS.SEARCHING);
      const engine = SEARCH_ENGINES[action.engine ?? "ddg"];
      const url    = engine + encodeURIComponent(action.query);
      const tab    = await browser.tabs.create({ url, active: false });
      registerTabInSession(action.topic ?? action.query, tab.id);
      broadcast({ type: "SEARCH_STARTED", query: action.query, tabId: tab.id, topic: action.topic });
      if (action.read_after) {
        await waitForTabLoad(tab.id);
        const content = await readTabContent(tab.id);
        broadcast({ type: "PAGE_READ", tabId: tab.id, content });
      }
      return { tabId: tab.id, url };
    }

    case "navigate": {
      const tabId = action.tab_id ?? (await getActiveTabId());
      await browser.tabs.update(tabId, { url: action.url });
      return { tabId, url: action.url };
    }

    case "read_page": {
      setStatus(STATUS.READING);
      const tabId   = action.tab_id ?? (await getActiveTabId());
      const content = await readTabContent(tabId);
      if (action.summarize) {
        const summary = await askOllama(
          `Riassumi questo contenuto in modo conciso:\n\n${content.text.slice(0, 4000)}`
        );
        broadcast({ type: "PAGE_SUMMARY", tabId, summary: summary.reply ?? content.text });
      } else {
        broadcast({ type: "PAGE_READ", tabId, content });
      }
      return { tabId, length: content.text?.length };
    }

    case "close_tab":
      await closeSession(action.topic);
      return { closed: action.topic };

    case "notify":
      await browser.notifications.create({
        type:    "basic",
        iconUrl: browser.runtime.getURL("icons/skorpion-48.png"),
        title:   action.title ?? "SkAi",
        message: action.message
      });
      return { notified: true };

    case "workflow":
      for (const step of action.steps ?? []) await executeAction(step);
      return { steps: action.steps?.length };

    default:
      console.warn(`[SkAi] Action sconosciuta: ${action.type}`);
      return { unknown: action.type };
  }
}

// =========================================================
// UTILITIES
// =========================================================
function registerTabInSession(topic, tabId) {
  if (!state.sessions[topic]) state.sessions[topic] = [];
  if (state.sessions[topic].length >= MAX_AI_TABS) return;
  state.sessions[topic].push(tabId);
  broadcast({ type: "SESSION_UPDATED", sessions: state.sessions });
}

async function closeSession(topic) {
  const tabIds = state.sessions[topic] ?? [];
  for (const id of tabIds) { try { await browser.tabs.remove(id); } catch {} }
  delete state.sessions[topic];
  broadcast({ type: "SESSION_UPDATED", sessions: state.sessions });
  return { closed: tabIds.length };
}

async function getActiveTabId() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 15000);
  });
}

async function readTabContent(tabId) {
  try {
    const results = await browser.tabs.executeScript(tabId, {
      code: `({
        title: document.title,
        url:   location.href,
        text:  document.body ? document.body.innerText.slice(0, 8000) : ""
      })`
    });
    return results[0] ?? { title: "", url: "", text: "" };
  } catch {
    return { title: "", url: "", text: "" };
  }
}

function setStatus(s) { state.status = s; broadcastStatus(); }
function broadcastStatus() {
  broadcast({ type: "STATUS_CHANGED", status: state.status, ollamaReady: state.ollamaReady, model: OLLAMA_MODEL });
}
function broadcast(msg) { browser.runtime.sendMessage(msg).catch(() => {}); }
