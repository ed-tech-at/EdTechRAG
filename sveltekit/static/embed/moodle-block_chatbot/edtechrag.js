(function () {
  'use strict';

  var P = 'at-ed-tech-edtechrag-emd-';

  function cn(name) { return P + name; }
  function el(tag, classes, attrs) {
    var e = document.createElement(tag);
    if (classes) e.className = classes;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function loadMarked(baseUrl, cb) {
    if (window.marked) { cb(); return; }
    var s = document.createElement('script');
    s.src = baseUrl + 'cdn/marked.umd.js';
    s.onload = cb;
    s.onerror = cb; // proceed without markdown if load fails
    document.head.appendChild(s);
  }

  function renderMarkdown(text) {
    if (window.marked) {
      try {
        var html = window.marked.parse(text);
        // open all links in new tab
        return html.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
      } catch (e) { /* fall through */ }
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function parseDefaultMessages(raw) {
    if (!raw || raw === 'f') return [];
    try { return JSON.parse(raw); } catch (e) { /* fall through */ }
    // try pipe-separated fallback
    return raw.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function initWidget(configDiv) {
    var d = configDiv.dataset;
    var embedId      = d.embedId      || '';
    var greeting     = d.greeting     || '';
    var assistantName = d.assistantName || 'Chatbot';
    var assistantIcon = d.assistantIcon || '';
    var sponsorLink  = d.sponsorLink  || '';
    var sponsorText  = d.sponsorText  || '';
    var defaultMessages = parseDefaultMessages(d.defaultMessages);
    var baseUrl      = d.edtechragBaseUrl || '/edtechrag/';
    if (!baseUrl.endsWith('/')) baseUrl += '/';

    var design = d.design || 'tugraz';

    var messages = [];
    var loading  = false;
    var decoder  = new TextDecoder();
    var storageKey = 'edtechrag-chat-' + embedId;

    function saveHistory() {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } catch (e) { /* storage quota or private mode */ }
    }

    function loadHistory() {
      try {
        var raw = localStorage.getItem(storageKey);
        if (!raw) return;
        var saved = JSON.parse(raw);
        if (!Array.isArray(saved) || !saved.length) return;
        messages = saved;
        return true;
      } catch (e) { return false; }
    }

    /* ── Build DOM ── */
    var host = el('div', cn('host'));
    if (design !== 'tugraz') {
      host.classList.add(cn('design-' + design));
    }

    /* Panel */
    var panel = el('div', cn('panel'));
    panel.setAttribute('hidden', 'hidden');

    /* Header */
    var header = el('div', cn('header'));

    var avatar;
    if (assistantIcon) {
      avatar = el('img', cn('avatar'), { src: assistantIcon, alt: assistantName });
    } else {
      avatar = el('div', cn('avatar'));
      avatar.innerHTML = '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style="width:42px;height:42px;fill:#c9a0ff"><circle cx="20" cy="20" r="20"/><rect x="13" y="14" width="14" height="10" rx="3" fill="white"/><circle cx="16" cy="19" r="2" fill="#4B2D7F"/><circle cx="24" cy="19" r="2" fill="#4B2D7F"/></svg>';
    }

    var titleEl = el('span', cn('title'));
    titleEl.textContent = assistantName;

    var closeBtn = el('button', cn('close'));
    closeBtn.setAttribute('aria-label', 'Schließen');
    closeBtn.innerHTML = '&#x2715;';

    header.appendChild(avatar);
    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    /* Messages */
    var messagesEl = el('div', cn('messages'));

    if (greeting) {
      var greetingEl = el('div', cn('greeting'));
      greetingEl.textContent = greeting;
      messagesEl.appendChild(greetingEl);
    }

    var faqSection = null;
    if (defaultMessages.length > 0) {
      var faqLabel = el('div', cn('faq-label'));
      faqLabel.textContent = 'Häufig gestellte Fragen:';
      messagesEl.appendChild(faqLabel);

      faqSection = el('div', cn('faq'));
      defaultMessages.forEach(function (msg) {
        var pill = el('button', cn('faq-pill'));
        pill.textContent = msg;
        pill.addEventListener('click', function () { send(msg); });
        faqSection.appendChild(pill);
      });
      messagesEl.appendChild(faqSection);
    }

    /* Footer: sponsor + clear button */
    var footerEl = el('div', cn('footer'));

    if (sponsorLink && sponsorText) {
      var sponsorA = el('a', cn('sponsor-link'), { href: sponsorLink, target: '_blank', rel: 'noopener noreferrer' });
      sponsorA.textContent = sponsorText;
      footerEl.appendChild(sponsorA);
      footerEl.classList.add(cn('has-sponsor'));
    }

    var clearBtn = el('button', cn('clear-btn'));
    clearBtn.textContent = 'Chat leeren';
    footerEl.appendChild(clearBtn);

    /* Composer */
    var composer  = el('div', cn('composer'));
    var textarea  = el('textarea', cn('input'), { rows: '1', placeholder: 'Nachricht schreiben …' });
    var sendBtn   = el('button', cn('send'));
    sendBtn.setAttribute('aria-label', 'Senden');
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';

    composer.appendChild(textarea);
    composer.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(messagesEl);
    panel.appendChild(footerEl);
    panel.appendChild(composer);

    /* FAB */
    var fab = el('button', cn('fab'));
    fab.setAttribute('aria-label', assistantName + ' öffnen');

    if (assistantIcon) {
      var fabImg = el('img', '', { src: assistantIcon, alt: assistantName });
      fab.appendChild(fabImg);
    } else {
      fab.innerHTML = '<svg class="' + cn('fab-icon') + '" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="20"/><rect x="11" y="13" width="18" height="12" rx="4" fill="white"/><circle cx="16" cy="19" r="2.5" fill="#4B2D7F"/><circle cx="24" cy="19" r="2.5" fill="#4B2D7F"/><rect x="17" y="27" width="6" height="3" rx="1.5" fill="white"/></svg>';
    }

    host.appendChild(panel);
    host.appendChild(fab);
    document.body.appendChild(host);

    /* ── History restore ── */
    function renderSavedHistory() {
      var hadHistory = loadHistory();
      if (!hadHistory) return;
      // hide FAQ since there's an existing conversation
      if (faqSection) faqSection.style.display = 'none';
      var faqLabelEl = messagesEl.querySelector('.' + cn('faq-label'));
      if (faqLabelEl) faqLabelEl.style.display = 'none';
      messages.forEach(function (m) {
        var wrap = el('div', cn('bubble') + ' ' + cn(m.role));
        var content = el('div', cn('bubble-content'));
        if (m.role === 'user') {
          content.textContent = m.content;
        } else {
          content.innerHTML = renderMarkdown(m.content);
        }
        wrap.appendChild(content);
        messagesEl.appendChild(wrap);
      });
    }

    function clearHistory() {
      try { localStorage.removeItem(storageKey); } catch (e) { /* */ }
      messages = [];
      // remove all bubble elements
      var bubbles = messagesEl.querySelectorAll('.' + cn('bubble'));
      bubbles.forEach(function (b) { b.remove(); });
      // restore FAQ
      if (faqSection) faqSection.style.display = '';
      var faqLabelEl = messagesEl.querySelector('.' + cn('faq-label'));
      if (faqLabelEl) faqLabelEl.style.display = '';
    }

    /* ── State helpers ── */
    function setOpen(open) {
      if (open) {
        panel.removeAttribute('hidden');
        panel.classList.add(cn('open'));
        textarea.focus();
        scrollBottom();
      } else {
        panel.setAttribute('hidden', 'hidden');
        panel.classList.remove(cn('open'));
      }
    }

    function scrollBottom() {
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
    }

    function addBubble(role, htmlContent) {
      var wrap = el('div', cn('bubble') + ' ' + cn(role));
      var content = el('div', cn('bubble-content'));
      if (role === 'user') {
        content.textContent = htmlContent;
      } else {
        content.innerHTML = htmlContent;
      }
      wrap.appendChild(content);
      messagesEl.appendChild(wrap);
      scrollBottom();
      return content;
    }

    /* ── Send ── */
    function send(text) {
      text = typeof text === 'string' ? text.trim() : textarea.value.trim();
      if (!text || loading) return;

      textarea.value = '';
      textarea.style.height = '';

      if (faqSection) {
        faqSection.style.display = 'none';
        var faqLabel2 = messagesEl.querySelector('.' + cn('faq-label'));
        if (faqLabel2) faqLabel2.style.display = 'none';
      }

      loading = true;
      sendBtn.disabled = true;

      var history = messages.map(function (m) { return { role: m.role, content: m.content }; });
      messages.push({ role: 'user', content: text });
      addBubble('user', text);

      var assistantRaw = '';
      messages.push({ role: 'assistant', content: '' });
      var assistantIndex = messages.length - 1;
      var assistantContentEl = addBubble('assistant', '<span class="' + cn('muted') + '">…</span>');

      var url = baseUrl + 'api/chat/' + encodeURIComponent(embedId);
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, history: history })
      }).then(function (res) {
        if (!res.ok || !res.body) throw new Error('Request failed (' + res.status + ')');
        var reader = res.body.getReader();

        function read() {
          return reader.read().then(function (chunk) {
            if (chunk.done) {
              loading = false;
              sendBtn.disabled = false;
              saveHistory();
              return;
            }
            var piece = decoder.decode(chunk.value || new Uint8Array(), { stream: true });
            assistantRaw += piece;
            messages[assistantIndex].content = assistantRaw;
            assistantContentEl.innerHTML = renderMarkdown(assistantRaw);
            scrollBottom();
            return read();
          });
        }

        return read();
      }).catch(function (err) {
        assistantContentEl.innerHTML = '<span class="' + cn('muted') + '">Fehler: ' + escapeHtml(err.message) + '</span>';
        messages.pop();
        loading = false;
        sendBtn.disabled = false;
      });
    }

    /* ── Init: restore saved history ── */
    renderSavedHistory();

    /* ── Events ── */
    fab.addEventListener('click', function () { setOpen(true); });
    closeBtn.addEventListener('click', function () { setOpen(false); });
    sendBtn.addEventListener('click', function () { send(); });
    clearBtn.addEventListener('click', function () { clearHistory(); });

    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        send();
      }
    });

    textarea.addEventListener('input', function () {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });
  }

  function initAll() {
    var divs = document.querySelectorAll('.at-ed-tech-edtechrag');
    if (!divs.length) return;
    var baseUrl = divs[0].dataset.edtechragBaseUrl || '/edtechrag/';
    if (!baseUrl.endsWith('/')) baseUrl += '/';

    loadMarked(baseUrl, function () {
      divs.forEach(function (div) { initWidget(div); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
