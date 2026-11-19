/* Copyright (C) 2026 Enrico Miot (EndrX)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
// === SKAI for Firefox — content script ===
// Injected into every page: reads the page's context for the background script.

(function () {
  "use strict";

  // Never inject twice
  if (window.__skaiInjected) return;
  window.__skaiInjected = true;

  // Requests from the background script
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "GET_PAGE_CONTEXT") {
      sendResponse(getPageContext());
    }
    if (msg.type === "HIGHLIGHT_TEXT") {
      highlightText(msg.text);
    }
  });

  /**
   * Context of the current page
   */
  function getPageContext() {
    return {
      title:       document.title,
      url:         location.href,
      text:        extractMainText(),
      meta:        extractMeta(),
      links:       extractLinks(10),
      timestamp:   Date.now()
    };
  }

  /**
   * Main text of the page: the article / main content when one is found,
   * otherwise the whole body
   */
  function extractMainText() {
    // Common semantic selectors first
    const candidates = [
      "article", "main", "[role='main']",
      ".content", "#content", ".post-body",
      ".article-body", ".entry-content"
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el?.innerText?.trim().length > 200) {
        return el.innerText.trim().slice(0, 8000);
      }
    }
    // Fallback: the whole body (without scripts, styles, navigation)
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("script,style,nav,footer,header,aside").forEach(e => e.remove());
    return clone.innerText?.trim().slice(0, 8000) ?? "";
  }

  /**
   * The useful meta tags
   */
  function extractMeta() {
    const get = (name) =>
      document.querySelector(`meta[name='${name}']`)?.content ??
      document.querySelector(`meta[property='og:${name}']`)?.content ?? null;
    return {
      description: get("description"),
      author:      get("author"),
      keywords:    get("keywords")
    };
  }

  /**
   * The first n links of the page
   */
  function extractLinks(n = 10) {
    return Array.from(document.querySelectorAll("a[href]"))
      .slice(0, n * 3)
      .map(a => ({ text: a.innerText.trim().slice(0, 60), href: a.href }))
      .filter(l => l.href.startsWith("http") && l.text.length > 2)
      .slice(0, n);
  }

  /**
   * Highlights text in the page (for future AI highlights)
   */
  function highlightText(query) {
    if (!query) return;
    // Remove earlier highlights
    document.querySelectorAll("mark.skai-hl").forEach(m => {
      m.replaceWith(document.createTextNode(m.textContent));
    });
    // New highlights
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const toWrap = [];
    let node;
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    while ((node = walker.nextNode())) {
      if (re.test(node.textContent)) toWrap.push(node);
    }
    for (const n of toWrap.slice(0, 20)) {
      const span = document.createElement("span");
      const text = n.textContent;
      let lastIndex = 0;
      let match;
      re.lastIndex = 0;
      while ((match = re.exec(text)) !== null) {
        if (match.index > lastIndex) {
          span.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const mark = document.createElement("mark");
        mark.className = "skai-hl";
        mark.style.cssText = "background:#f0a500;color:#000;border-radius:2px;padding:0 2px";
        mark.textContent = match[0];
        span.appendChild(mark);
        lastIndex = re.lastIndex;
      }
      if (lastIndex < text.length) {
        span.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      n.replaceWith(span);
    }
  }
})();
