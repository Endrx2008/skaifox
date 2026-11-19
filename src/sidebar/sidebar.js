/* Copyright (C) 2026 Enrico Miot (EndrX)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
// === SKAI for Firefox — sidebar ===

// Texts in Firefox's language (_locales); English when a language is missing.
function t(key, ...subs) {
  return browser.i18n.getMessage(key, subs.map(String)) || key;
}
document.documentElement.lang = browser.i18n.getUILanguage();
document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
document.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.dataset.i18nTitle); });
document.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });

const chatArea      = document.getElementById("chat-area");
const userInput     = document.getElementById("user-input");
const sendBtn       = document.getElementById("send-btn");
const statusDot     = document.getElementById("status-dot");
const statusText    = document.getElementById("status-text");
const sessionsPanel = document.getElementById("sessions-panel");
const sessionsList  = document.getElementById("sessions-list");
const sessionsCount = document.getElementById("sessions-count");
const welcomeMsg    = document.getElementById("welcome-msg");
const modelLabel    = document.getElementById("model-label");
const errorOverlay  = document.getElementById("error-overlay");
const errorClose    = document.getElementById("error-close");

let isLoading       = false;
let streamingBubble = null;
let lastActionsRow  = null;

function showError() {
  errorOverlay.style.display = "flex";
}
function hideError() {
  errorOverlay.style.display = "none";
}
errorClose.addEventListener("click", () => {
  browser.sidebarAction.close().catch(() => window.close());
});

// =========================================================
// INIT
// =========================================================
async function init() {
  let { status, ollamaReady, model } = await browser.runtime.sendMessage({ type: "GET_STATUS" });
  if (!ollamaReady) {
    // The background may still be starting, or Ollama came up later: check again now.
    ollamaReady = (await browser.runtime.sendMessage({ type: "CHECK_OLLAMA" })).ok;
    model = (await browser.runtime.sendMessage({ type: "GET_MODEL" })).model;
  }
  updateStatusUI(status, ollamaReady);

  if (!ollamaReady) {
    showError();
    return;
  }
  hideError();

  if (model) modelLabel.textContent = model;

  const { history } = await browser.runtime.sendMessage({ type: "GET_HISTORY" });
  if (history?.length > 0) {
    welcomeMsg.style.display = "none";
    addSystemNote(t("sessionResumed", history.length / 2));
  }

  const { sessions } = await browser.runtime.sendMessage({ type: "GET_SESSIONS" });
  updateSessionsUI(sessions);
}
init();

// =========================================================
// MESSAGES FROM THE BACKGROUND SCRIPT
// =========================================================
browser.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "STATUS_CHANGED":
      updateStatusUI(msg.status, msg.ollamaReady);
      if (msg.model) modelLabel.textContent = msg.model;
      if (msg.ollamaReady) hideError();
      else if (msg.status === "error") showError();
      break;
    case "MODEL_LOADED":
      modelLabel.textContent = msg.model;
      hideError();
      break;
    case "AI_STREAM_CHUNK":
      handleStreamChunk(msg.full);
      break;
    case "AI_SLOW":
      showSlowNotice(msg);
      break;
    case "AI_SLOW_END":
      clearSlowNotice();
      break;
    case "CHAT_REPLY":
      clearSlowNotice();
      finalizeStreamingBubble(msg.text);
      setLoading(false);
      break;
    case "AI_ERROR":
      clearSlowNotice();
      if (msg.aborted) {
        if (streamingBubble) finalizeStreamingBubble("⏹ " + t("stopped"));
        else addSystemNote(t("stopped"));
        setLoading(false);
        break;
      }
      if (msg.unavailable) {
        if (streamingBubble) finalizeStreamingBubble("");
        showError();
      } else {
        if (streamingBubble) finalizeStreamingBubble(`⚠ ${msg.message}`);
        else addMessage("ai", `⚠ ${msg.message}`);
      }
      setLoading(false);
      break;
    case "ACTIONS_DONE":
      handleActionsDone(msg.results);
      break;
    case "SEARCH_STARTED":
      addActionPill("↗ " + t("searchingFor", msg.query), "active");
      break;
    case "TAB_OPENED":
      updateActionPill("⬡ " + t("tabOpened", msg.topic ?? ""), "done");
      break;
    case "PAGE_READ":
      updateActionPill("✓ " + t("pageRead"), "done");
      break;
    case "PAGE_SUMMARY":
      addMessage("ai", msg.summary);
      setLoading(false);
      break;
    case "ACTION_ERROR":
      addActionPill("✕ " + t("actionError", msg.action?.type ?? t("actionWord")), "error");
      break;
    case "SESSION_UPDATED":
      updateSessionsUI(msg.sessions);
      break;
  }
});

// =========================================================
// SENDING A MESSAGE
// =========================================================
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isLoading) return;

  welcomeMsg.style.display = "none";
  addMessage("user", text);
  userInput.value = "";
  autoResizeInput();
  setLoading(true);
  lastActionsRow = null;
  clearSlowNotice();

  // Context of the current page (MV2: tabs.executeScript)
  let pageContext = null;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const results = await browser.tabs.executeScript(tab.id, {
        code: `({
          title: document.title,
          url:   location.href,
          text:  document.body ? document.body.innerText.slice(0, 2000) : ""
        })`
      });
      pageContext = results?.[0] ?? null;
    }
  } catch { /* page not readable */ }

  streamingBubble = createStreamingBubble();

  try {
    await browser.runtime.sendMessage({ type: "USER_MESSAGE", text, pageContext });
  } catch (err) {
    finalizeStreamingBubble(`⚠ ${err.message}`);
    setLoading(false);
  }
}

sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendMessage();
  }
  setTimeout(autoResizeInput, 0);
});

// =========================================================
// STREAMING
// =========================================================
function createStreamingBubble() {
  const wrapper = document.createElement("div");
  wrapper.className = "sk-message ai";

  const meta = document.createElement("div");
  meta.className = "sk-message-meta";
  const role = document.createElement("span");
  role.className = "sk-message-role";
  role.textContent = "SKAI";
  const time = document.createElement("span");
  time.className = "sk-message-time";
  time.textContent = timestamp();
  meta.appendChild(role);
  meta.appendChild(time);

  const bubble = document.createElement("div");
  bubble.className = "sk-message-bubble sk-typing-cursor";
  bubble.id = "sk-stream-bubble";

  wrapper.appendChild(meta);
  wrapper.appendChild(bubble);
  chatArea.appendChild(wrapper);
  scrollToBottom();
  return bubble;
}

function handleStreamChunk(full) {
  if (!streamingBubble) return;

  // Way 1: the JSON is complete → take "reply" from it
  try {
    const parsed = JSON.parse(full.trim());
    if (parsed.reply) {
      streamingBubble.textContent = parsed.reply;
      scrollToBottom();
      return;
    }
  } catch (_) {}

  // Way 2: partial JSON, but "reply" is already closed
  const replyMatch = full.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (replyMatch) {
    streamingBubble.textContent = replyMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    scrollToBottom();
    return;
  }

  // Way 3: "reply" open but not closed yet (still streaming)
  const partialReply = full.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (partialReply && partialReply[1].length > 0) {
    streamingBubble.textContent = partialReply[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') + "▌";
    scrollToBottom();
    return;
  }

  // Fallback: a cursor while the model writes the start of the JSON
  streamingBubble.textContent = "▌";
  scrollToBottom();
}

function finalizeStreamingBubble(text) {
  if (!streamingBubble) return;
  streamingBubble.classList.remove("sk-typing-cursor");
  streamingBubble.removeAttribute("id");
  streamingBubble.textContent = text;
  streamingBubble = null;
  scrollToBottom();
}

// =========================================================
// ACTIONS DONE
// =========================================================
function handleActionsDone(results) {
  clearSlowNotice();
  chatArea.querySelectorAll(".sk-action-pill.active").forEach(p => {
    p.classList.remove("active");
    p.classList.add("done");
  });
  const errors = results?.filter(r => !r.ok) ?? [];
  if (errors.length > 0) {
    addSystemNote(errors.length === 1 ? t("actionFailedOne") : t("actionsFailed", errors.length));
  }
  setLoading(false);
}

// =========================================================
// UI HELPERS
// =========================================================
function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `sk-message ${role}`;

  const meta = document.createElement("div");
  meta.className = "sk-message-meta";
  const roleSpan = document.createElement("span");
  roleSpan.className = "sk-message-role";
  roleSpan.textContent = role === "user" ? t("you") : "SKAI";
  const timeSpan = document.createElement("span");
  timeSpan.className = "sk-message-time";
  timeSpan.textContent = timestamp();
  meta.appendChild(roleSpan);
  meta.appendChild(timeSpan);

  const bubble = document.createElement("div");
  bubble.className = "sk-message-bubble";
  bubble.textContent = text;

  div.appendChild(meta);
  div.appendChild(bubble);
  chatArea.appendChild(div);
  scrollToBottom();
}

function addSystemNote(text) {
  const div = document.createElement("div");
  div.className = "sk-system-note";
  div.textContent = text;
  chatArea.appendChild(div);
  scrollToBottom();
}

// =========================================================
// "IT IS TAKING LONG" NOTICE
// No timeout: the answer goes on; this is only a note, updated while it
// waits, with a button to stop it by hand.
// =========================================================
let slowNote = null;

function showSlowNotice(msg) {
  const label = msg.streaming
    ? t("slowStreaming", msg.model || t("theModel"), msg.idleSec, msg.elapsedSec)
    : t("slowWaiting", msg.model || t("theModel"), msg.elapsedSec);

  if (slowNote && chatArea.contains(slowNote)) {
    slowNote.firstChild.textContent = label;
    scrollToBottom();
    return;
  }

  slowNote = document.createElement("div");
  slowNote.className = "sk-system-note";
  slowNote.appendChild(document.createTextNode(label));

  const stopBtn = document.createElement("span");
  stopBtn.className = "sk-action-pill error";
  stopBtn.style.cursor     = "pointer";
  stopBtn.style.marginLeft = "8px";
  stopBtn.textContent = "⏹ " + t("stop");
  stopBtn.addEventListener("click", () => {
    browser.runtime.sendMessage({ type: "STOP_GENERATION" }).catch(() => {});
  });
  slowNote.appendChild(stopBtn);

  chatArea.appendChild(slowNote);
  scrollToBottom();
}

function clearSlowNotice() {
  if (slowNote && chatArea.contains(slowNote)) slowNote.remove();
  slowNote = null;
}

function addActionPill(label, state = "active") {
  if (!lastActionsRow || !chatArea.contains(lastActionsRow)) {
    lastActionsRow = document.createElement("div");
    lastActionsRow.className = "sk-actions-row";
    chatArea.appendChild(lastActionsRow);
  }
  const pill = document.createElement("span");
  pill.className = `sk-action-pill ${state}`;
  pill.textContent = label;
  lastActionsRow.appendChild(pill);
  scrollToBottom();
  return pill;
}

function updateActionPill(label, state) {
  if (!lastActionsRow) return addActionPill(label, state);
  const active = lastActionsRow.querySelector(".sk-action-pill.active");
  if (active) {
    active.textContent = label;
    active.className = `sk-action-pill ${state}`;
  } else {
    addActionPill(label, state);
  }
  scrollToBottom();
}

function updateStatusUI(status, ollamaReady) {
  statusDot.className = "sk-status-dot";
  switch (status) {
    case "idle":
      if (ollamaReady) { statusDot.classList.add("online"); statusText.textContent = t("statusReady"); }
      else             { statusDot.classList.add("error");  statusText.textContent = t("statusUnavailable"); }
      break;
    case "thinking":
      statusDot.classList.add("thinking");
      statusText.textContent = t("statusThinking", modelLabel.textContent);
      break;
    case "searching":
      statusDot.classList.add("searching");
      statusText.textContent = t("statusSearching");
      break;
    case "reading":
      statusDot.classList.add("searching");
      statusText.textContent = t("statusReading");
      break;
    case "done":
      statusDot.classList.add("online");
      statusText.textContent = t("statusDone");
      setTimeout(() => updateStatusUI("idle", true), 2000);
      break;
    case "error":
      statusDot.classList.add("error");
      statusText.textContent = t("statusError");
      break;
  }
}

function updateSessionsUI(sessions) {
  const topics = Object.keys(sessions ?? {});
  sessionsPanel.style.display = topics.length === 0 ? "none" : "block";
  sessionsCount.textContent = topics.length;
  sessionsList.textContent = "";
  for (const topic of topics) {
    const count = sessions[topic].length;
    const tag   = document.createElement("div");
    tag.className = "sk-session-tag";

    const topicSpan = document.createElement("span");
    topicSpan.textContent = topic;

    const countSpan = document.createElement("span");
    countSpan.className = "sk-tag-count";
    countSpan.textContent = count;

    const closeSpan = document.createElement("span");
    closeSpan.className = "sk-session-close";
    closeSpan.title = t("closeTabs");
    closeSpan.textContent = "✕";
    closeSpan.addEventListener("click", (e) => {
      e.stopPropagation();
      browser.runtime.sendMessage({ type: "CLOSE_SESSION", topic });
    });

    tag.appendChild(topicSpan);
    tag.appendChild(countSpan);
    tag.appendChild(closeSpan);
    sessionsList.appendChild(tag);
  }
}

function setLoading(val) {
  isLoading          = val;
  sendBtn.disabled   = val;
  userInput.disabled = val;
  if (!val) lastActionsRow = null;
}

function scrollToBottom()  { chatArea.scrollTop = chatArea.scrollHeight; }
function autoResizeInput() { userInput.style.height = "auto"; userInput.style.height = Math.min(userInput.scrollHeight, 120) + "px"; }
function timestamp()       { return new Date().toLocaleTimeString(browser.i18n.getUILanguage(), { hour: "2-digit", minute: "2-digit" }); }
function escHtml(s)        { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

document.getElementById("btn-clear").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "CLEAR_HISTORY" });
  [...chatArea.children].forEach(c => { if (c !== welcomeMsg) c.remove(); });
  welcomeMsg.style.display = "block";
  streamingBubble = null;
  lastActionsRow  = null;
  slowNote        = null;
});
