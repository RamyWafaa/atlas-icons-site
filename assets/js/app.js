/* Atlas Icons — search, filter, copy, modal with live SVG preview + download.
   Vanilla JS, no innerHTML. */
(function () {
  'use strict';

  var DATA_URL = 'assets/data/icons.json';
  var PAGE_SIZE = 240;
  var DEBOUNCE_MS = 80;
  var DISCOVERY_GLYPHS = 3;
  var SVG_VIEWBOX = '-32 -32 1088 1088';
  var SVG_FLIP = 'translate(0, 960) scale(1, -1)';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var WEIGHT_SUFFIXES = { 'all': null, 'thin': '-thin', 'regular': '', 'bold': '-bold' };
  var SCROLL_COMPACT_AT = 220;

  var els = {
    search: document.getElementById('searchInput'),
    searchSticky: document.getElementById('searchInputSticky'),
    searchCount: document.getElementById('searchCount'),
    countAll: document.getElementById('countAll'),
    totalCount: document.getElementById('totalCount'),

    topbar: document.getElementById('topbar'),

    browseTitle: document.getElementById('browseTitle'),
    browseCount: document.getElementById('browseCount'),

    grid: document.getElementById('iconGrid'),
    empty: document.getElementById('emptyState'),
    packList: document.getElementById('packList'),
    loadMoreWrap: document.getElementById('loadMoreWrap'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),

    packDiscoveryGrid: document.getElementById('packDiscoveryGrid'),

    modal: document.getElementById('modalRoot'),
    modalSvgWrap: document.getElementById('modalSvgWrap'),
    mTitle: document.getElementById('modalTitle'),
    mPack: document.getElementById('modalPack'),
    snippetCode: document.getElementById('snippetCode'),
    sClass: document.getElementById('snippetClass'),
    sUnicode: document.getElementById('snippetUnicode'),
    dlPackZip: document.getElementById('downloadPackZip'),
    viewPackGh: document.getElementById('viewPackOnGithub'),

    ctrlColor: document.getElementById('ctrlColor'),
    ctrlSize: document.getElementById('ctrlSize'),
    ctrlSizeVal: document.getElementById('ctrlSizeVal'),
    ctrlVariants: document.getElementById('ctrlVariants'),
    variantsRow: document.getElementById('variantsRow'),
    btnDownloadSvg: document.getElementById('downloadSvgBtn'),
    btnCopySvg: document.getElementById('copySvgBtn'),
  };

  var state = {
    icons: [],                 // raw, all 7,980
    iconsByClass: {},
    iconsByPack: {},          // includes all weights
    iconsByPackByWeight: {},  // { pack: { thin: [...], regular: [...], bold: [...] } }
    packCounts: {},           // count of REGULAR icons per pack (for sidebar)
    packCountsRaw: {},        // count including all weights
    weight: 'regular',        // default — gives a consistent stroke per pack; users can flip to 'all' for everything
    activePack: 'all',
    query: '',
    filtered: [],
    rendered: 0,
    activeTab: 'svg',
    activeIcon: null,
    color: '#0a0a0a',
    size: 64,
    variants: [],
  };

  // ---------- bootstrap ----------
  fetch(DATA_URL)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      state.icons = data.icons || [];
      state.packCountsRaw = data.packs || {};
      indexIcons();
      computeRegularCounts();
      els.countAll.textContent = formatNum(totalForCurrentWeight());
      els.totalCount.textContent = formatNum(totalForCurrentWeight());
      buildPackSidebar();
      buildPackDiscovery();
      readUrlState();
      if (typeof window !== 'undefined' && window.__INITIAL_PACK
          && state.packCountsRaw[window.__INITIAL_PACK]) {
        state.activePack = window.__INITIAL_PACK;
        syncSidebarActive();
      }
      updateBrowseHeader();
      applyFilters();
      bindEvents();
      bindScrollWatcher();
    })
    .catch(function (e) {
      var msg = document.createElement('p');
      msg.style.padding = '40px';
      msg.style.color = '#888';
      msg.style.textAlign = 'center';
      msg.textContent = 'Could not load icons. Refresh the page.';
      els.grid.appendChild(msg);
      console.error(e);
    });

  function indexIcons() {
    state.iconsByPack = {};
    state.iconsByClass = {};
    state.iconsByPackByWeight = {};
    for (var i = 0; i < state.icons.length; i++) {
      var icon = state.icons[i];
      if (!state.iconsByPack[icon.p]) state.iconsByPack[icon.p] = [];
      state.iconsByPack[icon.p].push(icon);
      state.iconsByClass[icon.c] = icon;
      var w = weightOf(icon.c);
      if (!state.iconsByPackByWeight[icon.p]) state.iconsByPackByWeight[icon.p] = { thin: [], regular: [], bold: [] };
      state.iconsByPackByWeight[icon.p][w].push(icon);
    }
  }

  function weightOf(className) {
    if (className.endsWith('-thin')) return 'thin';
    if (className.endsWith('-bold')) return 'bold';
    return 'regular';
  }

  function computeRegularCounts() {
    state.packCounts = {};
    if (state.weight === 'all') {
      Object.keys(state.packCountsRaw).forEach(function (p) {
        state.packCounts[p] = state.packCountsRaw[p];
      });
    } else {
      Object.keys(state.iconsByPackByWeight).forEach(function (p) {
        state.packCounts[p] = state.iconsByPackByWeight[p][state.weight].length;
      });
    }
  }

  function totalForCurrentWeight() {
    var t = 0;
    Object.keys(state.packCounts).forEach(function (p) { t += state.packCounts[p]; });
    return t;
  }

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
    syncSidebarActive();
  }

  function refreshPackCounts() {
    var pills = document.querySelectorAll('.pack-pill[data-pack]');
    pills.forEach(function (pill) {
      var p = pill.dataset.pack;
      if (p === 'all') {
        var t = totalForCurrentWeight();
        var cnt = pill.querySelector('.pill-count');
        if (cnt) cnt.textContent = formatNum(t);
      } else {
        var cnt = pill.querySelector('.pill-count');
        if (cnt) cnt.textContent = formatNum(state.packCounts[p] || 0);
      }
    });
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

  // ---------- pack discovery ----------
  function buildPackDiscovery() {
    var packs = Object.keys(state.packCountsRaw).sort();
    var frag = document.createDocumentFragment();
    packs.forEach(function (p) {
      var card = document.createElement('a');
      card.className = 'pack-card';
      card.href = '/pack/' + p + '/';
      card.dataset.pack = p;
      card.setAttribute('aria-label', 'Browse ' + prettyPack(p) + ' pack');

      // Top row — name + count chip
      var text = document.createElement('div');
      text.className = 'pack-card-text';
      var name = document.createElement('h3');
      name.className = 'pack-card-name';
      name.textContent = prettyPack(p);
      var count = document.createElement('span');
      count.className = 'pack-card-count';
      count.textContent = formatNum(state.packCountsRaw[p]);
      text.appendChild(name);
      text.appendChild(count);

      // Bottom row — 3 sample glyphs (regular weight if available, else first 3)
      var glyphs = document.createElement('div');
      glyphs.className = 'pack-card-glyphs';
      var sourceWeight = state.weight === 'all' ? 'regular' : state.weight;
      var packIcons = (state.iconsByPackByWeight[p] && state.iconsByPackByWeight[p][sourceWeight]) || [];
      if (packIcons.length === 0) packIcons = state.iconsByPack[p] || [];
      var samples = pickSamples(packIcons, DISCOVERY_GLYPHS);
      samples.forEach(function (icon) {
        var i = document.createElement('i');
        i.className = icon.c;
        glyphs.appendChild(i);
      });

      card.appendChild(text);
      card.appendChild(glyphs);
      frag.appendChild(card);
    });
    els.packDiscoveryGrid.appendChild(frag);
  }

  function pickSamples(arr, n) {
    if (arr.length <= n) return arr.slice();
    var step = Math.floor(arr.length / n);
    var out = [];
    for (var i = 0; i < n; i++) out.push(arr[i * step]);
    return out;
  }

  // ---------- filter + render ----------
  function updateBrowseHeader() {
    if (state.query.trim()) {
      els.browseTitle.textContent = 'Search: ' + state.query;
    } else if (state.activePack !== 'all') {
      els.browseTitle.textContent = prettyPack(state.activePack);
    } else {
      els.browseTitle.textContent = 'All icons';
    }
  }

  // Token-based search: query must be a prefix of one of the words in the
  // icon's name (or pack's name). Avoids accidental matches like "cat" hitting
  // "communication" via substring.
  function matchesQuery(icon, q) {
    if (!q) return true;
    var nameTokens = icon.n.split(' ');
    for (var i = 0; i < nameTokens.length; i++) {
      if (nameTokens[i].indexOf(q) === 0) return true;
    }
    var packTokens = icon.p.split('-');
    for (var i = 0; i < packTokens.length; i++) {
      if (packTokens[i].indexOf(q) === 0) return true;
    }
    return false;
  }

  function applyFilters() {
    var q = state.query.trim().toLowerCase();
    var pack = state.activePack;
    var hits = [];
    for (var i = 0; i < state.icons.length; i++) {
      var icon = state.icons[i];
      // Weight filter — 'all' skips this constraint entirely
      if (state.weight !== 'all' && weightOf(icon.c) !== state.weight) continue;
      if (pack !== 'all' && icon.p !== pack) continue;
      if (!matchesQuery(icon, q)) continue;
      hits.push(icon);
    }
    state.filtered = hits;
    state.rendered = 0;
    while (els.grid.firstChild) els.grid.removeChild(els.grid.firstChild);
    els.empty.hidden = hits.length > 0;
    els.searchCount.textContent = q ? formatNum(hits.length) + ' / ' + formatNum(totalForCurrentWeight()) : '';
    els.browseCount.textContent = formatNum(hits.length) + ' icons';
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
      card.title = icon.c;
      card.setAttribute('aria-label', icon.n + ' icon, ' + icon.p + ' pack');
      var glyph = document.createElement('i');
      glyph.className = icon.c;
      card.appendChild(glyph);
      frag.appendChild(card);
    }
    els.grid.appendChild(frag);
    state.rendered = end;
    els.loadMoreWrap.hidden = state.rendered >= state.filtered.length;
  }

  // ---------- SVG ----------
  function buildSvgElement(icon, color, size) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('viewBox', SVG_VIEWBOX);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', color);
    var g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', SVG_FLIP);
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', icon.d || '');
    g.appendChild(path);
    svg.appendChild(g);
    return svg;
  }

  function buildSvgString(icon, color, size) {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + SVG_VIEWBOX + '"',
      ' width="' + size + '" height="' + size + '" fill="' + color + '">',
      '<g transform="' + SVG_FLIP + '">',
      '<path d="' + (icon.d || '') + '"/>',
      '</g>',
      '</svg>'
    ].join('');
  }

  // ---------- variants (modal stroke toggle) ----------
  function findVariants(icon) {
    var m = icon.c.match(/^(at-.+?)(-thin|-bold)?$/);
    if (!m) return null;
    var root = m[1];
    var found = [];
    var suffixes = [
      { key: 'thin', sfx: '-thin', label: 'Thin' },
      { key: 'regular', sfx: '', label: 'Regular' },
      { key: 'bold', sfx: '-bold', label: 'Bold' }
    ];
    suffixes.forEach(function (s) {
      var ic = state.iconsByClass[root + s.sfx];
      if (ic) found.push({ key: s.key, label: s.label, icon: ic });
    });
    return found.length > 1 ? found : null;
  }

  function buildVariantButtons(variants, activeIcon) {
    while (els.variantsRow.firstChild) els.variantsRow.removeChild(els.variantsRow.firstChild);
    variants.forEach(function (v) {
      var btn = document.createElement('button');
      btn.className = 'variant-btn' + (v.icon.c === activeIcon.c ? ' is-active' : '');
      btn.dataset.variantClass = v.icon.c;
      btn.textContent = v.label;
      els.variantsRow.appendChild(btn);
    });
  }

  // ---------- modal ----------
  function openModal(icon) {
    if (!icon) return;
    state.activeIcon = icon;
    state.activeTab = 'svg';
    state.color = els.ctrlColor.value || '#0a0a0a';
    state.size = parseInt(els.ctrlSize.value, 10) || 64;

    refreshPreview();

    els.mTitle.textContent = icon.c;
    els.mPack.textContent = prettyPack(icon.p);
    els.sClass.textContent = icon.c;
    els.sUnicode.textContent = '\\' + icon.u;
    els.dlPackZip.href = 'https://github.com/Vectopus/Atlas-icons-font/archive/refs/heads/main.zip';
    els.viewPackGh.href = 'https://github.com/Vectopus/Atlas-icons-font/tree/main/packs/' + icon.p;

    var variants = findVariants(icon);
    if (variants && variants.length > 1) {
      state.variants = variants;
      buildVariantButtons(variants, icon);
      els.ctrlVariants.hidden = false;
    } else {
      state.variants = [];
      els.ctrlVariants.hidden = true;
    }

    syncModalTab();
    els.modal.hidden = false;
    els.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function refreshPreview() {
    while (els.modalSvgWrap.firstChild) els.modalSvgWrap.removeChild(els.modalSvgWrap.firstChild);
    if (!state.activeIcon) return;
    var svg = buildSvgElement(state.activeIcon, state.color, state.size);
    els.modalSvgWrap.appendChild(svg);
    if (state.activeTab === 'svg') {
      els.snippetCode.textContent = buildSvgString(state.activeIcon, state.color, state.size);
    }
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
    var pascalName = toPascal(icon.c.slice(3));
    var snakeName = icon.c.slice(3).replace(/-/g, '_');
    switch (tab) {
      case 'svg':
        return buildSvgString(icon, state.color, state.size);
      case 'react':
        return "import { " + pascalName + " } from '@vectoricons/atlas-icons-react';\n\n<" + pascalName + ' size={' + state.size + '} color="' + state.color + '" />';
      case 'vue':
        return "<template>\n  <" + pascalName + " :size=\"" + state.size + "\" color=\"" + state.color + "\" />\n</template>\n\n<script setup>\nimport { " + pascalName + " } from '@vectoricons/atlas-icons-vue';\n</script>";
      case 'flutter':
        return "import 'package:atlas_icons/atlas_icons.dart';\n\nIcon(AtlasIcons." + snakeName + ", size: " + state.size + ",\n  color: Color(0xFF" + state.color.replace('#', '').toUpperCase() + "))";
      case 'reactnative':
        return "import { " + pascalName + " } from '@vectoricons/atlas-icons-react-native';\n\n<" + pascalName + ' size={' + state.size + '} color="' + state.color + '" />';
      case 'html':
      default:
        return '<i class="' + icon.c + '" style="color:' + state.color + ';font-size:' + state.size + 'px"></i>';
    }
  }

  function closeModal() {
    els.modal.hidden = true;
    els.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.activeIcon = null;
  }

  // ---------- copy / download ----------
  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
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

  function downloadSvgFile(icon, color, size) {
    var svg = buildSvgString(icon, color, size);
    var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = icon.c + '.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- weight filter ----------
  function setWeight(w) {
    if (!WEIGHT_SUFFIXES.hasOwnProperty(w)) return;
    state.weight = w;
    var btns = document.querySelectorAll('.weight-btn');
    for (var i = 0; i < btns.length; i++) {
      var active = btns[i].dataset.weight === w;
      if (active) btns[i].classList.add('is-active');
      else btns[i].classList.remove('is-active');
      btns[i].setAttribute('aria-checked', String(active));
    }
    computeRegularCounts();
    refreshPackCounts();
    applyFilters();
    // Refresh discovery cards too — the sample icons should reflect the active weight
    while (els.packDiscoveryGrid.firstChild) els.packDiscoveryGrid.removeChild(els.packDiscoveryGrid.firstChild);
    buildPackDiscovery();
  }

  // ---------- topbar scroll behavior ----------
  function bindScrollWatcher() {
    var ticking = false;
    function update() {
      var scrolled = window.scrollY > SCROLL_COMPACT_AT;
      if (scrolled) els.topbar.classList.add('is-compact');
      else els.topbar.classList.remove('is-compact');
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }

  // Sync the two search inputs (hero + sticky topbar) — both update the same query
  function syncSearchInputs(value, source) {
    if (source !== 'hero') els.search.value = value;
    if (source !== 'sticky') els.searchSticky.value = value;
  }

  // ---------- events ----------
  function bindEvents() {
    var debounce;
    function onSearchInput(e, source) {
      clearTimeout(debounce);
      var val = e.target.value;
      syncSearchInputs(val, source);
      debounce = setTimeout(function () {
        state.query = val;
        if (state.query.trim() && state.activePack !== 'all') {
          state.activePack = 'all';
          syncSidebarActive();
        }
        writeUrlState();
        updateBrowseHeader();
        applyFilters();
      }, DEBOUNCE_MS);
    }
    els.search.addEventListener('input', function (e) { onSearchInput(e, 'hero'); });
    els.searchSticky.addEventListener('input', function (e) { onSearchInput(e, 'sticky'); });

    els.ctrlColor.addEventListener('input', function () {
      state.color = els.ctrlColor.value;
      refreshPreview();
      if (state.activeTab !== 'svg') syncModalTab();
    });

    els.ctrlSize.addEventListener('input', function () {
      state.size = parseInt(els.ctrlSize.value, 10);
      els.ctrlSizeVal.textContent = String(state.size);
      refreshPreview();
      if (state.activeTab !== 'svg') syncModalTab();
    });

    els.btnDownloadSvg.addEventListener('click', function () {
      if (state.activeIcon) downloadSvgFile(state.activeIcon, state.color, state.size);
    });

    els.btnCopySvg.addEventListener('click', function () {
      if (!state.activeIcon) return;
      copyText(buildSvgString(state.activeIcon, state.color, state.size), els.btnCopySvg);
    });

    document.addEventListener('click', function (e) {
      var weightBtn = e.target.closest('.weight-btn');
      if (weightBtn) {
        setWeight(weightBtn.dataset.weight);
        return;
      }

      var packCard = e.target.closest('.pack-card');
      if (packCard) {
        if (e.button === 1 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        setActivePack(packCard.dataset.pack);
        updateBrowseHeader();
        applyFilters();
        var browseEl = document.getElementById('browse');
        if (browseEl) browseEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      var pill = e.target.closest('.pack-pill');
      if (pill) {
        setActivePack(pill.dataset.pack);
        updateBrowseHeader();
        applyFilters();
        return;
      }

      var iconBtn = e.target.closest('.icon-card');
      if (iconBtn) {
        var idx = parseInt(iconBtn.dataset.idx, 10);
        openModal(state.filtered[idx]);
        return;
      }

      var variantBtn = e.target.closest('.variant-btn');
      if (variantBtn) {
        var newClass = variantBtn.dataset.variantClass;
        var newIcon = state.iconsByClass[newClass];
        if (newIcon) {
          state.activeIcon = newIcon;
          els.mTitle.textContent = newIcon.c;
          els.sClass.textContent = newIcon.c;
          els.sUnicode.textContent = '\\' + newIcon.u;
          buildVariantButtons(state.variants, newIcon);
          refreshPreview();
          if (state.activeTab !== 'svg') syncModalTab();
        }
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
      if (copyBtn && copyBtn.dataset.copy) {
        var srcEl = document.getElementById(copyBtn.dataset.copy);
        if (srcEl) copyText(srcEl.textContent, copyBtn);
      }
    });

    els.loadMoreBtn.addEventListener('click', renderMore);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.modal.hidden) closeModal();
      if (e.key === '/' && document.activeElement !== els.search && document.activeElement !== els.searchSticky) {
        e.preventDefault();
        var target = els.topbar.classList.contains('is-compact') ? els.searchSticky : els.search;
        target.focus();
      }
    });

    window.addEventListener('hashchange', function () {
      readUrlState();
      updateBrowseHeader();
      applyFilters();
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
        if (state.packCountsRaw[pair[1]] || pair[1] === 'all') state.activePack = pair[1];
      } else if (pair[0] === 'search' && pair.length > 1) {
        state.query = decodeURIComponent(pair.slice(1).join('/'));
        els.search.value = state.query;
        els.searchSticky.value = state.query;
      } else if (pair[0] === 'weight' && WEIGHT_SUFFIXES.hasOwnProperty(pair[1])) {
        state.weight = pair[1];
        // Sync UI in next tick (after build)
      }
    });
    syncSidebarActive();
  }

  function writeUrlState() {
    var parts = [];
    if (state.activePack && state.activePack !== 'all') parts.push('pack/' + state.activePack);
    if (state.query) parts.push('search/' + encodeURIComponent(state.query));
    if (state.weight !== 'regular') parts.push('weight/' + state.weight);
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
