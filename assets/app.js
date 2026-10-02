/* 上海路名里的中国 — two-layer 3D map (China above, Shanghai below) with threads from each city to the
   roads named after it. Plain JS, no build step; data comes from data/geo.json (and data/en.json for the
   English version, see scripts/). Strings live in assets/i18n.js. */
(() => {
  'use strict';

  const DEG = Math.PI / 180;
  const INK = '#0B1322';
  const LAYER_GAP = 470;          // distance between the two planes, in plane units
  const SLAB = 18;                // thickness of the Shanghai board
  const THREAD_OPACITY = 0.3;
  const VW = 1200, VH = 940;
  const DEFAULT_VIEW = { az: -24, el: 30 };
  const ROWS_COLLAPSED = 6;
  const MAX_ZOOM = 40, MAX_ZOOM_TOP = 12;
  const REPO = 'https://github.com/titanxxh/shmapcn';

  // province -> [abbreviation, region, colour]; colours stay ≥4.5:1 against the ink used for chip text
  const P = {
    黑龙江: ['黑', '东北', '#6AA6FF'], 吉林: ['吉', '东北', '#A9CCFF'], 辽宁: ['辽', '东北', '#4A86F0'],
    北京: ['京', '华北', '#FFE27A'], 天津: ['津', '华北', '#FFCC5C'], 河北: ['冀', '华北', '#F2B544'], 山西: ['晋', '华北', '#E0952E'], 内蒙古: ['蒙', '华北', '#E6D4A3'],
    陕西: ['陕', '西北', '#FF8A70'], 甘肃: ['甘', '西北', '#FFB3A1'], 宁夏: ['宁', '西北', '#FFD3C8'], 青海: ['青', '西北', '#F49C86'], 新疆: ['新', '西北', '#EE6B58'],
    山东: ['鲁', '华东', '#3ED68F'], 江苏: ['苏', '华东', '#A6EFC2'], 安徽: ['皖', '华东', '#6CC46A'], 浙江: ['浙', '华东', '#3FCBD0'], 福建: ['闽', '华东', '#A3E9E6'], 江西: ['赣', '华东', '#2FA88A'],
    河南: ['豫', '华中', '#C9B6FF'], 湖北: ['鄂', '华中', '#A487FF'], 湖南: ['湘', '华中', '#8F6CF5'],
    广东: ['粤', '华南', '#FFA3CF'], 广西: ['桂', '华南', '#F26BAE'], 海南: ['琼', '华南', '#FFD0E6'],
    重庆: ['渝', '西南', '#E6F2A6'], 四川: ['川', '西南', '#C6E75A'], 贵州: ['黔', '西南', '#9CCF3E'], 云南: ['滇', '西南', '#DDE88A'], 西藏: ['藏', '西南', '#B5C77A'],
    香港: ['港', '港澳台', '#DDE3EE'], 澳门: ['澳', '港澳台', '#B9C3D4'], 台湾: ['台', '港澳台', '#EEF1F6'],
  };
  const ORDER = Object.keys(P);
  const REGIONS = [
    ['东北', ['黑龙江', '吉林', '辽宁'], '#6AA6FF'],
    ['华北', ['北京', '天津', '河北', '山西', '内蒙古'], '#F2B544'],
    ['西北', ['陕西', '甘肃', '宁夏', '青海', '新疆'], '#FF8A70'],
    ['华东', ['山东', '江苏', '安徽', '浙江', '福建', '江西'], '#3ED68F'],
    ['华中', ['河南', '湖北', '湖南'], '#A487FF'],
    ['华南', ['广东', '广西', '海南'], '#F26BAE'],
    ['西南', ['重庆', '四川', '贵州', '云南', '西藏'], '#C6E75A'],
    ['港澳台', ['香港', '澳门', '台湾'], '#C9D1DE'],
  ];
  const ZORDER = ['黄浦', '静安', '徐汇', '长宁', '普陀', '虹口', '杨浦', '浦东', '宝山', '闵行', '嘉定', '松江', '青浦', '奉贤', '金山', '崇明'];
  const CITY_LEVEL = ['北京', '天津', '重庆', '香港', '澳门'];   // province-level, but named as cities
  const EW = ['北京东路', '天津路', '宁波路', '南京东路', '九江路', '汉口路', '福州路', '延安东路', '金陵东路'];
  const PATTERNS = {
    ne: (r) => P[r.prov][1] === '东北' && ['杨浦', '宝山', '虹口'].includes(r.zone),
    nw: (r) => ['山西', '陕西'].includes(r.prov) && ['静安', '普陀'].includes(r.zone),
    sw: (r) => ['广西', '贵州'].includes(r.prov) && ['徐汇', '长宁'].includes(r.zone),
    jd: (r) => ['新疆', '甘肃'].includes(r.prov) && r.zone === '嘉定',
    mh: (r) => r.prov === '云南' && r.zone === '闵行',
    js: (r) => r.prov === '广西' && r.zone === '金山',
    e: (r) => r.prov === '山东' && r.zone === '浦东',
    cns: (r) => r.isP && r.zone === '黄浦' && r.name !== '广东路',
    cew: (r) => EW.includes(r.name),
  };

  // sel: a province ('p'), a region ('r') or a Shanghai district ('z'); focus: one road ('road') or city ('city')
  const state = { sel: null, focus: null, az: DEFAULT_VIEW.az, el: DEFAULT_VIEW.el, q: '', open: {}, proj: 'fish', lang: 'zh' };
  let hover = null;                     // like focus, plus 'zone' / 'prov' while the mouse is over them
  let zoom = { k: 1, cx: 0, cy: 0 };    // 2D view inside the Shanghai board: zoom k around map point (cx, cy)
  let zoomT = { k: 1, cx: 0, cy: 0 };   // the same for the China map on the top plate
  let zoomTouched = false;              // the user zoomed or panned Shanghai since the last automatic fit
  let botMatrix = null, topMatrix = null;   // plane -> SVG coordinates from the last frame, for hit tests
  let D = null, EN = null, sk = null;   // data, English names, SVG skeleton
  let lastPointer = null;

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = (n) => Math.round(n * 10) / 10;
  const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
  const shortZone = (n) => n.replace(/新区$|区$/, '');
  const norm = (s) => s.trim().toLowerCase().replace(/[\s'’-]/g, '');
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isEn = () => state.lang === 'en' && !!EN;
  const L = () => (isEn() ? window.I18N.en : window.I18N.zh);
  const T = (key, ...a) => { const v = L().ui[key]; return typeof v === 'function' ? v(...a) : v; };

  // names in the current language
  const provName = (p) => (isEn() ? window.I18N.en.prov[p] || p : p);
  const provAbbr = (p) => (isEn() ? window.I18N.en.code[p] : P[p][0]);
  const regionName = (r) => (isEn() ? window.I18N.en.region[r] : r);
  const zoneName = (z) => (isEn() ? window.I18N.en.zone[z] : z);
  const zoneFull = (z) => T('zoneFull', z);
  const roadName = (r) => (isEn() ? r.en[0] : r.name);
  const placeShort = (r) => (isEn() ? r.en[1] : r.isP ? r.prov : r.label);   // 南京市 / Nanjing
  const placeFull = (r) => (isEn() ? (r.isP ? r.en[1] : r.en[1] + (r.en[2] ? ', ' + r.en[2] : '')) : r.isP ? T('provNamed', r.prov) : r.label + '（' + r.prov + '）');
  const cityName = (c) => (isEn() ? c.en.replace(/ \(.*\)$/, '') : c.name);
  const cmpText = (a, b) => a.localeCompare(b, isEn() ? 'en' : 'zh');
  const byProv = (a, b) => ORDER.indexOf(a.prov) - ORDER.indexOf(b.prov) || cmpText(roadName(a), roadName(b));
  const byZone = (a, b) => ZORDER.indexOf(a.zone) - ZORDER.indexOf(b.zone) || byProv(a, b);
  const planeXY = (r) => (state.proj === 'lin' ? [r.lu, r.lv] : [r.su, r.sv]);
  const plane = () => (state.proj === 'lin' ? D.g.lin : D.g.fish);
  const selOk = (r) => {
    const s = state.sel;
    if (!s) return true;
    if (s.t === 'p') return r.prov === s.id;
    if (s.t === 'r') return P[r.prov][1] === s.id;
    return r.zone === s.id;
  };
  const isOn = (prov) => !D.filtered || !!D.provOn[prov];
  const same = (a, b) => !!a && !!b && a.t === b.t && (a.t === 'road' ? a.i === b.i : a.t === 'city' ? a.key === b.key : a.id === b.id);
  const roadsOf = (f) => (!f ? [] : f.t === 'road' ? [D.roads[f.i]] : f.t === 'city' ? D.cities.get(f.key).roads.map((i) => D.roads[i]) : []);
  const pts = (ps) => ps.map(([x, y]) => f1(x) + ',' + f1(y)).join(' ');
  const circ = (x, y, r) => `M${f1(x - r)} ${f1(y)}a${r} ${r} 0 1 0 ${f1(2 * r)} 0a${r} ${r} 0 1 0 ${f1(-2 * r)} 0`;

  function basisText(r) {
    const b = isEn() ? `${r.base} (${r.en[1].replace(/ \(.*\)$/, '')})` : r.base;
    if (r.basis === 'core') return T('basisCore', b);
    if (r.basis === 'cluster') { const [n, reg] = r.near.split(':'); return T('basisCluster', b, Number(n), reg || ''); }
    if (r.basis === 'ambiguous') return T('basisAmbiguous', b, placeShort(r));
    return '';
  }
  const infTag = (r) => (r.basis ? `<span class="inf" title="${esc(basisText(r))}">${T('inferredShort')}</span>` : '');
  function issueURL(r) {
    const name = isEn() ? `${r.name} ${r.en[0]}` : r.name;
    return REPO + '/issues/new?' + new URLSearchParams({
      title: T('reportTitle', name, zoneFull(r.zone)),
      body: T('reportBody', name, zoneFull(r.zone), placeFull(r), basisText(r)),
    }).toString();
  }

  function hull(points) {
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }

  // ---------- which roads are lit ----------
  function computeOn() {
    const q = norm(state.q);
    D.provOn = {};
    D.nOn = 0;
    for (const r of D.roads) {
      r.on = selOk(r) && (!q || r.hay.includes(q) || (!!EN && r.hayEn.includes(q)));
      if (r.on) { D.nOn++; D.provOn[r.prov] = true; }
    }
    for (const c of D.cities.values()) c.on = c.roads.some((i) => D.roads[i].on);
    D.filtered = !!state.sel || !!q;
  }

  // ---------- labels: greedy placement, highest priority first; a label that fits nowhere is dropped ----------
  const textW = (s, size, ls) => { let w = 0; for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? size : /[A-Z]/.test(ch) ? size * 0.66 : size * 0.54; return w + ls * size * s.length; };
  function placeLabels(cands) {
    cands.sort((a, b) => b.pri - a.pri);
    const boxes = [], out = [];
    for (const c of cands) {
      const w = textW(c.text, c.size, c.ls || 0), h = c.size;
      for (const [dx, dy, anchor] of c.alts) {
        const x = c.x + dx, y = c.y + dy;
        const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
        const b = [x0 - 2, y - h * 0.9 - 1, x0 + w + 2, y + h * 0.25 + 1];
        if (boxes.some((o) => o[0] < b[2] && b[0] < o[2] && o[1] < b[3] && b[1] < o[3])) continue;
        boxes.push(b);
        out.push({ key: c.key, x, y, text: c.text, attrs: { class: 'lbl' + (c.cls ? ' ' + c.cls : ''), 'text-anchor': anchor, fill: c.fill, opacity: c.op,
          style: `font-size:${c.size}px;font-weight:${c.weight}${c.ls ? `;letter-spacing:${c.ls}em` : ''}` } });
        break;
      }
    }
    return out;
  }
  // Labels live in an HTML layer over the SVG (in view-box units, scaled with it) and are only moved with
  // CSS transforms: SVG text would need a fresh text layout every frame.
  function syncLabels(layer, items) {
    const pool = layer.pool || (layer.pool = new Map());
    const seen = new Set();
    for (const it of items) {
      const a = it.attrs, sig = it.text + '|' + a.class + '|' + a.style + '|' + a.fill + '|' + a.opacity;
      let e = pool.get(it.key);
      if (!e || e.sig !== sig) {
        if (e) e.remove();
        e = document.createElement('span');
        e.className = a.class;
        e.style.cssText = a.style + ';color:' + a.fill + (a.opacity != null ? ';opacity:' + a.opacity : '');
        e.textContent = it.text;
        e.sig = sig;
        pool.set(it.key, e);
        layer.appendChild(e);
      }
      const ax = a['text-anchor'] === 'middle' ? '-50%' : a['text-anchor'] === 'end' ? '-100%' : '0';
      const t = `translate(${f1(it.x)}px,${f1(it.y)}px) translate(${ax},-82%)`;
      if (e.tf !== t) { e.style.transform = t; e.tf = t; }
      seen.add(it.key);
    }
    for (const [key, e] of pool) if (!seen.has(key)) { e.remove(); pool.delete(key); }
  }
  function fitLabelLayer() {
    const svg = $('#scene'), layer = $('#lbls');
    if (layer && svg.clientWidth) layer.style.transform = `scale(${svg.clientWidth / VW})`;
  }
  const AROUND = [[6, -6, 'start'], [-6, -6, 'end'], [6, 13, 'start'], [-6, 13, 'end']];
  const BESIDE = [[5, 4, 'start'], [-5, 4, 'end'], [0, -6, 'middle'], [0, 15, 'middle']];

  // ---------- 3D scene: orthographic view of two horizontal planes ----------
  // The SVG keeps one skeleton; a frame only moves transforms and rewrites a few batched paths.
  function buildSkeleton() {
    const g = D.g;
    const svg = $('#scene');
    svg.innerHTML = `<defs><clipPath id="board-clip"><rect id="clip-rect" x="0" y="0" width="1" height="1"/></clipPath>
        <clipPath id="top-clip"><rect x="0" y="0" width="${g.cw}" height="${g.ch}"/></clipPath></defs>
      <polygon id="bot-slab" fill="#060B15" pointer-events="none"/>
      <polygon id="bot-face" fill="#0F192C" stroke="#2A3C5E"/>
      <g id="bot-map" clip-path="url(#board-clip)"><g id="bot-zoom"></g></g>
      <g id="rdots" pointer-events="none"></g>
      <g id="guides" pointer-events="none"></g>
      <g id="threads" pointer-events="none"></g>
      <polygon id="top-face" fill="#7F9CCB" fill-opacity="0.05" stroke="#3A4F78" stroke-opacity="0.8" pointer-events="none"/>
      <g id="top-shift" pointer-events="none"><g id="top-extr" opacity="0.6" clip-path="url(#top-clip)"><g id="top-extr-zoom">${g.cn.map((p) => `<path d="${p.d}" fill="#040812"/>`).join('')}</g></g></g>
      <g id="top-map" clip-path="url(#top-clip)"><g id="top-zoom">${g.cn.map((p) => `<path d="${p.d}" data-p="${p.n}" stroke="#9FB2D2" stroke-opacity="0.4" stroke-width="0.6" vector-effect="non-scaling-stroke"/>`).join('')}<path d="${g.nh}" fill="#9FB2D2" fill-opacity="0.45" pointer-events="none"/></g></g>
      <g id="cdots" pointer-events="none"></g>
      <g id="hl" pointer-events="none"></g>`;
    sk = {};
    for (const id of ['clip-rect', 'bot-slab', 'bot-face', 'bot-map', 'bot-zoom', 'rdots', 'guides', 'threads', 'top-face', 'top-shift', 'top-extr', 'top-extr-zoom', 'top-map', 'top-zoom', 'cdots', 'hl', 'lbls']) {
      sk[id.replace(/-(\w)/g, (m, c) => c.toUpperCase())] = document.getElementById(id);
    }
    sk.prov = {};
    for (const el of sk.topMap.querySelectorAll('[data-p]')) sk.prov[el.dataset.p] = el;
    buildDistricts();
  }
  function buildDistricts() {
    const pl = plane();
    sk.botZoom.innerHTML = pl.shd.map((d) => `<path d="${d.d}" data-z="${shortZone(d.n)}" vector-effect="non-scaling-stroke"/>`).join('') +
      `<path id="river" d="${pl.river}" fill="none" stroke="#1F5A93" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
    sk.river = document.getElementById('river');
    sk.zone = {};
    for (const el of sk.botZoom.querySelectorAll('[data-z]')) {
      const z = el.dataset.z;
      sk.zone[z] = el;
      if (D.zoneCount[z]) { el.setAttribute('data-zone', z); el.style.cursor = 'pointer'; }
    }
  }
  // fills and outlines that depend on the selection, the search and the hovered district / province
  function styleStatic() {
    const sel = state.sel;
    const picked = sel && sel.t === 'z' ? sel.id : null;
    for (const [z, el] of Object.entries(sk.zone)) {
      const n = D.zoneCount[z] || 0, hov = !!hover && hover.t === 'zone' && hover.id === z;
      el.setAttribute('fill', z === picked ? '#2C4673' : hov ? '#22365A' : n ? '#1A2A47' : '#111C30');
      el.setAttribute('stroke', z === picked || hov ? '#EEF2F8' : '#2E4268');
      el.setAttribute('stroke-width', z === picked ? 1.6 : hov ? 1.2 : 0.8);
    }
    if (picked && sk.zone[picked]) sk.botZoom.insertBefore(sk.zone[picked], sk.river);   // its outline on top
    for (const [p, el] of Object.entries(sk.prov)) {
      const has = !!(P[p] && D.count[p]);   // provinces without roads let clicks through to the map below
      const hov = !!hover && hover.t === 'prov' && hover.id === p;
      let fill = '#1C2A44', op = 0.75;
      if (p === '上海') { fill = '#EEF2F8'; op = 0.95; }
      else if (has) { fill = P[p][2]; op = D.filtered ? (isOn(p) ? 0.62 : 0.08) : 0.3; if (hov) op = Math.max(op, 0.5); }
      el.setAttribute('fill', fill);
      el.setAttribute('fill-opacity', op);
      el.setAttribute('stroke', hov ? '#FFFFFF' : '#9FB2D2');
      el.setAttribute('stroke-opacity', hov ? 1 : 0.4);
      el.setAttribute('stroke-width', hov ? 1.4 : 0.6);
      if (has) { el.setAttribute('data-prov', p); el.style.cursor = 'pointer'; } else el.setAttribute('pointer-events', 'none');
    }
  }

  function renderScene() {
    if (!D || !sk) return;
    const g = D.g;
    const az = state.az * DEG, el = state.el * DEG;
    const ca = Math.cos(az), sa = Math.sin(az), se = Math.sin(el), ce = Math.cos(el);
    const zt = LAYER_GAP / 2, zb = -LAYER_GAP / 2;
    const lin = state.proj === 'lin', pl = plane();
    const TOP = { W: g.cw, H: g.ch }, BOT = { W: pl.w, H: pl.h };
    // plane point (u, v) at height z -> view coordinates
    const raw = (Lp, u, v, z) => { const x = u - Lp.W / 2, y = v - Lp.H / 2; return [ca * x - sa * y, se * (sa * x + ca * y) - z * ce]; };
    const corners = (Lp) => [[0, 0], [Lp.W, 0], [Lp.W, Lp.H], [0, Lp.H]];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [Lp, z] of [[TOP, zt], [TOP, zt - SLAB], [BOT, zb], [BOT, zb - SLAB]]) {
      for (const [u, v] of corners(Lp)) {
        const [x, y] = raw(Lp, u, v, z);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    const sc = Math.min((VW - 140) / (x1 - x0), (VH - 130) / (y1 - y0));
    const ox = VW / 2 - sc * (x0 + x1) / 2, oy = VH / 2 + 12 - sc * (y0 + y1) / 2;
    const pr = (Lp, u, v, z) => { const [x, y] = raw(Lp, u, v, z); return [ox + sc * x, oy + sc * y]; };
    // the same projection as an SVG affine matrix, so map paths can stay in plane coordinates
    const matArr = (Lp, z) => [sc * ca, sc * se * sa, -sc * sa, sc * se * ca,
      ox + sc * (-ca * Lp.W / 2 + sa * Lp.H / 2), oy + sc * (se * (-sa * Lp.W / 2 - ca * Lp.H / 2) - z * ce)];
    const mat = (Lp, z) => 'matrix(' + matArr(Lp, z).map((n) => n.toFixed(4)).join(' ') + ')';
    const face = (Lp, z) => corners(Lp).map(([u, v]) => pr(Lp, u, v, z));
    const botFace = face(BOT, zb), topFace = face(TOP, zt);
    const sel = state.sel, k = zoom.k, W = BOT.W, H = BOT.H;
    // map plane -> board, after zooming; things outside the board are clipped or skipped
    const zu = (u) => (u - zoom.cx) * k + W / 2, zv = (v) => (v - zoom.cy) * k + H / 2;
    const inBoard = (u, v) => u >= -1 && u <= W + 1 && v >= -1 && v <= H + 1;
    // and the same for the China map on the top plate
    const kt = zoomT.k, TW = TOP.W, TH = TOP.H;
    const tu = (u) => (u - zoomT.cx) * kt + TW / 2, tv = (v) => (v - zoomT.cy) * kt + TH / 2;
    const inTop = (u, v) => u >= -1 && u <= TW + 1 && v >= -1 && v <= TH + 1;
    botMatrix = matArr(BOT, zb);
    topMatrix = matArr(TOP, zt);

    // planes
    sk.clipRect.setAttribute('width', W); sk.clipRect.setAttribute('height', H);
    sk.botSlab.setAttribute('points', pts(hull(botFace.concat(face(BOT, zb - SLAB)))));
    sk.botFace.setAttribute('points', pts(botFace));
    sk.botMap.setAttribute('transform', mat(BOT, zb));
    sk.botZoom.setAttribute('transform', `translate(${f1(W / 2)} ${f1(H / 2)}) scale(${k.toFixed(4)}) translate(${(-zoom.cx).toFixed(2)} ${(-zoom.cy).toFixed(2)})`);
    sk.river.setAttribute('stroke-width', (5 / Math.sqrt(k)).toFixed(2));
    sk.topFace.setAttribute('points', pts(topFace));
    sk.topShift.setAttribute('transform', `translate(0 ${f1(sc * 9 * ce)})`);
    sk.topExtr.setAttribute('transform', mat(TOP, zt));
    sk.topMap.setAttribute('transform', mat(TOP, zt));
    const topZoom = `translate(${f1(TW / 2)} ${f1(TH / 2)}) scale(${kt.toFixed(4)}) translate(${(-zoomT.cx).toFixed(2)} ${(-zoomT.cy).toFixed(2)})`;
    sk.topZoom.setAttribute('transform', topZoom);
    sk.topExtrZoom.setAttribute('transform', topZoom);

    // project every city and every road (kept for hit tests, the highlight and the card); vis = inside its zoomed plate
    for (const c of D.cities.values()) { const u = tu(c.cu), v = tv(c.cv); c.vis = inTop(u, v); [c.x, c.y] = pr(TOP, u, v, zt); }
    for (const r of D.roads) {
      const [u, v] = planeXY(r), bu = zu(u), bv = zv(v);
      r.vis = inBoard(bu, bv);
      if (r.vis) { const [x, y] = pr(BOT, bu, bv, zb); r.bx = x; r.by = y; }
    }

    // threads and dots, batched into one path per style; dimmed first, lit last
    const filtered = D.filtered, dotR = k >= 3 ? 0.6 : 0;
    const threadG = new Map(), dotG = new Map();
    const add = (map, key, attrs, seg) => { let e = map.get(key); if (!e) map.set(key, e = { attrs, d: [] }); e.d.push(seg); };
    for (const r of D.roads) {
      if (!r.vis) continue;
      const color = P[r.prov][2], hi = filtered && r.on, c = D.cities.get(r.city);
      const z = !filtered ? 1 : r.on ? 2 : 0;
      if (c.vis) {   // a thread needs both ends in view
        add(threadG, z + color, [z, `stroke="${color}" stroke-opacity="${filtered ? (r.on ? 0.85 : 0.03) : THREAD_OPACITY}" stroke-width="${hi ? 1.3 : 0.7}"`],
          `M${f1(c.x)} ${f1(c.y)}L${f1(r.bx)} ${f1(r.by)}`);
      }
      const rad = (hi ? 3.4 : 2.3) + dotR;
      add(dotG, z + color + r.isP, [z, `fill="${r.isP ? INK : color}" stroke="${r.isP ? color : INK}" stroke-width="${r.isP ? 1.3 : 0.6}" opacity="${r.on ? 1 : 0.2}"`],
        circ(r.bx, r.by, rad));
    }
    const cityG = new Map(), cityR = kt >= 3 ? 0.8 : 0;
    for (const c of D.cities.values()) {
      if (!c.vis) continue;
      const hi = filtered && c.on, z = !filtered ? 1 : c.on ? 2 : 0;
      add(cityG, z + c.color + c.isP, [z, `fill="${c.isP ? 'none' : c.color}" stroke="${c.isP ? c.color : INK}" stroke-width="${c.isP ? 1.5 : 0.7}" opacity="${c.on ? 1 : 0.2}"`],
        circ(c.x, c.y, (hi ? 3.6 : 2.4) + cityR));
    }
    const paths = (map, extra) => Array.from(map.values()).sort((a, b) => a.attrs[0] - b.attrs[0])
      .map((e) => `<path d="${e.d.join('')}" ${e.attrs[1]}${extra}/>`).join('');
    sk.rdots.innerHTML = paths(dotG, '');
    sk.threads.innerHTML = paths(threadG, ' fill="none" stroke-linecap="round"');
    sk.cdots.innerHTML = paths(cityG, '');
    const sh = g.cn.find((p) => p.n === '上海');
    const shu = sh && tu(sh.lx), shv = sh && tv(sh.ly);
    if (sh && inTop(shu, shv)) {
      const [sx, sy] = pr(TOP, shu, shv, zt);
      sk.guides.innerHTML = `<path d="${botFace.map(([bx, by]) => `M${f1(sx)} ${f1(sy)}L${f1(bx)} ${f1(by)}`).join('')}" stroke="#EEF2F8" stroke-opacity="0.18" stroke-dasharray="3 6" fill="none"/>`;
    } else sk.guides.innerHTML = '';

    // labels
    const cands = [];
    const en = isEn();
    const focusRoads = new Set(roadsOf(state.focus)), focusCity = state.focus && (state.focus.t === 'road' ? D.roads[state.focus.i].city : state.focus.key);
    for (const r of focusRoads) {
      if (r.vis) cands.push({ key: 'fr' + r.i, x: r.bx, y: r.by, text: roadName(r), size: 12, weight: 700, fill: '#FFFFFF', pri: 100, alts: BESIDE });
    }
    const fc = state.focus && D.cities.get(focusCity);
    if (fc && fc.vis && !fc.isP) {   // a province is already labelled on the map
      const c = fc;
      cands.push({ key: 'fc' + c.key, x: c.x, y: c.y, text: cityName(c), size: 12, weight: 700, fill: '#FFFFFF', pri: 100, alts: AROUND });
    }
    const picked = sel && sel.t === 'z' ? sel.id : null;
    for (const d of pl.shd) {
      const z = shortZone(d.n), lu = zu(d.lx), lv = zv(d.ly);
      if (!inBoard(lu, lv)) continue;
      const [x, y] = pr(BOT, lu, lv, zb);
      cands.push({ key: 'z' + z, x, y, text: zoneName(z), size: 12, weight: 700, ls: en ? 0.04 : 0.12, pri: 60, alts: [[0, 5, 'middle']],
        fill: z === picked ? '#FFFFFF' : D.zoneCount[z] ? '#8E9CB4' : '#56647C' });
    }
    for (const p of g.cn) {
      if (!D.count[p.n] && p.n !== '上海') continue;
      const pu = tu(p.lx), pv = tv(p.ly);
      if (!inTop(pu, pv)) continue;
      const [x, y] = pr(TOP, pu, pv, zt);
      const on = p.n === '上海' || isOn(p.n);
      cands.push({ key: 'p' + p.n, x, y, text: provName(p.n), size: en ? 10 : 11, weight: 700, pri: on ? 50 : 45, alts: [[0, 14, 'middle'], [0, -8, 'middle']],
        fill: p.n === '上海' ? '#FFFFFF' : '#DCE3EE', op: on ? 0.9 : 0.25 });
    }
    // city and road names: for a selection or a short search result, or once zoomed in far enough to read them
    const litCities = Array.from(D.cities.values()).filter((c) => c.vis && (!filtered || c.on));
    const cityLabels = (!!sel && (sel.t === 'p' || sel.t === 'z')) || (!!state.q.trim() && litCities.length <= 80) || (kt >= 2 && litCities.length <= 150);
    if (cityLabels && (filtered || kt >= 2)) {
      for (const c of litCities) if (!c.isP && c.key !== focusCity) cands.push({ key: 'c' + c.key, x: c.x, y: c.y, text: cityName(c), size: 11, weight: 700, fill: '#F4F6FA', cls: 'lbl-sel', pri: 30 + Math.min(c.roads.length, 9) / 10, alts: AROUND });
    }
    const labelled = D.roads.filter((r) => r.vis && (!filtered || r.on));
    const roadLabels = (!!sel && sel.t === 'p') || (k >= 2 && labelled.length <= 250) || (!!state.q.trim() && labelled.length <= 80);
    if (roadLabels) {
      for (const r of labelled) if (!focusRoads.has(r)) cands.push({ key: 'r' + r.i, x: r.bx, y: r.by, text: roadName(r), size: 10, weight: 500, fill: '#F4F6FA', cls: 'lbl-sel', pri: 20, alts: BESIDE });
    }
    // captions of the two layers, then everything into the label layer
    const labelAt = (f) => { const c = f.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])[0]; return [f1(Math.max(16, c[0])), f1(c[1] - 30), f1(c[1] - 12)]; };
    const [tx, ty, ty2] = labelAt(topFace), [bx, by, by2] = labelAt(botFace);
    const head = { class: 'cap', fill: '#F4F6FA', style: 'font-size:16px;font-weight:700;letter-spacing:.08em' }, sub = { class: 'cap', fill: '#93A1B8', style: 'font-size:12px' };
    syncLabels(sk.lbls, placeLabels(cands).concat([{ key: 't', x: tx, y: ty, text: T('capTop'), attrs: head }, { key: 'ts', x: tx, y: ty2, text: T('capTopSub'), attrs: sub },
      { key: 'b', x: bx, y: by, text: T('capBot'), attrs: head }, { key: 'bs', x: bx, y: by2, text: T('capBotSub', lin), attrs: sub }]));

    renderHighlight();
    renderCard();
    $('#az').value = state.az;
    $('#el').value = state.el;
    for (const b of $$('[data-act="proj"]')) b.setAttribute('aria-pressed', String(b.dataset.id === state.proj));
    $('#zoom-level').textContent = k < 1.05 ? T('whole') : k.toFixed(1) + '×';
    $('#zoom-level-top').textContent = kt < 1.05 ? T('wholeTop') : kt.toFixed(1) + '×';
  }

  let sceneQueued = false;
  function queueScene() {
    if (sceneQueued) return;
    sceneQueued = true;
    requestAnimationFrame(() => { sceneQueued = false; renderScene(); });
  }

  // ---------- focus & hover: one road or city drawn on top, with a card ----------
  function renderHighlight() {
    const out = [];
    const road = (r, labels) => {
      const c = D.cities.get(r.city), color = P[r.prov][2];
      if (r.vis) {
        const d = `M${f1(c.x)} ${f1(c.y)}L${f1(r.bx)} ${f1(r.by)}`;
        if (c.vis) out.push(`<path d="${d}" stroke="${INK}" stroke-opacity="0.7" stroke-width="4.5" stroke-linecap="round"/><path d="${d}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`);
        out.push(`<path d="${circ(r.bx, r.by, 5)}" fill="${r.isP ? INK : color}" stroke="#FFFFFF" stroke-width="1.6"/>`);
        if (labels) out.push(`<text class="lbl" x="${f1(r.bx + 8)}" y="${f1(r.by + 4)}" fill="#FFFFFF" style="font-size:12px;font-weight:700">${esc(roadName(r))}</text>`);
      }
    };
    const city = (c, labels) => {
      if (!c.vis) return;
      out.push(`<path d="${circ(c.x, c.y, 5.2)}" fill="${c.isP ? INK : c.color}" stroke="#FFFFFF" stroke-width="1.6"/>`);
      if (labels) out.push(`<text class="lbl" x="${f1(c.x + 8)}" y="${f1(c.y - 7)}" fill="#FFFFFF" style="font-size:12px;font-weight:700">${esc(cityName(c))}</text>`);
    };
    for (const [t, isHover] of [[state.focus, false], [hover, true]]) {
      if (!t || (t.t !== 'road' && t.t !== 'city') || (isHover && same(t, state.focus))) continue;
      const rs = roadsOf(t);
      rs.forEach((r) => road(r, isHover && rs.length <= 12));   // the focus already has labels from the main pass
      city(D.cities.get(t.t === 'road' ? D.roads[t.i].city : t.key), isHover);
    }
    sk.hl.innerHTML = out.join('');
  }

  function cardHTML(t, pinned) {
    const close = pinned ? `<button type="button" class="mc-close" data-act="unfocus" aria-label="${esc(T('close'))}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg></button>` : '';
    if (t.t === 'road') {
      const r = D.roads[t.i], color = P[r.prov][2];
      return `${close}<div class="mc-head"><span class="mc-dot${r.isP ? ' hollow' : ''}" style="--c:${color}"></span><b>${esc(roadName(r))}</b>${isEn() ? `<span class="mc-zh" lang="zh">${esc(r.name)}</span>` : ''}</div>
        <div class="mc-line">→ ${esc(placeFull(r))}</div>
        <div class="mc-sub">${esc(zoneFull(r.zone))}${r.vis ? '' : ' ' + esc(T('offView'))}</div>
        ${r.basis ? `<div class="mc-inf"><span class="inf">${T('inferred')}</span>${esc(basisText(r))}</div>` : ''}
        ${pinned ? `<a class="mc-report" href="${esc(issueURL(r))}" target="_blank" rel="noopener">${esc(T('report'))}</a>` : ''}`;
    }
    if (t.t === 'city') {
      const c = D.cities.get(t.key), rs = c.roads.map((i) => D.roads[i]);
      const list = rs.slice(0, 10).map((r) => `<li><b>${esc(roadName(r))}</b><span>${esc(zoneName(r.zone))}</span>${infTag(r)}</li>`).join('');
      return `${close}<div class="mc-head"><span class="mc-dot${c.isP ? ' hollow' : ''}" style="--c:${c.color}"></span><b>${esc(isEn() ? c.en : c.name)}</b><span class="mc-zh">${esc(c.isP ? '' : provName(c.prov))}</span></div>
        <div class="mc-sub">${esc(T('cityRoads', rs.length))}</div><ul class="mc-list">${list}</ul>${rs.length > 10 ? `<div class="mc-sub">${esc(T('more', rs.length))}</div>` : ''}`;
    }
    if (t.t === 'zone') {
      const provs = {};
      for (const r of D.roads) if (r.zone === t.id) provs[r.prov] = (provs[r.prov] || 0) + 1;
      const keys = Object.keys(provs).sort((a, b) => provs[b] - provs[a]);
      return `<div class="mc-head"><b>${esc(zoneFull(t.id))}</b></div><div class="mc-sub">${esc(T('zoneCard', D.zoneCount[t.id], keys.length))}</div>
        <div class="mc-line">${esc(keys.slice(0, 5).map((p) => provName(p) + ' ' + provs[p]).join(T('listSep')))}</div><div class="mc-hint">${esc(T('clickToSee'))}</div>`;
    }
    return `<div class="mc-head"><span class="mc-dot" style="--c:${P[t.id][2]}"></span><b>${esc(provName(t.id))}</b></div><div class="mc-sub">${esc(T('provCard', D.count[t.id]))}</div><div class="mc-hint">${esc(T('clickToSee'))}</div>`;
  }
  // the hover card wins while the mouse is over something; otherwise the pinned focus card stays
  function renderCard() {
    const card = $('#card');
    const t = hover && !same(hover, state.focus) ? hover : state.focus;
    if (!t || !D) { card.hidden = true; return; }
    const pinned = same(t, state.focus);
    card.innerHTML = cardHTML(t, pinned);
    card.classList.toggle('pinned', pinned);
    card.hidden = false;
    // anchor: the dot (road on the board if visible, else its city), or the mouse for districts and provinces
    const svg = $('#scene'), scene = svg.parentElement.getBoundingClientRect(), ctm = svg.getScreenCTM();
    let cx, cy;
    if ((t.t === 'zone' || t.t === 'prov') && lastPointer) { cx = lastPointer.x; cy = lastPointer.y; }
    else if (ctm) {
      const r = t.t === 'road' ? D.roads[t.i] : null;
      const c = D.cities.get(r ? r.city : t.key);
      const at = r && r.vis ? [r.bx, r.by] : c.vis ? [c.x, c.y] : null;
      if (at) {
        const p = svg.createSVGPoint(); p.x = at[0]; p.y = at[1];
        const q = p.matrixTransform(ctm);
        cx = q.x; cy = q.y;
      } else { cx = scene.left - 8; cy = scene.top - 8; }   // both ends zoomed out of view: park it in the corner
    } else { card.hidden = true; return; }
    const svgBox = svg.getBoundingClientRect();
    const w = card.offsetWidth, h = card.offsetHeight;
    let left = cx - scene.left + 16, top = cy - scene.top + 16;
    if (left + w > svgBox.right - scene.left - 8) left = cx - scene.left - w - 16;
    if (top + h > svgBox.bottom - scene.top - 8) top = cy - scene.top - h - 16;
    card.style.left = Math.max(8, left) + 'px';
    card.style.top = Math.max(8, top) + 'px';
  }

  // nearest dot within reach of a client point: a road on the board or a city above
  function pick(clientX, clientY, touch) {
    const svg = $('#scene'), ctm = svg.getScreenCTM();
    if (!ctm || !D) return null;
    const p = svg.createSVGPoint(); p.x = clientX; p.y = clientY;
    const q = p.matrixTransform(ctm.inverse());
    const reach = (touch ? 16 : 9) / Math.abs(ctm.a || 1);
    let best = null, bd = reach * reach;
    for (const r of D.roads) {
      if (!r.vis) continue;
      const d = (r.bx - q.x) ** 2 + (r.by - q.y) ** 2;
      if (d < bd) { bd = d; best = { t: 'road', i: r.i }; }
    }
    for (const c of D.cities.values()) {
      if (!c.vis) continue;
      const d = (c.x - q.x) ** 2 + (c.y - q.y) ** 2;
      if (d < bd) { bd = d; best = { t: 'city', key: c.key }; }
    }
    return best;
  }
  function setHover(h) {
    if (same(h, hover) || (!h && !hover)) { if (h && (h.t === 'zone' || h.t === 'prov')) renderCard(); return; }
    const restyle = (hover && (hover.t === 'zone' || hover.t === 'prov')) || (h && (h.t === 'zone' || h.t === 'prov'));
    hover = h;
    if (restyle) styleStatic();
    renderHighlight();
    renderCard();
    $('#scene').classList.toggle('pointing', !!h);
  }
  function setFocus(f, opts = {}) {
    state.focus = f;
    hover = null;
    if (f && opts.zoom) zoomToFocus();
    renderScene();
    $('#scene').classList.remove('pointing');
    if (f && opts.scroll) $('.scene').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    scheduleURL();
  }
  // bring the focused road (or all roads of the focused city) into the zoomed view
  function zoomToFocus() {
    const { w, h } = plane(), ps = roadsOf(state.focus).map(planeXY);
    if (!ps.length) return;
    const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const bw = Math.max(box[2] - box[0], w / 14), bh = Math.max(box[3] - box[1], h / 14);
    const fit = Math.min(w / (bw * 1.25), h / (bh * 1.25));
    const k = ps.length === 1 ? Math.max(zoom.k, state.proj === 'lin' ? 6 : 3) : fit;
    zoom = { k, cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2 };
    clampZoom();
    zoomTouched = true;
    // if China is zoomed in and the city is out of view, slide the top map to it
    const c = D.cities.get(state.focus.t === 'road' ? D.roads[state.focus.i].city : state.focus.key);
    const tw = D.g.cw / (2 * zoomT.k), th = D.g.ch / (2 * zoomT.k);
    if (Math.abs(c.cu - zoomT.cx) > tw * 0.9 || Math.abs(c.cv - zoomT.cy) > th * 0.9) { zoomT.cx = c.cu; zoomT.cy = c.cv; clampZoom('top'); }
  }

  // ---------- zoom: each plate ('bot' = Shanghai, 'top' = China) has its own view ----------
  const zoomOf = (L) => (L === 'top' ? zoomT : zoom);
  const sizeOf = (L) => (L === 'top' ? { w: D.g.cw, h: D.g.ch } : plane());
  function clampZoom(L = 'bot') {
    const z = zoomOf(L), { w, h } = sizeOf(L);
    z.k = Math.max(1, Math.min(L === 'top' ? MAX_ZOOM_TOP : MAX_ZOOM, z.k));
    const hw = w / (2 * z.k), hh = h / (2 * z.k);
    z.cx = Math.max(hw, Math.min(w - hw, z.cx));
    z.cy = Math.max(hh, Math.min(h - hh, z.cy));
  }
  // frame the selected district (its outline) or the roads of the selected province / region
  function fitZoom() {
    const { w, h } = plane();
    const sel = state.sel;
    let box = null;
    if (sel && sel.t === 'z') box = D.zoneBox[state.proj][sel.id];
    else if (sel) {
      const ps = D.roads.filter(selOk).map(planeXY);
      if (ps.length) box = [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))];
    }
    zoomTouched = false;
    if (!box) { zoom = { k: 1, cx: w / 2, cy: h / 2 }; return; }
    const bw = Math.max(box[2] - box[0], w / 14), bh = Math.max(box[3] - box[1], h / 14);
    zoom = { k: Math.min(w / (bw * 1.2), h / (bh * 1.2)), cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2 };
    clampZoom();
  }
  // client point -> coordinates on a plate (null when the view is edge-on)
  function toPlane(L, clientX, clientY) {
    const M = L === 'top' ? topMatrix : botMatrix;
    if (!M) return null;
    const svgEl = $('#scene'), ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    const [a, b, c, d, e, f] = M, det = a * d - b * c;
    if (Math.abs(det) < 1e-9) return null;
    const x = p.x - e, y = p.y - f;
    return { u: (d * x - c * y) / det, v: (-b * x + a * y) / det };
  }
  const onPlane = (L, bp) => { const { w, h } = sizeOf(L); return !!bp && bp.u >= 0 && bp.u <= w && bp.v >= 0 && bp.v <= h; };
  const mapPointAt = (L, bp) => { const z = zoomOf(L), { w, h } = sizeOf(L); return { mx: (bp.u - w / 2) / z.k + z.cx, my: (bp.v - h / 2) / z.k + z.cy }; };
  function keepUnder(L, m, bp) {   // move the view so map point m sits under plate point bp
    const z = zoomOf(L), { w, h } = sizeOf(L);
    z.cx = m.mx - (bp.u - w / 2) / z.k;
    z.cy = m.my - (bp.v - h / 2) / z.k;
    clampZoom(L);
    if (L === 'bot') zoomTouched = true;
  }
  function zoomAt(L, u, v, factor) {
    const z = zoomOf(L), m = mapPointAt(L, { u, v });   // map point under the cursor stays put
    z.k = Math.max(1, Math.min(L === 'top' ? MAX_ZOOM_TOP : MAX_ZOOM, z.k * factor));
    keepUnder(L, m, { u, v });
    queueScene();
    scheduleURL();
  }
  // which plate a client point is on; where the two overlap on screen, the top one only over China itself
  function layerAt(clientX, clientY) {
    const tp = toPlane('top', clientX, clientY), bp = toPlane('bot', clientX, clientY);
    const onT = onPlane('top', tp), onB = onPlane('bot', bp);
    if (onT && onB) {
      const m = mapPointAt('top', tp), pt = $('#scene').createSVGPoint();
      pt.x = m.mx; pt.y = m.my;
      return Object.values(sk.prov).some((el) => el.isPointInFill(pt)) ? 'top' : 'bot';
    }
    return onT ? 'top' : onB ? 'bot' : null;
  }

  // ---------- legend ----------
  function renderLegend() {
    const sel = state.sel;
    $('#legend').innerHTML = REGIONS.map(([rid, provs, rc]) => {
      const rOn = !!sel && sel.t === 'r' && sel.id === rid;
      const total = provs.reduce((s, p) => s + (D.count[p] || 0), 0);
      const pills = provs.filter((p) => D.count[p]).map((p) => {
        const pOn = !!sel && sel.t === 'p' && sel.id === p;
        return `<button type="button" class="pill${isOn(p) ? '' : ' dim'}" data-act="prov" data-id="${p}" aria-pressed="${pOn}" style="border-color:${pOn ? P[p][2] : '#24324D'}">
          <span class="badge" style="background:${P[p][2]}">${provAbbr(p)}</span><span>${esc(provName(p))}</span><span class="n">${D.count[p]}</span></button>`;
      }).join('');
      return `<div class="region">
        <button type="button" class="region-btn" data-act="region" data-id="${rid}" aria-pressed="${rOn}" style="border-color:${rOn ? rc : 'transparent'}">
          <span class="dots">${provs.map((p) => `<i style="background:${P[p][2]}"></i>`).join('')}</span>
          <span class="name">${esc(regionName(rid))}</span><span class="n">${esc(T('nRoads', total))}</span></button>
        <div class="pills">${pills}</div></div>`;
    }).join('');
  }

  // ---------- Shanghai districts ----------
  function renderZones() {
    const sel = state.sel;
    $('#zones').innerHTML = ZORDER.filter((z) => D.zoneCount[z]).map((z) => {
      const on = !!sel && sel.t === 'z' && sel.id === z;
      return `<button type="button" class="zone-btn" data-act="zone" data-id="${z}" aria-pressed="${on}">${esc(zoneName(z))}<span class="n">${D.zoneCount[z]}</span></button>`;
    }).join('');
  }

  // ---------- selection detail ----------
  function renderSel() {
    const sel = state.sel;
    if (!sel) { $('#sel').innerHTML = `<p class="sel-hint">${esc(T('selHint'))}</p>`; return; }
    const isP = sel.t === 'p', isZ = sel.t === 'z';
    const reg = REGIONS.find((x) => x[0] === sel.id);
    const color = isP ? P[sel.id][2] : isZ ? '#EEF2F8' : reg[2];
    const list = D.roads.filter(selOk).sort(isZ ? byProv : byZone);
    const tally = {};
    list.forEach((r) => { const k = isZ ? r.prov : r.zone; tally[k] = (tally[k] || 0) + 1; });
    const keys = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
    const nm = isZ ? provName : zoneName;
    const parts = keys.slice(0, 10).map((k) => nm(k) + ' ' + tally[k]).join(T('listSep')) + (keys.length > 10 ? ' …' : '');
    const summary = isZ ? T('sumZone', list.length, keys.length, parts) : T('sumOther', list.length, parts);
    const title = isP ? provName(sel.id) : isZ ? zoneFull(sel.id) : T('regionTitle', sel.id);
    const badge = isP ? provAbbr(sel.id) : isZ ? zoneName(sel.id) : isEn() ? window.I18N.en.regionShort[sel.id] : sel.id;
    const kicker = isP ? T('kickerP', regionName(P[sel.id][1])) : isZ ? T('kickerZ') : T('kickerR');
    const bsize = isP ? (isEn() ? 16 : 22) : isEn() ? (badge.length > 6 ? 9 : badge.length > 3 ? 11 : 15) : badge.length > 2 ? 13 : 16;
    $('#sel').innerHTML = `<div class="sel" style="border-color:${color}">
      <div class="sel-head">
        <span class="sel-badge" style="background:${color};font-size:${bsize}px">${esc(badge)}</span>
        <div class="sel-title"><small>${esc(kicker)}</small><b>${esc(title)}</b></div>
        <span class="sel-summary">${esc(summary)}</span>
        <button type="button" class="close-btn" data-act="clear" aria-label="${esc(T('clear'))}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg></button>
      </div>
      <div class="selgrid">${list.map((r) => {
        const place = isEn() ? r.en[1] : r.isP ? T('provNamed', r.prov) : r.label;
        return `<button type="button" class="sel-row" data-act="road" data-i="${r.i}" title="${esc(placeFull(r))}"><span class="dot" style="background:${P[r.prov][2]}"></span><b>${esc(roadName(r))}</b>${infTag(r)}<span class="arrow">→</span><span class="place">${esc(place)}</span><span class="zone">${esc(isZ ? provName(r.prov) : zoneName(r.zone))}</span></button>`;
      }).join('')}</div></div>`;
  }

  // ---------- pattern cards ----------
  function chip(r) {
    const color = P[r.prov][2];
    const tip = r.isP ? T('chipTipP', roadName(r), provName(r.prov)) : T('chipTip', roadName(r), placeShort(r), provName(r.prov));
    const style = r.isP ? `border-color:${color};color:${color};background:transparent` : `border-color:${color};color:${INK};background:${color}`;
    const badge = r.isP ? `background:${color};color:${INK}` : `background:rgba(11,19,34,.82);color:${color}`;
    return `<button type="button" class="chip" data-act="road" data-i="${r.i}" title="${esc(tip)}" style="${style};opacity:${r.on ? 1 : 0.16}"><i style="${badge}">${provAbbr(r.prov)}</i>${esc(roadName(r))}</button>`;
  }
  function renderPatterns() {
    for (const [key, fn] of Object.entries(PATTERNS)) {
      const list = D.roads.filter(fn).sort(byProv);
      const count = $(`[data-count="${key}"]`);
      if (count) count.textContent = list.length;
      $(`[data-chips="${key}"]`).innerHTML = list.map(chip).join('');
    }
  }

  // ---------- directory ----------
  function renderDir() {
    const q = state.q.trim();
    let shown = 0;
    const cards = [];
    for (const p of ORDER) {
      if (!D.count[p] || !isOn(p)) continue;
      const groups = new Map();
      let n = 0;
      for (const r of D.roads) {
        if (r.prov !== p || !r.on) continue;
        n++;
        if (!groups.has(r.city)) groups.set(r.city, { key: r.city, place: isEn() ? r.en[1] : r.isP ? T('provNamed', p) : r.label, roads: [], zones: [] });
        const gr = groups.get(r.city);
        gr.roads.push(r);
        if (!gr.zones.includes(r.zone)) gr.zones.push(r.zone);
      }
      const rows = Array.from(groups.values()).sort((a, b) => b.roads.length - a.roads.length || cmpText(a.place, b.place));
      if (!rows.length) continue;
      shown += rows.length;
      const expanded = !!q || !!state.sel || !!state.open[p];
      const vis = expanded ? rows : rows.slice(0, ROWS_COLLAPSED);
      const more = !q && !state.sel && rows.length > ROWS_COLLAPSED
        ? `<button type="button" class="more-btn" data-act="toggle" data-id="${p}">${esc(state.open[p] ? T('collapse') : T('expand', rows.length))}</button>` : '';
      cards.push(`<article class="dir-card"><header><span class="badge" style="background:${P[p][2]}">${provAbbr(p)}</span><b>${esc(provName(p))}</b><span>${esc(T('nRoads', n))}</span></header>
        ${vis.map((x) => {
          const dup = (r) => x.roads.filter((o) => o.name === r.name).length > 1;
          const names = x.roads.map((r) => `<button type="button" class="rd" data-act="road" data-i="${r.i}">${esc(roadName(r))}${dup(r) ? `<small>（${esc(zoneName(r.zone))}）</small>` : ''}</button>${infTag(r)}`).join(T('sep'));
          return `<div class="dir-row"><button type="button" class="dir-place" data-act="city" data-key="${esc(x.key)}">${esc(x.place)}</button><span>${names} <em>· ${esc(x.zones.map(zoneName).join(T('sep')))}</em></span></div>`;
        }).join('')}${more}</article>`);
    }
    $('#dir').innerHTML = cards.join('');
    $('#dir-summary').textContent = q ? (shown ? T('dirQ', q, shown) : T('dirNone', q)) : T('dirAll', Object.keys(D.count).length);
  }

  // ---------- stats ----------
  function renderStats() {
    if (!D) return;
    const m = D.g.meta;
    const v = {
      checked: m.checked.toLocaleString('en-US'), candidates: m.candidates.toLocaleString('en-US'),
      kept: m.kept, places: m.places, provs: Object.keys(D.count).length, exWords: m.exWords.join(T('sep')),
      revCity: m.reverse ? m.reverse['地级'].units : '—', revCounty: m.reverse ? m.reverse['县级市'].units : '—',
    };
    for (const el of $$('[data-stat]')) el.textContent = v[el.dataset.stat];
  }

  function renderAll() {
    computeOn();
    styleStatic();
    renderScene(); renderLegend(); renderZones(); renderSel(); renderPatterns(); renderDir();
  }

  // ---------- language ----------
  const ORIG = new Map(), ORIG_ATTR = new Map();
  function applyStatic() {
    const en = state.lang === 'en' && !!EN, dict = en ? window.I18N.en : null;
    document.documentElement.lang = en ? 'en' : 'zh-CN';
    document.title = (en ? window.I18N.en : window.I18N.zh).title;
    for (const el of $$('[data-i18n]')) {
      if (!ORIG.has(el)) ORIG.set(el, el.innerHTML);
      const v = dict && dict.html[el.dataset.i18n];
      el.innerHTML = v != null ? v : ORIG.get(el);
    }
    for (const el of $$('[data-i18n-attr]')) {
      if (!ORIG_ATTR.has(el)) ORIG_ATTR.set(el, {});
      const orig = ORIG_ATTR.get(el);
      for (const pair of el.dataset.i18nAttr.split(',')) {
        const [attr, key] = pair.split(':');
        if (!(attr in orig)) orig[attr] = el.getAttribute(attr);
        el.setAttribute(attr, dict && dict.attr[key] != null ? dict.attr[key] : orig[attr]);
      }
    }
    const btn = $('[data-act="lang"]');
    btn.setAttribute('lang', en ? 'zh' : 'en');
  }
  let enLoading = null;
  function loadEN() {
    if (EN) return Promise.resolve(EN);
    enLoading = enLoading || fetch('data/en.json')
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((e) => { EN = e; if (D) attachEN(); return e; });
    return enLoading;
  }
  function attachEN() {
    if (!EN || !D) return;
    if (EN.n !== D.g.roads.length) { EN = null; return; }   // stale file: stay in Chinese
    D.roads.forEach((r) => { r.en = EN.roads[r.oi]; r.hayEn = norm(r.en.join(' ')); });
    for (const c of D.cities.values()) c.en = D.roads[c.roads[0]].en[1];
  }
  function setLang(lang) {
    const go = () => {
      state.lang = lang;
      try { localStorage.setItem('lang', lang); } catch (err) { /* storage off */ }
      applyStatic();
      if (D) { renderStats(); renderAll(); }
      scheduleURL();
    };
    if (lang === 'en') loadEN().then(go).catch(() => {}); else go();
  }

  // ---------- shareable state in the URL query ----------
  let urlTimer = null;
  function scheduleURL() { clearTimeout(urlTimer); urlTimer = setTimeout(writeURL, 350); }
  function focusParam(f) {
    if (f.t === 'city') { const c = D.cities.get(f.key); return `c:${c.name}@${c.prov}`; }
    const r = D.roads[f.i], twins = D.roads.filter((o) => o.name === r.name && o.zone === r.zone);
    const n = twins.indexOf(r);
    return `r:${r.name}@${r.zone}${n > 0 ? '~' + n : ''}`;
  }
  function parseFocus(s) {
    const m = /^([rc]):(.+)@([^~]+)(?:~(\d+))?$/.exec(s || '');
    if (!m) return null;
    if (m[1] === 'c') { const c = Array.from(D.cities.values()).find((x) => x.name === m[2] && x.prov === m[3]); return c ? { t: 'city', key: c.key } : null; }
    const r = D.roads.filter((o) => o.name === m[2] && o.zone === m[3])[Number(m[4] || 0)];
    return r ? { t: 'road', i: r.i } : null;
  }
  function writeURL() {
    if (!D) return;
    const p = new URLSearchParams();
    if (state.lang === 'en') p.set('lang', 'en');
    if (state.sel) p.set('s', `${state.sel.t}:${state.sel.id}`);
    if (state.q.trim()) p.set('q', state.q.trim());
    if (state.focus) p.set('f', focusParam(state.focus));
    if (state.proj === 'lin') p.set('proj', 'lin');
    if (state.az !== DEFAULT_VIEW.az || state.el !== DEFAULT_VIEW.el) p.set('v', `${state.az},${state.el}`);
    if (zoomTouched) p.set('z', `${zoom.k.toFixed(2)},${zoom.cx.toFixed(1)},${zoom.cy.toFixed(1)}`);
    if (zoomT.k > 1.01) p.set('zt', `${zoomT.k.toFixed(2)},${zoomT.cx.toFixed(1)},${zoomT.cy.toFixed(1)}`);
    const qs = p.toString().replace(/%3A/gi, ':').replace(/%2C/gi, ',').replace(/%40/gi, '@').replace(/%7E/gi, '~');
    const url = location.pathname + (qs ? '?' + qs : '') + location.hash;
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
  }
  function readURL() {
    const p = new URLSearchParams(location.search);
    const s = /^([prz]):(.+)$/.exec(p.get('s') || '');
    if (s) {
      const [, t, id] = s;
      if ((t === 'p' && D.count[id]) || (t === 'r' && REGIONS.some((x) => x[0] === id)) || (t === 'z' && D.zoneCount[id])) state.sel = { t, id };
    }
    state.q = p.get('q') || '';
    $('#q').value = state.q;
    if (p.get('proj') === 'lin') state.proj = 'lin';
    const v = (p.get('v') || '').split(',').map(Number);
    if (v.length === 2 && v.every(Number.isFinite)) { state.az = wrapDeg(Math.round(v[0])); state.el = Math.max(15, Math.min(75, Math.round(v[1]))); }
    fitZoom();
    const z = (p.get('z') || '').split(',').map(Number);
    if (z.length === 3 && z.every(Number.isFinite)) { zoom = { k: z[0], cx: z[1], cy: z[2] }; clampZoom(); zoomTouched = true; }
    const zt = (p.get('zt') || '').split(',').map(Number);
    if (zt.length === 3 && zt.every(Number.isFinite)) { zoomT = { k: zt[0], cx: zt[1], cy: zt[2] }; clampZoom('top'); }
    state.focus = parseFocus(p.get('f'));
    return ['s', 'q', 'f', 'proj', 'v', 'z', 'zt'].some((key) => p.has(key));
  }

  // ---------- events ----------
  function select(t, id) {
    const cur = state.sel;
    state.sel = cur && cur.t === t && cur.id === id ? null : { t, id };
    state.focus = null;
    hover = null;
    fitZoom();
    renderAll();
    scheduleURL();
  }
  function setView(az, el) {
    state.az = wrapDeg(Math.round(az));
    state.el = Math.max(15, Math.min(75, Math.round(el)));
    queueScene();
    scheduleURL();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === 'lang') { setLang(state.lang === 'en' ? 'zh' : 'en'); return; }
    if (!D) return;
    if (act === 'prov') select('p', id);
    else if (act === 'region') select('r', id);
    else if (act === 'zone') select('z', id);
    else if (act === 'road') setFocus({ t: 'road', i: Number(btn.dataset.i) }, { zoom: true, scroll: true });
    else if (act === 'city') setFocus({ t: 'city', key: btn.dataset.key }, { zoom: true, scroll: true });
    else if (act === 'unfocus') setFocus(null);
    else if (act === 'proj') { state.proj = id; buildDistricts(); styleStatic(); fitZoom(); renderScene(); scheduleURL(); }
    else if (act === 'zoomin' || act === 'zoomout') {
      const L = btn.dataset.layer === 'top' ? 'top' : 'bot', { w, h } = sizeOf(L);
      zoomAt(L, w / 2, h / 2, act === 'zoomin' ? 1.6 : 1 / 1.6);
    } else if (act === 'zoomfit') {
      const L = btn.dataset.layer === 'top' ? 'top' : 'bot', { w, h } = sizeOf(L), z = { k: 1, cx: w / 2, cy: h / 2 };
      if (L === 'top') zoomT = z; else { zoom = z; zoomTouched = false; }
      queueScene(); scheduleURL();
    }
    else if (act === 'clear') { state.sel = null; state.focus = null; fitZoom(); renderAll(); scheduleURL(); }
    else if (act === 'rotl') setView(state.az - 30, state.el);
    else if (act === 'rotr') setView(state.az + 30, state.el);
    else if (act === 'reset') setView(DEFAULT_VIEW.az, DEFAULT_VIEW.el);
    else if (act === 'toggle') { state.open[id] = !state.open[id]; renderDir(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && D && state.focus) setFocus(null); });
  $('#az').addEventListener('input', (e) => setView(Number(e.target.value), state.el));
  $('#el').addEventListener('input', (e) => setView(state.az, Number(e.target.value)));
  $('#q').addEventListener('input', (e) => {
    state.q = e.target.value;
    if (!D) return;
    computeOn(); styleStatic(); queueScene(); renderLegend(); renderPatterns(); renderDir();
    scheduleURL();
  });
  window.addEventListener('resize', () => { if (D) renderCard(); });

  // pointer input on the scene: drag rotates (or pans a plate once it is zoomed in), two fingers pinch-zoom the
  // plate between them, a tap picks a dot, a province or a district; the mouse also hovers
  const svg = $('#scene');
  const pointers = new Map();
  let drag = null, pinch = null;
  const two = () => { const [a, b] = Array.from(pointers.values()); return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    if (!D) return;
    if (pointers.size === 2) {
      const { mid, d } = two(), L = layerAt(mid.x, mid.y) || 'bot', bp = toPlane(L, mid.x, mid.y);
      drag = null;
      pinch = bp ? { L, d0: d, k0: zoomOf(L).k, m: mapPointAt(L, bp) } : null;
      svg.classList.add('dragging');
      return;
    }
    if (pointers.size > 2) return;
    drag = { x: e.clientX, y: e.clientY, az: state.az, el: state.el, moved: false, pan: null };
    const L = layerAt(e.clientX, e.clientY);
    if (L && zoomOf(L).k > 1.02) drag.pan = { L, m: mapPointAt(L, toPlane(L, e.clientX, e.clientY)) };
  });
  svg.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!D) return;
    if (pinch && pointers.size === 2) {
      const { mid, d } = two(), bp = toPlane(pinch.L, mid.x, mid.y);
      if (!bp) return;
      zoomOf(pinch.L).k = pinch.k0 * d / pinch.d0;
      keepUnder(pinch.L, pinch.m, bp);
      queueScene();
      scheduleURL();
      return;
    }
    if (!drag) {
      if (e.pointerType === 'mouse' && !pointers.size) {
        lastPointer = { x: e.clientX, y: e.clientY };
        let h = pick(e.clientX, e.clientY, false);
        if (!h) {
          const t = e.target.closest && e.target.closest('[data-prov],[data-zone]');
          if (t) h = t.dataset.prov ? { t: 'prov', id: t.dataset.prov } : { t: 'zone', id: t.dataset.zone };
        }
        setHover(h);
      }
      return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      drag.moved = true;
      svg.classList.add('dragging');
      setHover(null);
    }
    if (drag.pan) {
      const bp = toPlane(drag.pan.L, e.clientX, e.clientY);
      if (!bp) return;
      keepUnder(drag.pan.L, drag.pan.m, bp);
      queueScene();
      scheduleURL();
    } else {
      setView(drag.az + dx * 0.35, drag.el - dy * 0.25);
    }
  });
  // the wheel zooms the plate under the pointer (China above, Shanghai below); elsewhere the page scrolls
  svg.addEventListener('wheel', (e) => {
    if (!D) return;
    const L = layerAt(e.clientX, e.clientY);
    if (!L) return;
    e.preventDefault();
    const bp = toPlane(L, e.clientX, e.clientY);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    zoomAt(L, bp.u, bp.v, Math.exp(-e.deltaY * unit * 0.0015));
  }, { passive: false });
  function tap(e) {
    const hit = pick(e.clientX, e.clientY, e.pointerType !== 'mouse');
    if (hit) { setFocus(same(hit, state.focus) ? null : hit); return; }
    // the pointer is captured by the SVG, so look up what is actually under it
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const t = under && under.closest && under.closest('[data-prov],[data-zone]');
    if (t) select(t.dataset.prov ? 'p' : 'z', t.dataset.prov || t.dataset.zone);
    else if (state.focus) setFocus(null);
  }
  const endPointer = (e) => {
    const wasTap = !!drag && !drag.moved && !pinch && e.type === 'pointerup' && pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pinch || pointers.size) {   // lifting one finger of a pinch does not start a rotation
      if (pointers.size < 2) pinch = null;
      drag = null;
      if (!pointers.size) svg.classList.remove('dragging');
      return;
    }
    if (wasTap && D) tap(e);
    drag = null;
    svg.classList.remove('dragging');
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && D) setHover(null); });

  // ---------- load ----------
  const params = new URLSearchParams(location.search);
  let stored = null;
  try { stored = localStorage.getItem('lang'); } catch (err) { /* storage off */ }
  state.lang = (params.get('lang') || stored) === 'en' ? 'en' : 'zh';
  applyStatic();
  Promise.all([
    fetch('data/geo.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    state.lang === 'en' ? loadEN().catch(() => null) : null,
  ])
    .then(([g]) => {
      const roads = g.roads.map((x, oi) => [x, oi]).filter(([x]) => P[x[2]]).map(([[name, base, prov, label, isP, zone, cu, cv, su, sv, lu, lv, basis, near], oi], i) =>
        ({ i, oi, name, base, prov, label, isP: !!isP && !CITY_LEVEL.includes(prov), zone, cu, cv, su, sv, lu, lv, basis: basis || '', near: near || '',
          city: cu + ',' + cv, hay: norm(name + base + base + '路' + label + prov + zone), hayEn: '', en: null }));
      const count = {}, zoneCount = {}, cities = new Map();
      roads.forEach((r) => {
        count[r.prov] = (count[r.prov] || 0) + 1;
        zoneCount[r.zone] = (zoneCount[r.zone] || 0) + 1;
        // one dot per city
        if (!cities.has(r.city)) cities.set(r.city, { key: r.city, cu: r.cu, cv: r.cv, name: r.isP ? r.prov : r.base, prov: r.prov, isP: r.isP, color: P[r.prov][2], roads: [], en: '' });
        cities.get(r.city).roads.push(r.i);
      });
      // bounding box of every district outline in both projections, for framing a selected district
      const zoneBox = { fish: {}, lin: {} };
      for (const key of ['fish', 'lin']) {
        for (const d of g[key].shd) {
          const nums = d.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
          let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
          for (let i = 0; i + 1 < nums.length; i += 2) {
            bx0 = Math.min(bx0, nums[i]); bx1 = Math.max(bx1, nums[i]); by0 = Math.min(by0, nums[i + 1]); by1 = Math.max(by1, nums[i + 1]);
          }
          zoneBox[key][shortZone(d.n)] = [bx0, by0, bx1, by1];
        }
      }
      D = { g, roads, count, zoneCount, cities, zoneBox, provOn: {}, filtered: false, nOn: roads.length };
      attachEN();
      if (state.lang === 'en' && !EN) state.lang = 'zh';
      applyStatic();
      zoom = { k: 1, cx: g.fish.w / 2, cy: g.fish.h / 2 };
      zoomT = { k: 1, cx: g.cw / 2, cy: g.ch / 2 };
      const shared = readURL();
      $('#scene-msg').hidden = true;
      svg.removeAttribute('hidden');
      buildSkeleton();
      fitLabelLayer();
      if (window.ResizeObserver) new ResizeObserver(fitLabelLayer).observe(svg);
      renderStats();
      renderAll();
      // a shared link opens on the map
      if (shared && !location.hash) $('#map').scrollIntoView();
    })
    .catch(() => { $('#scene-msg').textContent = T('loadFail'); $('#dir-summary').textContent = T('dataFail'); });
})();
