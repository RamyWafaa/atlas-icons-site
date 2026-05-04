/* Atlas Icons — search, filter, copy, modal. No deps. No innerHTML. */
(function () {
  'use strict';

  var DATA_URL = 'assets/data/icons.json';
  var PAGE_SIZE = 240;
  var DEBOUNCE_MS = 80;

  var els = {
    search: document.getElementById('searchInput'),
    searchCount: document.getElementById('searchCount'),
    grid: document.getElementById('iconGrid'),
    empty: document.getElementById('emptyState'),
    packList: document.getElementById('packList'),
    countAll: document.getElementById('countAll'),
    totalCount: document.getElementById('totalCount'),
    loadMoreWrap: document.getElementById('loadMoreWrap'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),
    modal: document.getElementById('modalRoot'),
    mPreview: document.getElementById('modalIconPreview'),
    mTitle: document.getElementById('modalTitle'),
    mPack: document.getElementById('modalPack'),
    sHtml: document.getElementById('snippetHtml'),
    sClass: document.getElementById('snippetClass'),
    sUnicode: document.getElementById('snippetUnicode'),
    dlPackZip: document.getElementById('downloadPackZip'),
    viewPackGh: document.getElementById('viewPackOnGithub'),
  };

  var state = {
    icons: [],            // [{n,c,p,u}]
    packCounts: {},
    activePack: 'all',
    query: '',
    filtered: [],
    rendered: 0,
  };

  // ---------- bootstrap ----------
  fetch(DATA_URL)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      state.icons = data.icons || [];
      state.packCounts = data.packs || {};
      var total = data.total || state.icons.length;
      els.countAll.textContent = formatNum(total);
      els.totalCount.textContent = formatNum(total);
      buildPackSidebar();
      readUrlState();
      applyFilters();
      bindEvents();
    })
    .catch(function (e) {
      var msg = document.createElement('p');
      msg.style.padding = '40px';
      msg.style.color = '#888';
      msg.textContent = 'Could not load icons. Refresh the page.';
      els.grid.appendChild(msg);
      console.error(e);
    });

  // ---------- sidebar ----------
  function buildPackSidebar() {
    var packs = Object.keys(state.packCounts).sort();
    var frag = document.createDocumentFragment();
    packs.forEach(function (p) {
      var btn = document.createElement('button');
      btn.className = 'pack-pill';
      btn.dataset.pack = p;
      var label = document.createElement('span');
      label.textContent = prettyPack(p);
      var count = document.createElement('span');
      count.className = 'pill-count';
      count.textContent = formatNum(state.packCounts[p]);
      btn.appendChild(label);
      btn.appendChild(count);
      frag.appendChild(btn);
    });
    els.packList.appendChild(frag);
  }

  function setActivePack(pack) {
    state.activePack = pack;
    var pills = document.querySelectorAll('.pack-pill');
    for (var i = 0; i < pills.length; i++) {
      if (pills[i].dataset.pack === pack) pills[i].classList.add('is-active');
      else pills[i].classList.remove('is-active');
    }
    writeUrlState();
  }

  // ---------- filter + render ----------
  function applyFilters() {
    var q = state.query.trim().toLowerCase();
    var pack = state.activePack;
    var hits = [];
    for (var i = 0; i < state.icons.length; i++) {
      var icon = state.icons[i];
      if (pack !== 'all' && icon.p !== pack) continue;
      if (q && icon.n.indexOf(q) === -1 && icon.c.indexOf(q) === -1 && icon.p.indexOf(q) === -1) continue;
      hits.push(icon);
    }
    state.filtered = hits;
    state.rendered = 0;
    while (els.grid.firstChild) els.grid.removeChild(els.grid.firstChild);
    els.empty.hidden = hits.length > 0;
    els.searchCount.textContent = q ? formatNum(hits.length) + ' / ' + formatNum(state.icons.length) : '';
    renderMore();
  }

  function renderMore() {
    var end = Math.min(state.rendered + PAGE_SIZE, state.filtered.length);
    var frag = document.createDocumentFragment();
    for (var i = state.rendered; i < end; i++) {
      var icon = state.filtered[i];
      var card = document.createElement('button');
      card.className = 'icon-card';
      card.dataset.idx = String(i);
      card.setAttribute('aria-label', icon.n + ' icon, ' + icon.p + ' pack');
      var glyph = document.createElement('i');
      glyph.className = icon.c;
      card.appendChild(glyph);
      var name = document.createElement('span');
      name.className = 'card-name';
      name.textContent = icon.n;
      card.appendChild(name);
      frag.appendChild(card);
    }
    els.grid.appendChild(frag);
    state.rendered = end;
    els.loadMoreWrap.hidden = state.rendered >= state.filtered.length;
  }

  // ---------- modal ----------
  function openModal(idx) {
    var icon = state.filtered[idx];
    if (!icon) return;
    els.mPreview.className = icon.c;
    els.mTitle.textContent = icon.c;
    els.mPack.textContent = prettyPack(icon.p);
    els.sHtml.textContent = '<i class="' + icon.c + '"></i>';
    els.sClass.textContent = icon.c;
    els.sUnicode.textContent = '\\' + icon.u;
    els.dlPackZip.href =
      'https://github.com/Vectopus/Atlas-icons-font/archive/refs/heads/main.zip';
    els.viewPackGh.href =
      'https://github.com/Vectopus/Atlas-icons-font/tree/main/packs/' + icon.p;
    els.modal.hidden = false;
    els.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    els.modal.hidden = true;
    els.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function copyText(text, btn) {
    var done = function () {
      btn.classList.add('is-copied');
      var prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () {
        btn.classList.remove('is-copied');
        btn.textContent = prev;
      }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); });
    } else { fallback(text); done(); }
  }

  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) { /* noop */ }
    document.body.removeChild(ta);
  }

  // ---------- events ----------
  function bindEvents() {
    var debounce;
    els.search.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        state.query = els.search.value;
        applyFilters();
        writeUrlState();
      }, DEBOUNCE_MS);
    });

    document.addEventListener('click', function (e) {
      var pill = e.target.closest('.pack-pill');
      if (pill) {
        setActivePack(pill.dataset.pack);
        applyFilters();
        return;
      }
      var card = e.target.closest('.icon-card');
      if (card) {
        openModal(parseInt(card.dataset.idx, 10));
        return;
      }
      if (e.target.closest('[data-modal-close]')) {
        closeModal();
        return;
      }
      var copyBtn = e.target.closest('.btn-copy');
      if (copyBtn) {
        var srcId = copyBtn.dataset.copy;
        var srcEl = document.getElementById(srcId);
        if (srcEl) copyText(srcEl.textContent, copyBtn);
      }
    });

    els.loadMoreBtn.addEventListener('click', renderMore);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.modal.hidden) closeModal();
      if (e.key === '/' && document.activeElement !== els.search) {
        e.preventDefault();
        els.search.focus();
      }
    });

    window.addEventListener('hashchange', function () {
      readUrlState();
      applyFilters();
    });
  }

  // ---------- url state ----------
  function readUrlState() {
    var hash = (location.hash || '').slice(1);
    if (!hash) return;
    var parts = hash.split('/');
    if (parts[0] === 'pack' && parts[1]) {
      if (state.packCounts[parts[1]] || parts[1] === 'all') setActivePack(parts[1]);
    } else if (parts[0] === 'search' && parts.length > 1) {
      state.query = decodeURIComponent(parts.slice(1).join('/'));
      els.search.value = state.query;
    }
  }

  function writeUrlState() {
    var hash = '';
    if (state.activePack && state.activePack !== 'all') hash = 'pack/' + state.activePack;
    if (state.query) {
      hash = (hash ? hash + '&' : '') + 'search/' + encodeURIComponent(state.query);
    }
    var newHash = hash ? '#' + hash : ' ';
    if (location.hash !== newHash && newHash !== ' ') history.replaceState(null, '', newHash);
  }

  // ---------- helpers ----------
  function formatNum(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function prettyPack(p) {
    return p.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
})();
