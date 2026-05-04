/* Atlas Icons — search, filter, copy, modal. Vanilla JS, no innerHTML. */
(function () {
  'use strict';

  var DATA_URL = 'assets/data/icons.json';
  var PAGE_SIZE = 240;
  var DEBOUNCE_MS = 80;
  var SAMPLE_PER_CATEGORY = 6;

  var els = {
    search: document.getElementById('searchInput'),
    searchCount: document.getElementById('searchCount'),
    countAll: document.getElementById('countAll'),
    totalCount: document.getElementById('totalCount'),

    categoryGrid: document.getElementById('categoryGrid'),
    filteredView: document.getElementById('filteredView'),
    backBtn: document.getElementById('backBtn'),
    filteredTitle: document.getElementById('filteredTitle'),
    filteredCount: document.getElementById('filteredCount'),

    grid: document.getElementById('iconGrid'),
    empty: document.getElementById('emptyState'),
    packList: document.getElementById('packList'),
    loadMoreWrap: document.getElementById('loadMoreWrap'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),

    modal: document.getElementById('modalRoot'),
    mPreview: document.getElementById('modalIconPreview'),
    mTitle: document.getElementById('modalTitle'),
    mPack: document.getElementById('modalPack'),
    snippetCode: document.getElementById('snippetCode'),
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
    iconsByPack: {},      // { packName: [icons] } — lazy-cached
    activeTab: 'html',
    activeIcon: null,
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
      indexIconsByPack();
      buildPackSidebar();
      buildCategoryGrid();
      readUrlState();
      route();
      bindEvents();
    })
    .catch(function (e) {
      var msg = document.createElement('p');
      msg.style.padding = '40px';
      msg.style.color = '#888';
      msg.style.textAlign = 'center';
      msg.textContent = 'Could not load icons. Refresh the page.';
      els.categoryGrid.appendChild(msg);
      els.categoryGrid.hidden = false;
      console.error(e);
    });

  function indexIconsByPack() {
    state.iconsByPack = {};
    for (var i = 0; i < state.icons.length; i++) {
      var p = state.icons[i].p;
      if (!state.iconsByPack[p]) state.iconsByPack[p] = [];
      state.iconsByPack[p].push(state.icons[i]);
    }
  }

  // ---------- view router (decides between category grid and filtered grid) ----------
  function route() {
    var showFiltered = state.activePack !== 'all' || state.query.trim() !== '';
    els.categoryGrid.hidden = showFiltered;
    els.filteredView.hidden = !showFiltered;
    if (showFiltered) {
      updateFilteredHeader();
      applyFilters();
    }
  }

  function updateFilteredHeader() {
    if (state.query.trim()) {
      els.filteredTitle.textContent = 'Search: ' + state.query;
    } else if (state.activePack !== 'all') {
      els.filteredTitle.textContent = prettyPack(state.activePack);
    } else {
      els.filteredTitle.textContent = 'All icons';
    }
  }

  // ---------- category preview cards ----------
  function buildCategoryGrid() {
    var packs = Object.keys(state.packCounts).sort();
    var frag = document.createDocumentFragment();
    packs.forEach(function (p) {
      var card = document.createElement('button');
      card.className = 'category-card';
      card.dataset.pack = p;
      card.setAttribute('aria-label', 'Browse ' + prettyPack(p) + ' pack');

      var head = document.createElement('div');
      head.className = 'category-card-head';
      var name = document.createElement('h3');
      name.className = 'category-card-name';
      name.textContent = prettyPack(p);
      var count = document.createElement('span');
      count.className = 'category-card-count';
      count.textContent = formatNum(state.packCounts[p]) + ' icons';
      head.appendChild(name);
      head.appendChild(count);

      var iconsRow = document.createElement('div');
      iconsRow.className = 'category-card-icons';
      var packIcons = state.iconsByPack[p] || [];
      var samples = pickSamples(packIcons, SAMPLE_PER_CATEGORY);
      samples.forEach(function (icon) {
        var i = document.createElement('i');
        i.className = icon.c;
        iconsRow.appendChild(i);
      });

      card.appendChild(head);
      card.appendChild(iconsRow);
      frag.appendChild(card);
    });
    els.categoryGrid.appendChild(frag);
  }

  function pickSamples(arr, n) {
    if (arr.length <= n) return arr.slice();
    var step = Math.floor(arr.length / n);
    var out = [];
    for (var i = 0; i < n; i++) out.push(arr[i * step]);
    return out;
  }

  // ---------- sidebar (filtered view) ----------
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
    syncSidebarActive();
  }

  function syncSidebarActive() {
    var pills = document.querySelectorAll('.pack-pill');
    for (var i = 0; i < pills.length; i++) {
      if (pills[i].dataset.pack === state.activePack) pills[i].classList.add('is-active');
      else pills[i].classList.remove('is-active');
    }
  }

  function setActivePack(pack) {
    state.activePack = pack;
    syncSidebarActive();
    writeUrlState();
  }

  // ---------- filter + render (filtered view) ----------
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
    els.filteredCount.textContent = formatNum(hits.length) + (hits.length === 1 ? ' icon' : ' icons');
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
      name.textContent = icon.c;
      card.appendChild(name);
      frag.appendChild(card);
    }
    els.grid.appendChild(frag);
    state.rendered = end;
    els.loadMoreWrap.hidden = state.rendered >= state.filtered.length;
  }

  // ---------- modal ----------
  function openModal(icon) {
    if (!icon) return;
    state.activeIcon = icon;
    state.activeTab = 'html';
    els.mPreview.className = icon.c;
    els.mTitle.textContent = icon.c;
    els.mPack.textContent = prettyPack(icon.p);
    els.sClass.textContent = icon.c;
    els.sUnicode.textContent = '\\' + icon.u;
    els.dlPackZip.href =
      'https://github.com/Vectopus/Atlas-icons-font/archive/refs/heads/main.zip';
    els.viewPackGh.href =
      'https://github.com/Vectopus/Atlas-icons-font/tree/main/packs/' + icon.p;
    syncModalTab();
    els.modal.hidden = false;
    els.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function syncModalTab() {
    var tabs = document.querySelectorAll('.modal-tab');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].dataset.tab === state.activeTab) tabs[i].classList.add('is-active');
      else tabs[i].classList.remove('is-active');
    }
    if (state.activeIcon) els.snippetCode.textContent = snippetFor(state.activeIcon, state.activeTab);
  }

  function snippetFor(icon, tab) {
    var pascalName = toPascal(icon.c.slice(3)); // drop 'at-' prefix → ArrowDownThin
    var snakeName = icon.c.slice(3).replace(/-/g, '_');
    switch (tab) {
      case 'react':
        return "import { " + pascalName + " } from '@vectoricons/atlas-icons-react';\n\n<" + pascalName + ' size={24} />';
      case 'vue':
        return "<template>\n  <" + pascalName + " :size=\"24\" />\n</template>\n\n<script setup>\nimport { " + pascalName + " } from '@vectoricons/atlas-icons-vue';\n</script>";
      case 'flutter':
        return "import 'package:atlas_icons/atlas_icons.dart';\n\nIcon(AtlasIcons." + snakeName + ", size: 24)";
      case 'reactnative':
        return "import { " + pascalName + " } from '@vectoricons/atlas-icons-react-native';\n\n<" + pascalName + ' size={24} />';
      case 'html':
      default:
        return '<i class="' + icon.c + '"></i>';
    }
  }

  function closeModal() {
    els.modal.hidden = true;
    els.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.activeIcon = null;
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
        // When the user starts a fresh search, reset the active pack to
        // "all" so results span the whole library — otherwise a previous
        // pack click silently scopes the search and returns 0 hits.
        if (state.query.trim() && state.activePack !== 'all') {
          state.activePack = 'all';
          syncSidebarActive();
        }
        writeUrlState();
        route();
      }, DEBOUNCE_MS);
    });

    document.addEventListener('click', function (e) {
      var catCard = e.target.closest('.category-card');
      if (catCard) {
        setActivePack(catCard.dataset.pack);
        route();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (e.target.closest('#backBtn')) {
        setActivePack('all');
        state.query = '';
        els.search.value = '';
        writeUrlState();
        route();
        return;
      }

      var pill = e.target.closest('.pack-pill');
      if (pill) {
        setActivePack(pill.dataset.pack);
        route();
        return;
      }

      var card = e.target.closest('.icon-card');
      if (card) {
        var idx = parseInt(card.dataset.idx, 10);
        openModal(state.filtered[idx]);
        return;
      }

      if (e.target.closest('[data-modal-close]')) {
        closeModal();
        return;
      }

      var tab = e.target.closest('.modal-tab');
      if (tab) {
        state.activeTab = tab.dataset.tab;
        syncModalTab();
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
      route();
    });
  }

  // ---------- url state ----------
  function readUrlState() {
    var hash = (location.hash || '').slice(1);
    if (!hash) return;
    var parts = hash.split('&');
    parts.forEach(function (segment) {
      var pair = segment.split('/');
      if (pair[0] === 'pack' && pair[1]) {
        if (state.packCounts[pair[1]] || pair[1] === 'all') state.activePack = pair[1];
      } else if (pair[0] === 'search' && pair.length > 1) {
        state.query = decodeURIComponent(pair.slice(1).join('/'));
        els.search.value = state.query;
      }
    });
    syncSidebarActive();
  }

  function writeUrlState() {
    var parts = [];
    if (state.activePack && state.activePack !== 'all') parts.push('pack/' + state.activePack);
    if (state.query) parts.push('search/' + encodeURIComponent(state.query));
    var newHash = parts.length ? '#' + parts.join('&') : '';
    if (newHash) {
      if (location.hash !== newHash) history.replaceState(null, '', newHash);
    } else if (location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  // ---------- helpers ----------
  function formatNum(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function prettyPack(p) {
    return p.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function toPascal(s) {
    return s.split('-').map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join('');
  }
})();
