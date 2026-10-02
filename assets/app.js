/* 上海路名里的中国 — two-layer 3D map (China above, Shanghai below) with threads from each city to the
   roads named after it. Plain JS, no build step; data comes from data/geo.json (see scripts/). */
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

  const state = { sel: null, az: DEFAULT_VIEW.az, el: DEFAULT_VIEW.el, q: '', open: {}, proj: 'fish' };
  let D = null;

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = (n) => Math.round(n * 10) / 10;
  const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
  const shortZone = (n) => n.replace(/新区$|区$/, '');
  const zh = (a, b) => a.localeCompare(b, 'zh');
  const byProv = (a, b) => ORDER.indexOf(a.prov) - ORDER.indexOf(b.prov) || zh(a.name, b.name);
  const byZone = (a, b) => ZORDER.indexOf(a.zone) - ZORDER.indexOf(b.zone) || byProv(a, b);
  // the current selection is a province ('p'), a region ('r') or a Shanghai district ('z')
  const roadOn = (r) => {
    const s = state.sel;
    if (!s) return true;
    if (s.t === 'p') return r.prov === s.id;
    if (s.t === 'r') return P[r.prov][1] === s.id;
    return r.zone === s.id;
  };
  const isOn = (prov) => {
    const s = state.sel;
    if (!s) return true;
    if (s.t === 'p') return prov === s.id;
    if (s.t === 'r') return !!P[prov] && P[prov][1] === s.id;
    return !!(D.zoneProv[s.id] && D.zoneProv[s.id][prov]);
  };
  const zoneFull = (z) => (z === '浦东' ? '浦东新区' : z + '区');
  const pts = (ps) => ps.map(([x, y]) => f1(x) + ',' + f1(y)).join(' ');

  function hull(points) {
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }

  // ---------- 3D scene: orthographic view of two horizontal planes ----------
  function renderScene() {
    const svg = $('#scene');
    if (!D) return;
    const g = D.g;
    const az = state.az * DEG, el = state.el * DEG;
    const ca = Math.cos(az), sa = Math.sin(az), se = Math.sin(el), ce = Math.cos(el);
    const zt = LAYER_GAP / 2, zb = -LAYER_GAP / 2;
    const lin = state.proj === 'lin', plane = lin ? g.lin : g.fish;
    const TOP = { W: g.cw, H: g.ch }, BOT = { W: plane.w, H: plane.h };
    // plane point (u, v) at height z -> view coordinates
    const raw = (L, u, v, z) => { const x = u - L.W / 2, y = v - L.H / 2; return [ca * x - sa * y, se * (sa * x + ca * y) - z * ce]; };
    const corners = (L) => [[0, 0], [L.W, 0], [L.W, L.H], [0, L.H]];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [L, z] of [[TOP, zt], [TOP, zt - SLAB], [BOT, zb], [BOT, zb - SLAB]]) {
      for (const [u, v] of corners(L)) {
        const [x, y] = raw(L, u, v, z);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    const sc = Math.min((VW - 140) / (x1 - x0), (VH - 130) / (y1 - y0));
    const ox = VW / 2 - sc * (x0 + x1) / 2, oy = VH / 2 + 12 - sc * (y0 + y1) / 2;
    const pr = (L, u, v, z) => { const [x, y] = raw(L, u, v, z); return [ox + sc * x, oy + sc * y]; };
    // the same projection as an SVG affine matrix, so map paths can stay in plane coordinates
    const mat = (L, z) => 'matrix(' + [sc * ca, sc * se * sa, -sc * sa, sc * se * ca,
      ox + sc * (-ca * L.W / 2 + sa * L.H / 2), oy + sc * (se * (-sa * L.W / 2 - ca * L.H / 2) - z * ce)].map((n) => n.toFixed(4)).join(' ') + ')';
    const face = (L, z) => corners(L).map(([u, v]) => pr(L, u, v, z));
    const botFace = face(BOT, zb), topFace = face(TOP, zt);
    const labelAt = (f) => { const c = f.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])[0]; return [f1(Math.max(16, c[0])), f1(c[1] - 30), f1(c[1] - 12)]; };
    const sel = state.sel;
    const out = [];

    // bottom board: Shanghai
    out.push(`<polygon points="${pts(hull(botFace.concat(face(BOT, zb - SLAB))))}" fill="#060B15"/>`);
    out.push(`<polygon points="${pts(botFace)}" fill="#0F192C" stroke="#2A3C5E"/>`);
    out.push(`<g transform="${mat(BOT, zb)}">`);
    const pickedZone = sel && sel.t === 'z' ? sel.id : null;
    const districts = plane.shd.slice().sort((a, b) => (shortZone(a.n) === pickedZone) - (shortZone(b.n) === pickedZone));
    for (const d of districts) {
      const z = shortZone(d.n), n = D.zoneCount[z] || 0, picked = z === pickedZone;
      out.push(`<path d="${d.d}" fill="${picked ? '#2C4673' : n ? '#1A2A47' : '#111C30'}" stroke="${picked ? '#EEF2F8' : '#2E4268'}" stroke-width="${picked ? 1.6 : 0.8}" vector-effect="non-scaling-stroke"${n ? ` data-zone="${z}" style="cursor:pointer"` : ''}><title>${esc(d.n + (n ? `：${n} 条，点击查看` : ''))}</title></path>`);
    }
    out.push(`<path d="${plane.river}" fill="none" stroke="#1F5A93" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/></g>`);
    for (const d of plane.shd) {
      const z = shortZone(d.n), [x, y] = pr(BOT, d.lx, d.ly, zb);
      const fill = z === pickedZone ? '#FFFFFF' : D.zoneCount[z] ? '#8E9CB4' : '#56647C';
      out.push(`<text class="lbl" x="${f1(x)}" y="${f1(y + 5)}" text-anchor="middle" fill="${fill}" style="font-size:12px;font-weight:700;letter-spacing:.12em">${esc(z)}</text>`);
    }

    // threads + dots
    const threads = [], rdots = [], cities = new Map(), botL = [];
    const cityLabels = !!sel && (sel.t === 'p' || sel.t === 'z');
    const roadLabels = !!sel && sel.t === 'p';
    for (const r of D.roads) {
      const color = P[r.prov][2], on = roadOn(r), hi = !!sel && on;
      const [ax, ay] = pr(TOP, r.cu, r.cv, zt);
      const [bx, by] = pr(BOT, lin ? r.lu : r.su, lin ? r.lv : r.sv, zb);
      threads.push([hi, `<line x1="${f1(ax)}" y1="${f1(ay)}" x2="${f1(bx)}" y2="${f1(by)}" stroke="${color}" stroke-opacity="${sel ? (on ? 0.85 : 0.03) : THREAD_OPACITY}" stroke-width="${hi ? 1.3 : 0.7}" stroke-linecap="round" pointer-events="none"/>`]);
      rdots.push([hi, `<circle cx="${f1(bx)}" cy="${f1(by)}" r="${hi ? 3.4 : 2.3}" fill="${r.isP ? INK : color}" stroke="${r.isP ? color : INK}" stroke-width="${r.isP ? 1.3 : 0.6}" opacity="${on ? 1 : 0.2}" data-zone="${r.zone}" style="cursor:pointer"><title>${esc(r.name + ' → ' + (r.isP ? r.prov : r.label) + '（' + zoneFull(r.zone) + '）')}</title></circle>`]);
      // one dot per city; it is lit if any of its roads is
      const key = r.cu + ',' + r.cv;
      const c = cities.get(key) || { x: ax, y: ay, color, isP: r.isP, name: r.base, prov: r.prov, on: false, hi: false };
      c.on = c.on || on; c.hi = c.hi || hi;
      cities.set(key, c);
      if (roadLabels && on) botL.push(`<text class="lbl lbl-sel" x="${f1(bx + 5)}" y="${f1(by + 4)}" fill="#F4F6FA" style="font-size:10px;font-weight:500">${esc(r.name)}</text>`);
    }
    const ordered = (list) => list.filter((x) => !x[0]).concat(list.filter((x) => x[0])).map((x) => x[1]).join('');
    const cdots = [], topL = [];
    for (const c of cities.values()) {
      cdots.push([c.hi, `<circle cx="${f1(c.x)}" cy="${f1(c.y)}" r="${c.hi ? 3.6 : 2.4}" fill="${c.isP ? 'none' : c.color}" stroke="${c.isP ? c.color : INK}" stroke-width="${c.isP ? 1.5 : 0.7}" opacity="${c.on ? 1 : 0.2}" data-prov="${c.prov}" style="cursor:pointer"><title>${esc(c.isP ? c.prov : c.name + '（' + c.prov + '）')}</title></circle>`]);
      if (cityLabels && c.hi && !c.isP) topL.push(`<text class="lbl lbl-sel" x="${f1(c.x + 6)}" y="${f1(c.y - 6)}" fill="#F4F6FA" style="font-size:11px;font-weight:700">${esc(c.name)}</text>`);
    }
    out.push(ordered(rdots));
    const sh = g.cn.find((p) => p.n === '上海');
    if (sh) {
      const [sx, sy] = pr(TOP, sh.lx, sh.ly, zt);
      for (const [bx, by] of botFace) out.push(`<line x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(bx)}" y2="${f1(by)}" stroke="#EEF2F8" stroke-opacity="0.18" stroke-dasharray="3 6" pointer-events="none"/>`);
    }
    out.push(ordered(threads));

    // top layer: China, a glassy plate with an extruded map
    // only the provinces themselves take clicks, so the lower map stays clickable where the layers overlap
    out.push(`<polygon points="${pts(topFace)}" fill="#7F9CCB" fill-opacity="0.05" stroke="#3A4F78" stroke-opacity="0.8" pointer-events="none"/>`);
    out.push(`<g transform="translate(0 ${f1(sc * 9 * ce)})" pointer-events="none"><g transform="${mat(TOP, zt)}" opacity="0.6">`);
    for (const p of g.cn) out.push(`<path d="${p.d}" fill="#040812"/>`);
    out.push(`</g></g><g transform="${mat(TOP, zt)}">`);
    for (const p of g.cn) {
      const has = !!(P[p.n] && D.count[p.n]);  // provinces without roads let clicks through to the map below
      let fill = '#1C2A44', op = 0.75;
      if (p.n === '上海') { fill = '#EEF2F8'; op = 0.95; }
      else if (has) { fill = P[p.n][2]; op = sel ? (isOn(p.n) ? 0.62 : 0.08) : 0.3; }
      out.push(`<path d="${p.d}" fill="${fill}" fill-opacity="${op}" stroke="#9FB2D2" stroke-opacity="0.4" stroke-width="0.6" vector-effect="non-scaling-stroke"${has ? ` data-prov="${p.n}" style="cursor:pointer"` : ' pointer-events="none"'}><title>${esc(p.n + (has ? `：${D.count[p.n]} 条` : ''))}</title></path>`);
    }
    out.push(`<path d="${g.nh}" fill="#9FB2D2" fill-opacity="0.45" pointer-events="none"/></g>`);
    for (const p of g.cn) {
      if (!D.count[p.n] && p.n !== '上海') continue;
      const [x, y] = pr(TOP, p.lx, p.ly, zt);
      const on = p.n === '上海' || isOn(p.n);
      out.push(`<text class="lbl" x="${f1(x)}" y="${f1(y + 14)}" text-anchor="middle" fill="${p.n === '上海' ? '#FFFFFF' : '#DCE3EE'}" opacity="${on ? 0.9 : 0.25}" style="font-size:11px;font-weight:700">${esc(p.n)}</text>`);
    }
    out.push(ordered(cdots));
    out.push(topL.join(''), botL.join(''));

    const [tx, ty, ty2] = labelAt(topFace), [bx, by, by2] = labelAt(botFace);
    out.push(`<text x="${tx}" y="${ty}" fill="#F4F6FA" style="font-size:16px;font-weight:700;letter-spacing:.08em;pointer-events:none">上层 · 中国</text>`,
      `<text x="${tx}" y="${ty2}" fill="#93A1B8" style="font-size:12px;pointer-events:none">点 = 被借用名字的城市、县</text>`,
      `<text x="${bx}" y="${by}" fill="#F4F6FA" style="font-size:16px;font-weight:700;letter-spacing:.08em;pointer-events:none">下层 · 上海</text>`,
      `<text x="${bx}" y="${by2}" fill="#93A1B8" style="font-size:12px;pointer-events:none">点 = 道路实际位置，${lin ? '真实比例' : '中心城区放大'} · 可点击各区</text>`);
    svg.innerHTML = out.join('');
    $('#az').value = state.az;
    $('#el').value = state.el;
    for (const b of $$('[data-act="proj"]')) b.setAttribute('aria-pressed', String(b.dataset.id === state.proj));
  }

  let sceneQueued = false;
  function queueScene() {
    if (sceneQueued) return;
    sceneQueued = true;
    requestAnimationFrame(() => { sceneQueued = false; renderScene(); });
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
          <span class="badge" style="background:${P[p][2]}">${P[p][0]}</span><span>${p}</span><span class="n">${D.count[p]}</span></button>`;
      }).join('');
      return `<div class="region">
        <button type="button" class="region-btn" data-act="region" data-id="${rid}" aria-pressed="${rOn}" style="border-color:${rOn ? rc : 'transparent'}">
          <span class="dots">${provs.map((p) => `<i style="background:${P[p][2]}"></i>`).join('')}</span>
          <span class="name">${rid}</span><span class="n">${total} 条</span></button>
        <div class="pills">${pills}</div></div>`;
    }).join('');
  }

  // ---------- Shanghai districts ----------
  function renderZones() {
    const sel = state.sel;
    $('#zones').innerHTML = ZORDER.filter((z) => D.zoneCount[z]).map((z) => {
      const on = !!sel && sel.t === 'z' && sel.id === z;
      return `<button type="button" class="zone-btn" data-act="zone" data-id="${z}" aria-pressed="${on}">${z}<span class="n">${D.zoneCount[z]}</span></button>`;
    }).join('');
  }

  // ---------- selection detail ----------
  function renderSel() {
    const sel = state.sel;
    if (!sel) {
      $('#sel').innerHTML = '<p class="sel-hint">点选省份、地区或上海的区（也可以直接点地图），对应的连线会被点亮，并在此列出全部道路。</p>';
      return;
    }
    const isP = sel.t === 'p', isZ = sel.t === 'z';
    const reg = REGIONS.find((x) => x[0] === sel.id);
    const color = isP ? P[sel.id][2] : isZ ? '#EEF2F8' : reg[2];
    const list = D.roads.filter(roadOn).sort(isZ ? byProv : byZone);
    const tally = {};
    list.forEach((r) => { const k = isZ ? r.prov : r.zone; tally[k] = (tally[k] || 0) + 1; });
    const keys = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
    const parts = keys.slice(0, 10).map((k) => k + ' ' + tally[k]).join(' · ') + (keys.length > 10 ? ' …' : '');
    const summary = isZ ? `共 ${list.length} 条，来自 ${keys.length} 个省级行政区：${parts}` : `共 ${list.length} 条，分布于 ${parts}`;
    const title = isP ? sel.id : isZ ? zoneFull(sel.id) : (sel.id === '港澳台' ? '港澳台' : sel.id + '地区');
    const badge = isP ? P[sel.id][0] : sel.id;
    const kicker = isP ? P[sel.id][1] + ' · 省级行政区' : isZ ? '上海 · 区' : '地区';
    $('#sel').innerHTML = `<div class="sel" style="border-color:${color}">
      <div class="sel-head">
        <span class="sel-badge" style="background:${color};font-size:${isP ? 22 : (badge.length > 2 ? 13 : 16)}px">${badge}</span>
        <div class="sel-title"><small>${kicker}</small><b>${title}</b></div>
        <span class="sel-summary">${summary}</span>
        <button type="button" class="close-btn" data-act="clear" aria-label="清除筛选">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg></button>
      </div>
      <div class="selgrid">${list.map((r) => {
        const place = r.isP ? r.prov + '（省名）' : r.label;
        return `<div class="sel-row" title="${esc(place)}"><span class="dot" style="background:${P[r.prov][2]}"></span><b>${esc(r.name)}</b><span class="arrow">→</span><span class="place">${esc(place)}</span><span class="zone">${isZ ? r.prov : r.zone}</span></div>`;
      }).join('')}</div></div>`;
  }

  // ---------- pattern cards ----------
  function chip(r) {
    const [abbr, , color] = P[r.prov];
    const tip = r.isP ? `${r.name}：以${r.prov}命名` : `${r.name} → ${r.label}（${r.prov}）`;
    const style = r.isP ? `border-color:${color};color:${color};background:transparent` : `border-color:${color};color:${INK};background:${color}`;
    const badge = r.isP ? `background:${color};color:${INK}` : `background:rgba(11,19,34,.82);color:${color}`;
    return `<span class="chip" title="${esc(tip)}" style="${style};opacity:${roadOn(r) ? 1 : 0.16}"><i style="${badge}">${abbr}</i>${esc(r.name)}</span>`;
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
        if (r.prov !== p || !roadOn(r)) continue;
        n++;
        const k = r.isP ? '__P' : r.base;
        if (!groups.has(k)) groups.set(k, { place: r.isP ? p + '（省名）' : r.label, names: [], zones: [], hay: p + r.label + r.base });
        const gr = groups.get(k);
        gr.names.push(r.name);
        gr.hay += r.name;
        if (!gr.zones.includes(r.zone)) gr.zones.push(r.zone);
      }
      const rows = Array.from(groups.values())
        .sort((a, b) => b.names.length - a.names.length || zh(a.place, b.place))
        .filter((x) => !q || x.hay.includes(q));
      if (!rows.length) continue;
      shown += rows.length;
      const expanded = !!q || !!state.sel || !!state.open[p];
      const vis = expanded ? rows : rows.slice(0, ROWS_COLLAPSED);
      const more = !q && !state.sel && rows.length > ROWS_COLLAPSED
        ? `<button type="button" class="more-btn" data-act="toggle" data-id="${p}">${state.open[p] ? '收起' : `展开全部 ${rows.length} 个地名`}</button>` : '';
      cards.push(`<article class="dir-card"><header><span class="badge" style="background:${P[p][2]}">${P[p][0]}</span><b>${p}</b><span>${n} 条</span></header>
        ${vis.map((x) => `<div class="dir-row"><b>${esc(x.place)}</b><span>${esc(x.names.join('、'))} <em>· ${esc(x.zones.join('、'))}</em></span></div>`).join('')}${more}</article>`);
    }
    $('#dir').innerHTML = cards.join('');
    $('#dir-summary').textContent = q
      ? `“${q}”：找到 ${shown} 个地名`
      : `共 ${Object.keys(D.count).length} 个省级行政区；按每个地名对应的道路数排序，可展开查看全部。`;
  }

  // ---------- stats ----------
  function renderStats() {
    const m = D.g.meta;
    const v = {
      checked: m.checked.toLocaleString('en-US'), candidates: m.candidates.toLocaleString('en-US'),
      kept: m.kept, places: m.places, provs: Object.keys(D.count).length, exWords: m.exWords.join('、'),
      revCity: m.reverse ? m.reverse['地级'].units : '—', revCounty: m.reverse ? m.reverse['县级市'].units : '—',
    };
    for (const el of $$('[data-stat]')) el.textContent = v[el.dataset.stat];
  }

  function renderAll() {
    renderScene(); renderLegend(); renderZones(); renderSel(); renderPatterns(); renderDir();
  }

  // ---------- events ----------
  function select(t, id) {
    const cur = state.sel;
    state.sel = cur && cur.t === t && cur.id === id ? null : { t, id };
    renderAll();
  }
  function setView(az, el) {
    state.az = wrapDeg(Math.round(az));
    state.el = Math.max(15, Math.min(75, Math.round(el)));
    queueScene();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !D) return;
    const { act, id } = btn.dataset;
    if (act === 'prov') select('p', id);
    else if (act === 'region') select('r', id);
    else if (act === 'zone') select('z', id);
    else if (act === 'proj') { state.proj = id; renderScene(); }
    else if (act === 'clear') { state.sel = null; renderAll(); }
    else if (act === 'rotl') setView(state.az - 30, state.el);
    else if (act === 'rotr') setView(state.az + 30, state.el);
    else if (act === 'reset') setView(DEFAULT_VIEW.az, DEFAULT_VIEW.el);
    else if (act === 'toggle') { state.open[id] = !state.open[id]; renderDir(); }
  });
  $('#az').addEventListener('input', (e) => setView(Number(e.target.value), state.el));
  $('#el').addEventListener('input', (e) => setView(state.az, Number(e.target.value)));
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; if (D) renderDir(); });

  // drag to rotate; a short tap on a province or a district selects it
  const svg = $('#scene');
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, az: state.az, el: state.el, moved: false }; });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      drag.moved = true;
      svg.classList.add('dragging');
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    }
    setView(drag.az + dx * 0.35, drag.el - dy * 0.25);
  });
  const endDrag = (e) => {
    if (drag && !drag.moved && e.type === 'pointerup') {
      const t = e.target.closest && e.target.closest('[data-prov],[data-zone]');
      if (t) select(t.dataset.prov ? 'p' : 'z', t.dataset.prov || t.dataset.zone);
    }
    drag = null;
    svg.classList.remove('dragging');
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // ---------- load ----------
  fetch('data/geo.json')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((g) => {
      const roads = g.roads.filter((x) => P[x[2]]).map(([name, base, prov, label, isP, zone, cu, cv, su, sv, lu, lv]) =>
        ({ name, base, prov, label, isP: !!isP && !CITY_LEVEL.includes(prov), zone, cu, cv, su, sv, lu, lv }));
      const count = {}, zoneCount = {}, zoneProv = {};
      roads.forEach((r) => {
        count[r.prov] = (count[r.prov] || 0) + 1;
        zoneCount[r.zone] = (zoneCount[r.zone] || 0) + 1;
        (zoneProv[r.zone] = zoneProv[r.zone] || {})[r.prov] = true;
      });
      D = { g, roads, count, zoneCount, zoneProv };
      $('#scene-msg').hidden = true;
      svg.removeAttribute('hidden');
      renderStats();
      renderAll();
    })
    .catch(() => { $('#scene-msg').textContent = '地图数据未能加载，请刷新页面重试。'; $('#dir-summary').textContent = '数据未能加载。'; });

})();
