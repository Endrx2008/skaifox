// === SkAi — SIDEBAR ===

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
  const { status, ollamaReady, model } = await browser.runtime.sendMessage({ type: "GET_STATUS" });
  updateStatusUI(status, ollamaReady);

  if (!ollamaReady) {
    showError();
    return;
  }

  if (model) modelLabel.textContent = model;

  const { history } = await browser.runtime.sendMessage({ type: "GET_HISTORY" });
  if (history?.length > 0) {
    welcomeMsg.style.display = "none";
    addSystemNote(`Sessione ripresa — ${history.length / 2} scambi precedenti`);
  }

  const { sessions } = await browser.runtime.sendMessage({ type: "GET_SESSIONS" });
  updateSessionsUI(sessions);
}
init();

// =========================================================
// MESSAGGI DAL BACKGROUND
// =========================================================
browser.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "STATUS_CHANGED":
      updateStatusUI(msg.status, msg.ollamaReady);
      if (msg.model) modelLabel.textContent = msg.model;
      if (!msg.ollamaReady && msg.status === "error") showError();
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
        if (streamingBubble) finalizeStreamingBubble("⏹ Generazione interrotta");
        else addSystemNote("Generazione interrotta");
        setLoading(false);
        break;
      }
      if (msg.message && msg.message.includes("non raggiungibile")) {
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
      addActionPill(`↗ Cerco: ${msg.query}`, "active");
      break;
    case "TAB_OPENED":
      updateActionPill(`⬡ Tab aperta: ${msg.topic}`, "done");
      break;
    case "PAGE_READ":
      updateActionPill(`✓ Pagina letta`, "done");
      break;
    case "PAGE_SUMMARY":
      addMessage("ai", msg.summary);
      setLoading(false);
      break;
    case "ACTION_ERROR":
      addActionPill(`✕ Errore: ${msg.action?.type ?? "azione"}`, "error");
      break;
    case "SESSION_UPDATED":
      updateSessionsUI(msg.sessions);
      break;
  }
});

// =========================================================
// INVIO MESSAGGIO
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

  // Contesto pagina corrente — MV2 usa tabs.executeScript
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
  } catch { /* pagina non accessibile */ }

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
  role.textContent = "SkAi";
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

  // Strategia 1: JSON già completo → estrai reply direttamente
  try {
    const parsed = JSON.parse(full.trim());
    if (parsed.reply) {
      streamingBubble.textContent = parsed.reply;
      scrollToBottom();
      return;
    }
  } catch (_) {}

  // Strategia 2: JSON parziale ma "reply" già chiuso
  const replyMatch = full.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (replyMatch) {
    streamingBubble.textContent = replyMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    scrollToBottom();
    return;
  }

  // Strategia 3: "reply" aperto ma non ancora chiuso (streaming in corso)
  const partialReply = full.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (partialReply && partialReply[1].length > 0) {
    streamingBubble.textContent = partialReply[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') + "▌";
    scrollToBottom();
    return;
  }

  // Fallback: cursore mentre il modello genera il JSON iniziale
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
// AZIONI COMPLETATE
// =========================================================
function handleActionsDone(results) {
  clearSlowNotice();
  chatArea.querySelectorAll(".sk-action-pill.active").forEach(p => {
    p.classList.remove("active");
    p.classList.add("done");
  });
  const errors = results?.filter(r => !r.ok) ?? [];
  if (errors.length > 0) {
    addSystemNote(`${errors.length} azione${errors.length > 1 ? "i" : ""} non riuscit${errors.length > 1 ? "e" : "a"}`);
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
  roleSpan.textContent = role === "user" ? "TU" : "SkAi";
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
// AVVISO "CI STA METTENDO MOLTO"
// Nessun timeout: la generazione prosegue, questa è solo una nota
// aggiornabile con un pulsante per fermarla a mano se si vuole.
// =========================================================
let slowNote = null;

function showSlowNotice(msg) {
  const label = msg.streaming
    ? `${msg.model ?? "Il modello"} sta ancora generando — fermo da ${msg.idleSec}s (${msg.elapsedSec}s totali). Attendo.`
    : `${msg.model ?? "Il modello"} ci sta mettendo molto — ${msg.elapsedSec}s. È un modello pesante, sto ancora aspettando.`;

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
  stopBtn.textContent = "⏹ Interrompi";
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
      if (ollamaReady) { statusDot.classList.add("online"); statusText.textContent = "Pronto"; }
      else             { statusDot.classList.add("error");  statusText.textContent = "Ollama non raggiungibile"; }
      break;
    case "thinking":
      statusDot.classList.add("thinking");
      statusText.textContent = `${modelLabel.textContent} sta pensando...`;
      break;
    case "searching":
      statusDot.classList.add("searching");
      statusText.textContent = "Ricerca in corso...";
      break;
    case "reading":
      statusDot.classList.add("searching");
      statusText.textContent = "Lettura pagina...";
      break;
    case "done":
      statusDot.classList.add("online");
      statusText.textContent = "Fatto";
      setTimeout(() => updateStatusUI("idle", true), 2000);
      break;
    case "error":
      statusDot.classList.add("error");
      statusText.textContent = "Errore";
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
    closeSpan.title = "Chiudi tab";
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
function timestamp()       { return new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); }
function escHtml(s)        { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

document.getElementById("btn-clear").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "CLEAR_HISTORY" });
  [...chatArea.children].forEach(c => { if (c !== welcomeMsg) c.remove(); });
  welcomeMsg.style.display = "block";
  streamingBubble = null;
  lastActionsRow  = null;
  slowNote        = null;
});
