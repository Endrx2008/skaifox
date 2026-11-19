/* Copyright (C) 2026 Enrico Miot (EndrX)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
// === SKAI for Firefox — SKAI_ Memory, the memory shared by every SKAI app ===
// The add-on cannot read /var/lib/skai itself: it asks the small program skaifox-memory-host (native
// messaging host "skaifox_memory", package skaifox-memory), which uses the library installed by sk_notes.
// Before an answer: what the other SKAI apps know about the message goes into the prompt.
// After an answer: a short record of the exchange goes into this add-on's notes (plugins/skaifox/).
// Every failure is swallowed: without the host or the memory SKAI works exactly as before.

const SKAI_MEMORY_HOST    = "skaifox_memory";
const SKAI_MEMORY_TIMEOUT = 8000;   // the recall must never hold up an answer for long

let skaiMemoryOff = false;          // set once the host is missing: no more attempts until restart

function skaiMemoryCall(request, timeoutMs = SKAI_MEMORY_TIMEOUT) {
  if (skaiMemoryOff) return Promise.resolve(null);
  const call = browser.runtime.sendNativeMessage(SKAI_MEMORY_HOST, request).catch(err => {
    // "No such native application" = skaifox-memory is not installed: stop trying.
    if (/native application|not found|No such/i.test(String(err && err.message))) skaiMemoryOff = true;
    console.info("[SKAI] SKAI_ Memory not used:", err && err.message);
    return null;
  });
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([call, timeout]);
}

/** The memory block for the prompt ("" when nothing is known or the memory is not there). */
async function skaiMemoryRecall(query) {
  if (!query) return "";
  const answer = await skaiMemoryCall({ op: "recall", query: String(query).slice(0, 4000) });
  return (answer && answer.ok && answer.available && typeof answer.text === "string") ? answer.text : "";
}

/** Keep the exchange in this add-on's sub-chat of the day. Resolves true when it was saved. */
async function skaiMemoryRemember(question, reply) {
  if (!question || !reply) return false;
  const answer = await skaiMemoryCall(
    { op: "remember", question: String(question).slice(0, 4000), reply: String(reply).slice(0, 8000) },
    30000
  );
  if (answer && answer.ok && answer.saved === false && answer.reason) {
    console.info("[SKAI] SKAI_ Memory not written:", answer.reason);
  }
  return Boolean(answer && answer.saved);
}

/** What SKAI did, in words, for the memory: the reply, or the actions it ran. */
function describeForMemory(aiResp, results) {
  const parts = [];
  if (aiResp.reply) parts.push(String(aiResp.reply));
  for (const r of results || []) {
    const a = r.action || {};
    if (a.type === "reply_chat") {
      if (a.text && a.text !== aiResp.reply) parts.push(String(a.text));
      continue;
    }
    const what = a.query ? `"${a.query}"` : (a.url || a.topic || a.title || "");
    parts.push(`${a.type}${what ? " " + what : ""}${r.ok ? "" : " (failed)"}`);
  }
  return parts.join("\n").trim();
}
