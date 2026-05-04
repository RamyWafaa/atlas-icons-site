/* Atlas Icons — search, filter, copy, modal with live SVG preview + download.
   Vanilla JS, no innerHTML. */
(function () {
  'use strict';

  var DATA_URL = 'assets/data/icons.json';
  var PAGE_SIZE = 240;
  var DEBOUNCE_MS = 80;
  var DISCOVERY_GLYPHS = 4;
  // viewBox is wider than 1024x1024 so paths that extend beyond the
  // declared font ascent/descent (some go to Y=-85 in original coords,
  // which maps to Y=1045 visual) don't get clipped at the bottom edge.
  var SVG_VIEWBOX = '-32 -32 1088 1088';
  var SVG_FLIP = 'translate(0, 960) scale(1, -1)';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var els = {
    search: document.getElementById('searchInput'),
    searchCount: document.getElementById('searchCount'),
    countAll: document.getElementById('countAll'),
    totalCount: document.getElementById('totalCount'),

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
    icons: [],
    iconsByClass: {},
    iconsByPack: {},
    packCounts: {},
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
      state.packCounts = data.packs || {};
      var total = data.total || state.icons.length;
      els.countAll.textContent = formatNum(total);
      els.totalCount.textContent = formatNum(total);
      indexIcons();
      buildPackSidebar();
      buildPackDiscovery();
      readUrlState();
      // Per-pack pages set window.__INITIAL_PACK before app.js loads.
      if (typeof window !== 'undefined' && window.__INITIAL_PACK
          && state.packCounts[window.__INITIAL_PACK]) {
        state.activePack = window.__INITIAL_PACK;
        syncSidebarActive();
      }
      updateBrowseHeader();
      applyFilters();
      bindEvents();
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
    for (var i = 0; i < state.icons.length; i++) {
      var icon = state.icons[i];
      if (!state.iconsByPack[icon.p]) state.iconsByPack[icon.p] = [];
      state.iconsByPack[icon.p].push(icon);
      state.iconsByClass[icon.c] = icon;
    }
  }

  // ---------- sidebar (always visible) ----------
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

  // ---------- pack discovery cards (compact, below grid) ----------
  function buildPackDiscovery() {
    var packs = Object.keys(state.packCounts).sort();
    var frag = document.createDocumentFragment();
    packs.forEach(function (p) {
      var card = document.createElement('a');
      card.className = 'pack-card';
      card.href = '/pack/' + p + '/';
      card.dataset.pack = p;
      card.setAttribute('aria-label', 'Browse ' + prettyPack(p) + ' pack');

      var glyphs = document.createElement('div');
      glyphs.className = 'pack-card-glyphs';
      var packIcons = state.iconsByPack[p] || [];
      var samples = pickSamples(packIcons, DISCOVERY_GLYPHS);
      samples.forEach(function (icon) {
        var i = document.createElement('i');
        i.className = icon.c;
        glyphs.appendChild(i);
      });

      var text = document.createElement('div');
      text.className = 'pack-card-text';
      var name = document.createElement('span');
      name.className = 'pack-card-name';
      name.textContent = prettyPack(p);
      var count = document.createElement('span');
      count.className = 'pack-card-count';
      count.textContent = formatNum(state.packCounts[p]) + ' icons';
      text.appendChild(name);
      text.appendChild(count);

      card.appendChild(glyphs);
      card.appendChild(text);
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

  // ---------- browse header + filter + render ----------
  function updateBrowseHeader() {
    if (state.query.trim()) {
      els.browseTitle.textContent = 'Search: ' + state.query;
    } else if (state.activePack !== 'all') {
      els.browseTitle.textContent = prettyPack(state.activePack);
    } else {
      els.browseTitle.textContent = 'All icons';
    }
  }

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
    els.browseCount.textContent = formatNum(hits.length) + (hits.length === 1 ? ' icon' : ' icons');
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

  // ---------- SVG markup builders ----------
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

  // ---------- variants (-thin, -bold, -fill, -duotone) ----------
  function findVariants(icon) {
    var m = icon.c.match(/^(at-.+?)(-thin|-bold|-fill|-duotone|-solid|-line)?$/);
    if (!m) return null;
    var root = m[1];
    var found = [];
    var suffixes = ['', '-thin', '-bold', '-fill', '-duotone', '-solid', '-line'];
    var labels = { '': 'Regular', '-thin': 'Thin', '-bold': 'Bold', '-fill': 'Fill', '-duotone': 'Duotone', '-solid': 'Solid', '-line': 'Line' };
    suffixes.forEach(function (s) {
      var ic = state.iconsByClass[root + s];
      if (ic) found.push({ key: s || 'regular', label: labels[s], icon: ic });
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

  // ---------- events ----------
  function bindEvents() {
    var debounce;
    els.search.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        state.query = els.search.value;
        if (state.query.trim() && state.activePack !== 'all') {
          state.activePack = 'all';
          syncSidebarActive();
        }
        writeUrlState();
        updateBrowseHeader();
        applyFilters();
      }, DEBOUNCE_MS);
    });

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
      // Pack discovery card → filter the main grid + scroll up
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

      // Sidebar pack pill → filter
      var pill = e.target.closest('.pack-pill');
      if (pill) {
        setActivePack(pill.dataset.pack);
        updateBrowseHeader();
        applyFilters();
        return;
      }

      // Icon card → modal
      var iconBtn = e.target.closest('.icon-card');
      if (iconBtn) {
        var idx = parseInt(iconBtn.dataset.idx, 10);
        openModal(state.filtered[idx]);
        return;
      }

      // Variant toggle in modal
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

      // Modal close
      if (e.target.closest('[data-modal-close]')) {
        closeModal();
        return;
      }

      // Modal tab switch
      var tab = e.target.closest('.modal-tab');
      if (tab) {
        state.activeTab = tab.dataset.tab;
        syncModalTab();
        return;
      }

      // Generic copy buttons
      var copyBtn = e.target.closest('.btn-copy');
      if (copyBtn && copyBtn.dataset.copy) {
        var srcEl = document.getElementById(copyBtn.dataset.copy);
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
