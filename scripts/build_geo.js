// Geometry for the two-layer map: China (top) + whole Shanghai with a centre fisheye (bottom),
// plus every kept road with its city point and real road position.
// Input: sources/ (map packages), work/kept.json, work/meta.json, work/reverse.json. Output: data/geo.json
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'sources');
const WORK = path.join(ROOT, 'work');
const r1 = (v) => Math.round(v * 10) / 10;

function dp(points, tol) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let maxD = -1, idx = -1;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let t = ((px - ax) * dx + (py - ay) * dy) / len2; t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py, d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol * tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}
const area = (ring) => { let s = 0; for (let i = 0, n = ring.length; i < n; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n]; s += x1 * y2 - x2 * y1; } return s / 2; };
const ringsToPath = (rings) => rings.map((r) => 'M' + r.map(([x, y]) => r1(x) + ' ' + r1(y)).join('L') + 'Z').join('');
function outerRings(g) { if (g.type === 'Polygon') return [g.coordinates[0]]; if (g.type === 'MultiPolygon') return g.coordinates.map((p) => p[0]).filter(Boolean); return []; }

// ---------- China (Albers), 800 x 600 ----------
const CW = 800, CH = 600;
const D = Math.PI / 180;
const phi1 = 25 * D, phi2 = 47 * D, lam0 = 105 * D;
const n = (Math.sin(phi1) + Math.sin(phi2)) / 2, Cc = Math.cos(phi1) ** 2 + 2 * n * Math.sin(phi1);
const rho0 = Math.sqrt(Cc) / n;
const albers = ([lon, lat]) => { const rho = Math.sqrt(Cc - 2 * n * Math.sin(lat * D)) / n, th = n * (lon * D - lam0); return [rho * Math.sin(th), -(rho0 - rho * Math.cos(th))]; };
function decodeRing(s, off, scale = 1024) {
  const res = []; let px = off[0], py = off[1];
  for (let i = 0; i < s.length; i += 2) {
    let x = s.charCodeAt(i) - 64, y = s.charCodeAt(i + 1) - 64;
    x = (x >> 1) ^ (-(x & 1)); y = (y >> 1) ^ (-(y & 1));
    x += px; y += py; px = x; py = y; res.push([x / scale, y / scale]);
  }
  return res;
}
const cn = JSON.parse(fs.readFileSync(path.join(SRC, 'echarts/package/map/json/china.json'), 'utf8'));
const provs = cn.features.map((f) => {
  const g = f.geometry; let polys;
  if (g.type === 'Polygon') polys = [g.coordinates.map((r, i) => decodeRing(r, g.encodeOffsets[i]))];
  else polys = g.coordinates.map((p, pi) => p.map((r, ri) => decodeRing(r, g.encodeOffsets[pi][ri])));
  return { name: f.properties.name, cp: f.properties.cp, polys };
});
const nh = [[[0, 3.5], [7, 11.2], [15, 11.9], [30, 7], [42, 0.7], [52, 0.7], [56, 7.7], [59, 0.7], [64, 0.7], [64, 0], [5, 0], [0, 3.5]], [[13, 16.1], [19, 14.7], [16, 21.7], [11, 23.1], [13, 16.1]], [[12, 32.2], [14, 38.5], [15, 38.5], [13, 32.2], [12, 32.2]], [[16, 47.6], [12, 53.2], [13, 53.2], [18, 47.6], [16, 47.6]], [[6, 64.4], [8, 70], [9, 70], [8, 64.4], [6, 64.4]], [[23, 82.6], [29, 79.8], [30, 79.8], [25, 82.6], [23, 82.6]], [[37, 70.7], [43, 62.3], [44, 62.3], [39, 70.7], [37, 70.7]], [[48, 51.1], [51, 45.5], [53, 45.5], [50, 51.1], [48, 51.1]], [[51, 35], [51, 28.7], [53, 28.7], [53, 35], [51, 35]], [[52, 22.4], [55, 17.5], [56, 17.5], [53, 22.4], [52, 22.4]], [[58, 12.6], [62, 7], [63, 7], [60, 12.6], [58, 12.6]], [[0, 3.5], [0, 93.1], [64, 93.1], [64, 0], [63, 0], [63, 92.4], [1, 92.4], [1, 3.5], [0, 3.5]]]
  .map((ring) => ring.map(([x, y]) => [x / 10.5 + 126, y / (-10.5 / 0.75) + 25]));
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const ll of provs.flatMap((p) => p.polys.flat(2)).concat(nh.flat())) { const [x, y] = albers(ll); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
const M = 26; const s = Math.min((CW - 2 * M) / (maxX - minX), (CH - 2 * M) / (maxY - minY));
const ox = (CW - s * (maxX - minX)) / 2, oy = (CH - s * (maxY - minY)) / 2;
const cnProj = (ll) => { const [x, y] = albers(ll); return [ox + (x - minX) * s, oy + (y - minY) * s]; };
const cnOut = provs.map((p) => {
  const rings = [];
  for (const poly of p.polys) for (const ring of poly) {
    const pr = ring.map(cnProj); if (Math.abs(area(pr)) < 0.6 && !['香港', '澳门'].includes(p.name)) continue;
    const sr = dp(pr, 0.85); if (sr.length >= 3) rings.push(sr);
  }
  const [lx, ly] = cnProj(p.cp);
  return { n: p.name, d: ringsToPath(rings), lx: r1(lx), ly: r1(ly) };
});
const provCP = Object.fromEntries(provs.map((p) => [p.name, p.cp]));

// ---------- Shanghai: centre-magnifying fisheye, and true proportions ----------
const KX = Math.cos(31.2 * D) * 111.32, KY = 110.57;
const C0 = [121.4760, 31.2320];          // 人民广场 (GCJ-02)
const shDir = path.join(SRC, 'counties/package/src/直辖市/上海');
const shRaw = fs.readdirSync(shDir).sort().map((f) => { const ft = JSON.parse(fs.readFileSync(path.join(shDir, f), 'utf8')).features[0]; return { n: ft.properties.name, cp: ft.properties.cp, rings: outerRings(ft.geometry) }; });
let RMAX = 0;
for (const d of shRaw) for (const r of d.rings) for (const [lon, lat] of r) RMAX = Math.max(RMAX, Math.hypot((lon - C0[0]) * KX, (lat - C0[1]) * KY));
RMAX *= 1.01;
const FD = 6;
const fish = ([lon, lat]) => {
  const dx = (lon - C0[0]) * KX, dy = (C0[1] - lat) * KY, r = Math.hypot(dx, dy);
  if (r < 1e-9) return [0, 0];
  const x = r / RMAX, g = (FD + 1) * x / (FD * x + 1);
  return [dx / r * g, dy / r * g];
};
const densify = (ring, stepKm = 0.4) => {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]; out.push(a);
    const dkm = Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY), k = Math.floor(dkm / stepKm);
    for (let j = 1; j <= k; j++) out.push([a[0] + (b[0] - a[0]) * j / (k + 1), a[1] + (b[1] - a[1]) * j / (k + 1)]);
  }
  return out;
};
const linear = ([lon, lat]) => [(lon - C0[0]) * KX, (C0[1] - lat) * KY];   // true proportions, km

// Huangpu River ≈ the edge 浦东 shares with the Puxi riverside districts (computed once, in lon/lat)
const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-18; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot((a[0] + t * dx - p[0]) * KX, (a[1] + t * dy - p[1]) * KY); };
const pd = shRaw.find((d) => d.n === '浦东新区');
const riverSide = shRaw.filter((d) => ['黄浦区', '徐汇区', '杨浦区', '虹口区', '宝山区'].includes(d.n));
const riverLines = []; let curL = [];
for (const ring of pd.rings) {
  const dr = densify(ring, 0.2);
  for (let i = 0; i < dr.length; i++) {
    const a = dr[i];
    const near = riverSide.some((o) => o.rings.some((r) => { for (let j = 0; j < r.length; j++) if (segD(a, r[j], r[(j + 1) % r.length]) < 0.12) return true; return false; }));
    if (near) curL.push(a); else if (curL.length) { riverLines.push(curL); curL = []; }
  }
  if (curL.length) { riverLines.push(curL); curL = []; }
}

// Lay Shanghai out on a plane SW wide under a given projection (lon/lat -> km-ish units).
const SW = 760, SM = 22;
function shanghaiPlane(proj) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const projected = shRaw.map((d) => ({ ...d, prings: d.rings.map((r) => densify(r).map(proj)) }));
  for (const d of projected) for (const r of d.prings) for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = (SW - 2 * SM) / (x1 - x0);
  const toPlane = ([x, y]) => [SM + (x - x0) * k, SM + (y - y0) * k];
  const pt = (ll) => toPlane(proj(ll));
  const shd = projected.map((d) => {
    const rings = d.prings.map((r) => dp(r.map(toPlane), 0.55)).filter((r) => r.length >= 3 && Math.abs(area(r)) > 1.5);
    let cp = d.cp;
    if (!cp) { const big = d.rings.reduce((a, b) => Math.abs(area(a)) > Math.abs(area(b)) ? a : b); let A = 0, cx = 0, cy = 0; for (let i = 0; i < big.length; i++) { const [xa, ya] = big[i], [xb, yb] = big[(i + 1) % big.length], f = xa * yb - xb * ya; A += f; cx += (xa + xb) * f; cy += (ya + yb) * f; } cp = [cx / (3 * A), cy / (3 * A)]; }
    const [lx, ly] = pt(cp);
    return { n: d.n, d: ringsToPath(rings), lx: r1(lx), ly: r1(ly) };
  });
  const river = riverLines.filter((l) => l.length > 3).map((l) => 'M' + dp(l.map(pt), 0.5).map(([x, y]) => r1(x) + ' ' + r1(y)).join('L')).join('');
  return { w: SW, h: Math.round((y1 - y0) * k + 2 * SM), shd, river, pt };
}
const FISH = shanghaiPlane(fish), LIN = shanghaiPlane(linear);

// ---------- roads ----------
const K = JSON.parse(fs.readFileSync(path.join(WORK, 'kept.json'), 'utf8'));
const OLD = { 西康: [101.96, 30.05], 热河: [117.94, 40.95], 察哈尔: [114.88, 40.82], 绥远: [111.75, 40.84] };
const DS = { 黄浦区: '黄浦', 静安区: '静安', 徐汇区: '徐汇', 长宁区: '长宁', 普陀区: '普陀', 虹口区: '虹口', 杨浦区: '杨浦', 浦东新区: '浦东', 宝山区: '宝山', 闵行区: '闵行', 嘉定区: '嘉定', 松江区: '松江', 青浦区: '青浦', 奉贤区: '奉贤', 金山区: '金山', 崇明区: '崇明' };
// '10 条同省' -> '10', '3 条华东地区' -> '3:华东' (neighbours a 'cluster' entry relies on)
const nearCode = (s) => { const m = /^(\d+) 条(?:同省|(.+)地区)$/.exec(s || ''); return m ? m[1] + (m[2] ? ':' + m[2] : '') : ''; };
const roads = K.map((k) => {
  let ll = k.ll;
  if (OLD[k.base]) ll = OLD[k.base];
  else if (!ll) ll = provCP[k.prov];
  const [cu, cv] = cnProj(ll), [su, sv] = FISH.pt(k.pt), [lu, lv] = LIN.pt(k.pt);
  // basis: '' = the name only reads as this place; otherwise an inference ('core' / 'cluster' / 'ambiguous', see classify.py)
  return [k.name, k.base, k.prov, k.label, k.kind === 'P' ? 1 : 0, DS[k.district], r1(cu), r1(cv), r1(su), r1(sv), r1(lu), r1(lv),
    k.basis === 'distinct' ? '' : k.basis, nearCode(k.near)];
}).sort((a, b) => a[0].localeCompare(b[0], 'zh'));
const meta = JSON.parse(fs.readFileSync(path.join(WORK, 'meta.json'), 'utf8'));
const revPath = path.join(WORK, 'reverse.json');
if (fs.existsSync(revPath)) meta.reverse = JSON.parse(fs.readFileSync(revPath, 'utf8'));
const OUT = path.join(ROOT, 'data', 'geo.json');
// roads: [name, stem, province, place label, named-after-province, district, china u, v, fisheye u, v, linear u, v, basis, nearby]
const plane = ({ w, h, shd, river }) => ({ w, h, shd, river });
const geo = { v: 4, cw: CW, ch: CH, cn: cnOut, nh: ringsToPath(nh.map((r) => r.map(cnProj))), fish: plane(FISH), lin: plane(LIN), roads, meta };
fs.writeFileSync(OUT, JSON.stringify(geo));
console.log('fisheye plane', FISH.w, 'x', FISH.h, '| linear plane', LIN.w, 'x', LIN.h, '| RMAX km', RMAX.toFixed(1), '| roads', roads.length, '| bytes', fs.statSync(OUT).size);
