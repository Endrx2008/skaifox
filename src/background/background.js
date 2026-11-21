/* Copyright (C) 2026 Enrico Miot (EndrX)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
// === SKAI for Firefox — background script (runs the actions) ===
// Manifest v2, no ES modules: the manifest loads constants.js and ollama.js first.

const state = {
  history:     [],
  sessions:    {},
  status:      STATUS.IDLE,
  ollamaReady: false
};

// =========================================================
// TOGGLE SIDEBAR: click on the toolbar button
// =========================================================
browser.browserAction.onClicked.addListener(async () => {
  try {
    await browser.sidebarAction.toggle();
  } catch (e) {
    browser.sidebarAction.open();
  }
});

// =========================================================
// INIT: the AI is ready only when Ollama answers AND has a model
// =========================================================
async function refreshAI() {
  const hasModel = await loadBiggestModel();
  state.ollamaReady = hasModel && await checkOllamaHealth();
  return state.ollamaReady;
}

async function init() {
  await refreshAI();
  console.log(`[SKAI] Ollama ${state.ollamaReady ? "✓ ready" : "✗ unavailable"} — model: ${OLLAMA_MODEL || "none"}`);
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
      refreshAI().then(ok => sendResponse({ ok }));
      return true;
    case "RELOAD_MODEL":
      // Choose the model again (useful after the user installed another one)
      refreshAI().then(() => sendResponse({ model: OLLAMA_MODEL }));
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
// USER MESSAGES
// =========================================================
async function handleUserMessage(text, pageContext = null) {
  if (!state.ollamaReady && !(await refreshAI())) {
    broadcast({ type: "AI_ERROR", message: t("aiUnavailable"), unavailable: true });
    const err = new Error(t("aiUnavailable"));
    err.unavailable = true;
    throw err;
  }
  setStatus(STATUS.THINKING);
  let enrichedText = pageContext
    ? `[Current page: "${pageContext.title}" — ${pageContext.url}]\n\n${text}`
    : text;
  // SKAI_ Memory: what the other SKAI apps know about this message (memory.js; "" without the memory).
  // Added to this message only, never to the history.
  const memoryContext = await skaiMemoryRecall(text);
  if (memoryContext) enrichedText += `\n\n[${memoryContext}]`;
  let streamBuffer = "";
  const onChunk = (chunk, full) => {
    streamBuffer = full;
    broadcast({ type: "AI_STREAM_CHUNK", chunk, full });
  };
  let aiResponse;
  try {
    aiResponse = await askOllama(enrichedText, state.history, onChunk);
  } catch (err) {
    const aborted = Boolean(err.aborted);
    if (err.unavailable) state.ollamaReady = false;
    setStatus(aborted ? STATUS.IDLE : STATUS.ERROR);
    broadcast({ type: "AI_ERROR", message: err.message, aborted, unavailable: Boolean(err.unavailable) });
    throw err;
  }
  state.history.push({ role: "user",      content: text });
  state.history.push({ role: "assistant", content: streamBuffer });
  if (state.history.length > 40) state.history = state.history.slice(-40);
  const results = await executeActions(aiResponse);
  setStatus(STATUS.DONE);
  // Keep the exchange in SKAI_ Memory (in the background: the answer is already on screen).
  skaiMemoryRemember(text, describeForMemory(aiResponse, results));
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
      const url = webUrl(action.url, action.engine);
      const tab = await browser.tabs.create({ url, active: false });
      registerTabInSession(action.topic ?? t("generalTopic"), tab.id);
      broadcast({ type: "TAB_OPENED", tabId: tab.id, url, topic: action.topic });
      return { tabId: tab.id, url };
    }

    case "search": {
      setStatus(STATUS.SEARCHING);
      const url    = searchUrl(action.query, action.engine);
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
      const url   = webUrl(action.url, action.engine);
      await browser.tabs.update(tabId, { url });
      return { tabId, url };
    }

    case "read_page": {
      setStatus(STATUS.READING);
      const tabId   = action.tab_id ?? (await getActiveTabId());
      const content = await readTabContent(tabId);
      const page    = { tabId, title: content.title || "", url: content.url || "", length: content.text?.length ?? 0 };
      if (!content.text) throw new Error(t("errReadPage"));
      if (action.summarize) {
        const answer = await askOllama(
          `Summarize this content concisely, in the language of the content:\n\n${content.text.slice(0, 4000)}`
        );
        page.summary = summaryText(answer) || content.text.slice(0, 1500);
        broadcast({ type: "PAGE_SUMMARY", tabId, summary: page.summary });
      } else {
        page.excerpt = content.text.replace(/\s+/g, " ").trim().slice(0, 600);
        broadcast({ type: "PAGE_READ", tabId, content });
      }
      return page;
    }

    case "close_tab":
      await closeSession(action.topic);
      return { closed: action.topic };

    case "notify":
      await browser.notifications.create({
        type:    "basic",
        iconUrl: browser.runtime.getURL("icons/skorpion-48.png"),
        title:   action.title ?? "SKAI",
        message: action.message
      });
      return { notified: true };

    case "workflow": {
      const steps = [];
      for (const step of action.steps ?? []) {
        steps.push({ action: step, result: await executeAction(step), ok: true });
      }
      return { steps };
    }

    default:
      console.warn(`[SKAI] Unknown action: ${action.type}`);
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

/** The search page for `query` on `engine` (unknown or missing engine: the default one, never "undefined..."). */
function searchUrl(query, engine) {
  const q = String(query ?? "").trim();
  if (!q) throw new Error(t("errNoQuery"));
  const name = String(engine ?? "").trim().toLowerCase();
  const key  = SEARCH_ENGINES[name] ? name : (SEARCH_ENGINE_ALIASES[name] ?? DEFAULT_SEARCH_ENGINE);
  return SEARCH_ENGINES[key] + encodeURIComponent(q);
}

/** A URL a tab can open: http(s) as given, "example.org/x" with https://, anything else searched for. */
function webUrl(url, engine) {
  const u = String(url ?? "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/\S*)?$/i.test(u)) return "http://" + u;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(u)) return "https://" + u;
  return searchUrl(u, engine);
}

/** The text of a summary answer: models reply in "reply", in a reply_chat action, or not in JSON at all. */
function summaryText(answer) {
  if (!answer) return "";
  if (answer.reply) return String(answer.reply);
  const chat = (answer.actions || []).find(a => a && a.type === "reply_chat" && a.text);
  return chat ? String(chat.text) : "";
}

function setStatus(s) { state.status = s; broadcastStatus(); }
function broadcastStatus() {
  broadcast({ type: "STATUS_CHANGED", status: state.status, ollamaReady: state.ollamaReady, model: OLLAMA_MODEL });
}
function broadcast(msg) { browser.runtime.sendMessage(msg).catch(() => {}); }
