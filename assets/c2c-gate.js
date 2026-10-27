/*!
 * C2C Studio · Wix membership gating + tier enforcement + zoom helpers
 * Loaded (classic, synchronous) from index.html / 404.html BEFORE the app bundle.
 *
 * Flow: chetchic.com members page -> signed 5-min launch token (?c2c_token=) -> POST /_functions/verifyToken
 *       -> 24h signed sessionToken in localStorage, re-validated on every load.
 * Tiers: see FEATURES below. No valid token/session = gate screen.
 *
 * The secret never leaves Wix. UI limits here are cosmetic; the upload count is enforced on Wix.
 *
 * >>> PREVIEW EDITION: no sign-in, no Wix calls. A floating PREVIEW switch picks the tier
 * >>> (stored in localStorage), and the free demo upload is counted locally. Not the live app.
 */
(function () {
  'use strict';
  // ======================================================================
  //  EASY-TO-EDIT SETTINGS
  // ======================================================================
  var SITE = 'https://www.chetchic.com';
  var CFG = {
    signInUrl: SITE,                                   // where the gate screen's button goes
    upgradeUrl: SITE,                                  // "Get the Haute Pass" link
    plansUrl: SITE + '/plans-pricing',                 // gate button when the member has no plan (CONFIRM this page address)
    verifyTokenUrl: null,  // PREVIEW: not used
    useUploadUrl: null,    // PREVIEW: not used
    sessionKey: 'c2c.wixSession',
    watermarkText: 'Chet Chic Demo \u00b7 chetchic.com',
    fetchTimeoutMs: 8000
  };

  // Feature-to-tier map. Add a tier (e.g. a 2027 plan) by adding a block here and
  // returning that tier name from the Wix backend (verifyToken -> tier).
  var FEATURES = {
    haute: {                    // "Haute Pass" (paid plan)
      label: 'Haute Pass',
      uploads: 'unlimited',     // 'unlimited' or a number (counted on the server)
      templates: 'all',         // 'all' or how many rotating designs
      watermark: false,
      exportScale: 2            // 2 = full high-resolution export, 1 = half
    },
    free: {                     // "Friends of Chet Chic" (free pricing plan, active order required)
      label: 'Friends of Chet Chic',
      uploads: 1,
      templates: 10,
      watermark: true,
      exportScale: 1
    }
  };
  // ======================================================================

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function readSession() {
    var raw = lsGet(CFG.sessionKey);
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (s && s.sessionToken && typeof s.sessionExp === 'number' && s.sessionExp > Date.now() && FEATURES[s.tier]) return s;
    } catch (e) {}
    lsDel(CFG.sessionKey);
    return null;
  }
  function saveSession(j) {
    var s = { sessionToken: j.sessionToken, sessionExp: Number(j.sessionExp), tier: j.tier, memberId: j.memberId || null, savedAt: Date.now() };
    lsSet(CFG.sessionKey, JSON.stringify(s));
    return s;
  }

  var listeners = [];
  // tier: 'none' (locked, gate screen) | 'free' | 'haute' | any key of FEATURES
  var state = { tier: 'none', memberId: null, status: 'pending', session: null };
  function feat() { return FEATURES[state.tier] || null; }

  function setTier(tier, extra) {
    state.tier = tier;
    for (var k in (extra || {})) state[k] = extra[k];
    document.documentElement.setAttribute('data-c2c-tier', tier);
    listeners.forEach(function (fn) { try { fn(state); } catch (e) {} });
    try { window.dispatchEvent(new CustomEvent('c2c-tier', { detail: { tier: tier, status: state.status } })); } catch (e) {}
    renderBadge();
    renderGate();
  }

  function stripToken() {
    try {
      var u = new URL(window.location.href);
      var had = false;
      ['c2c_token', 'wix_member'].forEach(function (p) { if (u.searchParams.has(p)) { u.searchParams.delete(p); had = true; } });
      if (!had) return;
      var q = u.searchParams.toString();
      history.replaceState(history.state, '', u.pathname + (q ? '?' + q : '') + u.hash);
    } catch (e) {}
  }

  // PREVIEW: never contacts Wix.
  function postJSON() { return Promise.resolve({ status: 'network-error' }); }

  function applyVerify(j) {
    if (j && (j.status === 'authorized' || j.status === 'free') && j.sessionToken && FEATURES[j.tier]) {
      var s = saveSession(j);
      setTier(j.tier, { memberId: s.memberId, status: j.status, session: s });
      return true;
    }
    return false;
  }

  // ---------- PREVIEW: tier comes from the floating switch, never from Wix ----------
  var PREVIEW_KEY = 'c2c.preview.tier', PREVIEW_UP = 'c2c.preview.uploadsUsed';
  var MODES = [
    { id: 'haute', label: 'Haute Pass (paid)' },
    { id: 'free', label: 'Friends of Chet Chic (free)' },
    { id: 'noplan', label: 'No plan (gate screen)' },
    { id: 'signedout', label: 'Signed out (gate screen)' }
  ];
  function previewMode() { var m = lsGet(PREVIEW_KEY); return MODES.some(function (x) { return x.id === m; }) ? m : 'haute'; }
  function uploadsUsed() { return Math.max(0, parseInt(lsGet(PREVIEW_UP) || '0', 10) || 0); }
  function init() {
    stripToken();
    var m = previewMode();
    if (m === 'haute' || m === 'free') {
      var sess = { sessionToken: 'preview', sessionExp: Date.now() + 864e5, tier: m, memberId: 'preview-' + m, savedAt: Date.now() };
      setTier(m, { memberId: sess.memberId, status: m === 'haute' ? 'authorized' : 'free', session: sess });
    } else if (m === 'noplan') setTier('none', { status: 'noplan', memberId: null, session: null });
    else setTier('none', { status: 'signed-out', memberId: null, session: null });
    return Promise.resolve(state);
  }

  function requestUpload() {
    var f = feat();
    if (!f) return Promise.resolve({ allowed: false, message: 'Sign in on chetchic.com to upload a photo.' });
    if (f.uploads === 'unlimited') return Promise.resolve({ allowed: true });
    var used = uploadsUsed(), limit = Number(f.uploads) || 0;
    if (used >= limit) return Promise.resolve({ allowed: false, message: window.C2CGate.uploadBlockedMessage, uploadsUsed: used, limit: limit });
    lsSet(PREVIEW_UP, String(used + 1)); renderPreview();
    return Promise.resolve({ allowed: true, uploadsUsed: used + 1, limit: limit });
  }

  // ---------- PREVIEW switch (floating, always on top) ----------
  var pv = null, pvOpen = false;
  var SHORT = { haute: 'Haute Pass', free: 'Friends (free)', noplan: 'No plan', signedout: 'Signed out' };
  // Inside the studio the switch sits in the header (in the page flow, so it never covers a control).
  // On the gate screens (or before the app has drawn) it floats bottom-left.
  function pvHost() { var bd = state.tier !== 'none' && document.getElementById('c2c-tier-badge'); return (bd && bd.parentElement) || document.body; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderPreview() {
    if (!document.body) return;
    if (!pv) {
      pv = document.createElement('div'); pv.id = 'c2c-preview';
      pv.addEventListener('click', function (e) {
        var t = e.target.closest('[data-pv]'); if (!t) return;
        var a = t.getAttribute('data-pv');
        if (a === 'toggle') { pvOpen = !pvOpen; renderPreview(); return; }
        if (a === 'reset') { lsDel(PREVIEW_UP); renderPreview(); return; }
        if (a.indexOf('mode:') === 0) { var m = a.slice(5); if (m !== previewMode()) { lsSet(PREVIEW_KEY, m); location.reload(); } else { pvOpen = false; renderPreview(); } }
      });
    }
    var m = previewMode(), cur = MODES.filter(function (x) { return x.id === m; })[0];
    var free = FEATURES.free, used = uploadsUsed();
    var host = pvHost(), inline = host !== document.body;
    pv.className = inline ? 'c2c-pv-inline' : 'c2c-pv-float';
    pv.setAttribute('data-open', pvOpen ? '1' : '0');
    pv.setAttribute('data-mode', m);
    pv.innerHTML =
      '<button type="button" class="c2c-pv-pill" data-pv="toggle" aria-expanded="' + pvOpen + '" aria-controls="c2c-pv-panel" title="Preview copy \u2013 not the live app. Tap to switch tier.">' +
        '<b>PREVIEW</b><span class="c2c-pv-sub">Preview copy \u2013 not the live app</span><span class="c2c-pv-cur">' + esc(inline ? SHORT[m] : cur.label) + ' \u25BE</span></button>' +
      (pvOpen ? '<div class="c2c-pv-panel" id="c2c-pv-panel" role="group" aria-label="Preview tier switch">' +
        '<p class="c2c-pv-h">Preview copy \u2013 not the live app. No sign-in, nothing is sent to chetchic.com. Pick what a visitor sees:</p>' +
        MODES.map(function (x) { return '<button type="button" class="c2c-pv-opt" data-pv="mode:' + x.id + '" aria-pressed="' + (x.id === m) + '">' + (x.id === m ? '\u25C9 ' : '\u25CB ') + esc(x.label) + '</button>'; }).join('') +
        '<p class="c2c-pv-up">Free demo uploads used: <b data-pv-used>' + used + '</b> of ' + free.uploads + '</p>' +
        '<button type="button" class="c2c-pv-opt c2c-pv-reset" data-pv="reset">Reset free demo upload</button>' +
        '<button type="button" class="c2c-pv-opt c2c-pv-close" data-pv="toggle">Close</button>' +
      '</div>' : '');
    if (pv.parentElement !== host) { host.appendChild(pv); if (inline) requestAnimationFrame(function () { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }); }
    var panel = pv.querySelector('.c2c-pv-panel');
    if (panel && inline) { var r = pv.querySelector('.c2c-pv-pill').getBoundingClientRect(); panel.style.top = Math.round(r.bottom + 6) + 'px'; panel.style.left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - 298)) + 'px'; }
  }

  // ---------- gate screen (no valid token or session) ----------
  var gate = null;
  function renderGate() {
    if (!document.body) return;
    var locked = state.tier === 'none';
    if (!locked) { if (gate) gate.style.display = 'none'; return; }
    if (!gate) {
      gate = document.createElement('div');
      gate.id = 'c2c-gate';
      gate.setAttribute('role', 'dialog');
      gate.setAttribute('aria-modal', 'true');
      gate.setAttribute('aria-labelledby', 'c2c-gate-title');
    }
    var checking = state.status === 'checking' || state.status === 'pending';
    var noplan = state.status === 'noplan';
    var msg = checking ? 'Checking your Chet Chic membership\u2026'
      : noplan ? 'You are signed in, but your account does not have a plan yet. The Friends of Chet Chic plan is free. Choose it (or the Haute Pass), then open C2C Studio again from your member page.'
      : state.status === 'invalid-token' ? 'That sign-in link has expired or is not valid. Please open C2C Studio again from chetchic.com.'
      : 'C2C Studio is free for Chet Chic members. Sign in (or join free) on chetchic.com, then open C2C Studio from your member page.';
    gate.innerHTML =
      '<div class="c2c-gate-card">' +
      '<img src="logo.png" alt="Chet Chic" width="72" height="72"/>' +
      '<h1 id="c2c-gate-title">' + (checking ? 'One moment' : noplan ? 'Choose a free or Haute Pass plan on chetchic.com to use C2C Studio' : 'Sign in on chetchic.com to use C2C Studio') + '</h1>' +
      '<p>' + msg + '</p>' +
      (checking ? '' : noplan ? '<a class="c2c-gate-btn" href="' + CFG.plansUrl + '">Choose a plan</a>' : '<a class="c2c-gate-btn" href="' + CFG.signInUrl + '">Go to chetchic.com</a>') +
      '<p class="c2c-pv-gatenote">Preview copy: this is the screen a visitor would see. Use the PREVIEW switch to change it.</p>' +
      '</div>';
    gate.setAttribute('data-status', state.status);
    gate.style.display = 'flex';
    if (!gate.isConnected) document.body.appendChild(gate);
  }

  // ---------- templates: 10 rotating designs for the free tier ----------
  var allTemplateIds = [];
  function weekSeed() { return Math.floor((Date.now() / 86400000 + 3) / 7); } // changes every Monday (UTC)
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rotationCache = { key: '', set: null };
  function freeSet() {
    var f0 = feat();
    var key = weekSeed() + '|' + (f0 && f0.templates) + '|' + allTemplateIds.join(',');
    if (rotationCache.key === key) return rotationCache.set;
    var ids = allTemplateIds.slice();
    var rnd = mulberry32(weekSeed() * 2654435761);
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    var f = feat(), n = f && typeof f.templates === 'number' ? f.templates : ids.length;
    rotationCache = { key: key, set: new Set(ids.slice(0, n)) };
    return rotationCache.set;
  }

  // ---------- export watermark ----------
  function drawWatermark(ctx, w, h, scale) {
    scale = scale || 1;
    ctx.save();
    var fs = Math.max(12, Math.round(Math.min(w, h) / 18));
    ctx.font = '600 ' + fs + 'px Poppins, Avenir, Helvetica, Arial, sans-serif';
    ctx.fillStyle = 'rgba(65,65,110,0.16)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    var tw = ctx.measureText(CFG.watermarkText).width + fs * 2.5;
    var th = fs * 4;
    var R = Math.hypot(w, h);
    var row = 0;
    for (var y = -R / 2; y <= R / 2; y += th, row++) {
      var off = (row % 2) * tw / 2;
      for (var x = -R / 2 - off; x <= R / 2 + tw; x += tw) ctx.fillText(CFG.watermarkText, x, y);
    }
    ctx.restore();
    // small footer strip
    ctx.save();
    var fh = Math.max(16, Math.round(fs * 1.1));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, h - fh - 8, w, fh + 8);
    ctx.fillStyle = '#6e2438';
    ctx.font = Math.round(fh * 0.62) + 'px Avenir, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Free demo export \u00b7 Unlock clean, high-resolution files with the Haute Pass at chetchic.com', w / 2, h - fh / 2 - 4);
    ctx.restore();
  }

  function exportCanvas(src) {
    var f = feat() || FEATURES.free;
    if (!src || (!f.watermark && (f.exportScale || 2) >= 2)) return src;
    // The app renders exports at 2x. exportScale 1 = half size.
    var k = Math.min(1, (f.exportScale || 2) / 2);
    var w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    if (!ctx) return src;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, 0, 0, w, h);
    if (f.watermark) drawWatermark(ctx, w, h);
    if (f.watermark) c.setAttribute('data-c2c-watermarked', '1');
    return c;
  }

  // ---------- preview watermark overlays ----------
  var wmSvg = null;
  function wmUrl() {
    if (wmSvg) return wmSvg;
    var t = CFG.watermarkText.replace(/&/g, '&amp;');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="170">' +
      '<text x="150" y="85" text-anchor="middle" dominant-baseline="middle" transform="rotate(-30 150 85)" ' +
      'font-family="Poppins, Avenir, Helvetica, Arial, sans-serif" font-size="17" font-weight="600" fill="rgba(65,65,110,0.20)">' + t + '</text></svg>';
    wmSvg = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
    return wmSvg;
  }
  var overlays = {};
  var TARGETS = [
    { key: 'chart', sel: '[data-help="chart"] > .sheet-scroll', z: 20 },
    { key: 'import', sel: '[aria-labelledby="import-title"] img', z: 45 }
  ];
  function overlayFor(t) {
    var o = overlays[t.key];
    if (!o) {
      o = document.createElement('div');
      o.className = 'c2c-wm';
      o.setAttribute('aria-hidden', 'true');
      o.setAttribute('data-c2c-watermark', t.key);
      o.style.cssText = 'position:fixed;pointer-events:none;display:none;background-repeat:repeat;z-index:' + t.z + ';';
      overlays[t.key] = o;
    }
    if (!o.isConnected && document.body) document.body.appendChild(o);
    return o;
  }
  function tick() {
    // the gate is added before React hydrates <html>; re-attach it if hydration replaced <body>
    if (state.tier === 'none' && document.body && (!gate || !gate.isConnected)) renderGate();
    if (document.body && (!pv || !pv.isConnected || pv.parentElement !== pvHost())) renderPreview();
    var f = feat();
    var free = !!(f && f.watermark);
    for (var i = 0; i < TARGETS.length; i++) {
      var t = TARGETS[i];
      var o = overlayFor(t);
      var el = free ? document.querySelector(t.sel) : null;
      var r = el ? el.getBoundingClientRect() : null;
      if (!r || r.width < 2 || r.height < 2) { if (o.style.display !== 'none') o.style.display = 'none'; continue; }
      o.style.backgroundImage = wmUrl();
      o.style.display = 'block';
      o.style.left = r.left + 'px'; o.style.top = r.top + 'px';
      o.style.width = r.width + 'px'; o.style.height = r.height + 'px';
    }
    requestAnimationFrame(tick);
  }

  // ---------- tier badge (rendered by the app header, see C2cTierBadge in tools/patch.py) ----------
  function renderBadge() {}
  function badgeInfo() {
    var f = feat();
    if (!f) return null;
    var paid = !f.watermark;
    return { tier: state.tier, label: paid ? '\u2726 ' + f.label : f.label + ' \u00b7 Free', upgrade: !paid, upgradeUrl: CFG.upgradeUrl,
      title: paid ? f.label + ': unlimited uploads, every template, clean high-resolution exports.'
                  : 'Free: 1 demo photo upload, 10 rotating templates, watermarked exports.' };
  }

  // Scroll an element into view inside its own scroll box only (never scrolls overflow:hidden parents)
  window.C2CScroll = function (el, block) {
    if (!el) return;
    var box = el.parentElement;
    while (box && box !== document.body) {
      var oy = getComputedStyle(box).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && box.scrollHeight > box.clientHeight) break;
      box = box.parentElement;
    }
    if (!box || box === document.body) return;
    var r = el.getBoundingClientRect(), br = box.getBoundingClientRect(), top = box.scrollTop;
    if (block === 'center') top += (r.top - br.top) - (box.clientHeight - r.height) / 2;
    else if (r.top < br.top) top += r.top - br.top;
    else if (r.bottom > br.bottom) top += r.bottom - br.bottom;
    else return;
    box.scrollTo({ top: Math.max(0, top), behavior: block === 'center' ? 'smooth' : 'auto' });
  };

  // ---------- zoom helpers (used by the patched bundle) ----------
  var Zoom = {
    minZoom: 0.5,
    targetCellPx: 64,      // highest zoom lets one block reach ~64 CSS px
    maxCellPx: 80,          // the app clamps a block at 80 px
    maxZoom: function (fitCell) {
      var f = Number(fitCell) > 0 ? Number(fitCell) : 8;
      return Math.max(2.5, Math.min(Zoom.maxCellPx / f, Math.max(Zoom.targetCellPx / f, 2.5)));
    },
    zoomIn: function (z, fitCell) {
      var mx = Zoom.maxZoom(fitCell);
      var n = z < 1 ? z + 0.25 : z * 1.5;
      n = Math.round(n * 4) / 4;
      return Math.min(mx, Math.max(n, z + 0.25));
    },
    zoomOut: function (z) {
      var n = z <= 1 ? z - 0.25 : z / 1.5;
      n = Math.round(n * 4) / 4;
      if (z > 1 && n < 1) n = 1;
      return Math.max(Zoom.minZoom, n);
    },
    // canvas backing-store scale; keeps big zoomed charts under mobile canvas limits (~16.7M px)
    dpr: function (cssW, cssH) {
      var d = Math.min(2, window.devicePixelRatio || 1);
      var area = Math.max(1, cssW * cssH);
      var cap = Math.sqrt(16000000 / area);
      return Math.max(0.05, Math.min(d, cap));
    }
  };

  window.C2CGate = {
    preview: true,
    previewModes: MODES,
    previewMode: previewMode,
    previewUploadsUsed: uploadsUsed,
    config: CFG,
    get tier() { return state.tier; },
    get state() { return state; },
    features: FEATURES,
    badgeInfo: badgeInfo,
    isHaute: function () { var f = feat(); return !!f && f.templates === 'all'; },
    onChange: function (fn) { listeners.push(fn); },
    ready: null,
    // templates
    setTemplates: function (list) {
      var ids = (list || []).map(function (t) { return t && t.id; }).filter(Boolean);
      if (ids.join(',') !== allTemplateIds.join(',')) allTemplateIds = ids;
    },
    allowTemplate: function (id) {
      var f = feat();
      if (f && f.templates === 'all') return true;
      if (!allTemplateIds.length) return true;
      return freeSet().has(id);
    },
    freeTemplateIds: function () { return Array.from(freeSet()); },
    templateNote: function () {
      var f = feat();
      if (f && f.templates === 'all') return '';
      return (f ? f.label : 'Free') + ': ' + freeSet().size + ' of ' + allTemplateIds.length + ' designs this week. They change every Monday. The Haute Pass unlocks all of them.';
    },
    // uploads
    requestUpload: requestUpload,
    uploadBlockedMessage: 'Your free demo photo has been used. Get the Haute Pass at chetchic.com for unlimited custom images.',
    // exports
    exportCanvas: exportCanvas
  };
  window.C2CZoom = Zoom;
  // Fit (and a new chart or size) also scrolls the chart back to its start, so no rows stay hidden above the view
  window.C2CResetChartScroll = function () {
    requestAnimationFrame(function () {
      var els = document.querySelectorAll('[data-help="chart"] .sheet-scroll, [data-help="chart"].sheet-scroll');
      for (var i = 0; i < els.length; i++) { els[i].scrollTop = 0; els[i].scrollLeft = 0; }
    });
  };
  window.C2CGate.ready = init();

  function start() {
    renderBadge(); renderPreview(); requestAnimationFrame(tick);
    // belt and braces for browsers without overflow:clip: never let the app shell itself stay scrolled
    document.addEventListener('scroll', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('app-shell') && (t.scrollTop || t.scrollLeft)) { t.scrollTop = 0; t.scrollLeft = 0; }
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
