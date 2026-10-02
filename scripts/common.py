"""Shared paths and geometry helpers for the data pipeline."""
import collections
import json
import math
import os
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = os.path.join(ROOT, 'sources')
WORK = os.path.join(ROOT, 'work')
DATA = os.path.join(ROOT, 'data')
COUNTIES = os.path.join(SOURCES, 'counties', 'package', 'src')   # county-level polygons, GCJ-02
ADMIN = os.path.join(SOURCES, 'admin', 'package', 'data.json')    # GB/T 2260 division list
for d in (WORK, DATA):
    os.makedirs(d, exist_ok=True)


def work(name):
    return os.path.join(WORK, name)


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save_json(obj, path):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)


# ---------- geometry ----------
def wkb_lines(h):
    """Decode a (Multi)LineString WKB hex string into lists of (lon, lat)."""
    b = bytes.fromhex(h)

    def header(off):
        bo = '<' if b[off] == 1 else '>'
        return bo, struct.unpack(bo + 'I', b[off + 1:off + 5])[0], off + 5

    def line(off, bo):
        n = struct.unpack(bo + 'I', b[off:off + 4])[0]
        off += 4
        return [struct.unpack(bo + 'dd', b[off + 16 * i: off + 16 * i + 16]) for i in range(n)], off + 16 * n

    bo, t, off = header(0)
    if t == 2:
        return [line(off, bo)[0]]
    if t == 5:
        n = struct.unpack(bo + 'I', b[off:off + 4])[0]
        off += 4
        out = []
        for _ in range(n):
            bo2, _, off = header(off)
            pts, off = line(off, bo2)
            out.append(pts)
        return out
    return []


def wgs2gcj(lon, lat):
    """WGS-84 -> GCJ-02, so road coordinates line up with Chinese boundary data."""
    a = 6378245.0
    ee = 0.00669342162296594323
    x, y = lon - 105.0, lat - 35.0
    r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    r += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    r += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    r += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    n = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    n += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    n += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    n += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    rl = lat / 180.0 * math.pi
    m = 1 - ee * math.sin(rl) ** 2
    sm = math.sqrt(m)
    return (lon + (n * 180.0) / (a / sm * math.cos(rl) * math.pi),
            lat + (r * 180.0) / ((a * (1 - ee)) / (m * sm) * math.pi))


KX = math.cos(math.radians(31.2)) * 111.32   # km per degree of longitude at Shanghai
KY = 110.57                                  # km per degree of latitude


def dkm(a, b):
    return math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY)


def seglen(pts):
    return sum(dkm(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def midpoint(pts):
    total, acc = seglen(pts), 0
    for i in range(len(pts) - 1):
        d = dkm(pts[i], pts[i + 1])
        if acc + d >= total / 2 and d > 0:
            t = (total / 2 - acc) / d
            return (pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1]))
        acc += d
    return pts[len(pts) // 2]


def pip(pt, ring):
    x, y = pt
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def outer_rings(g):
    if g['type'] == 'Polygon':
        return [g['coordinates'][0]]
    if g['type'] == 'MultiPolygon':
        return [p[0] for p in g['coordinates'] if p]
    return []


def shanghai_districts():
    out = []
    shdir = os.path.join(COUNTIES, '直辖市', '上海')
    for f in sorted(os.listdir(shdir)):
        ft = load_json(os.path.join(shdir, f))['features'][0]
        rings = outer_rings(ft['geometry'])
        xs = [p[0] for r in rings for p in r]
        ys = [p[1] for r in rings for p in r]
        out.append((ft['properties']['name'], rings, (min(xs), min(ys), max(xs), max(ys))))
    return out


_SH = None


def district(pt):
    global _SH
    if _SH is None:
        _SH = shanghai_districts()
    for name, rings, bb in _SH:
        if bb[0] <= pt[0] <= bb[2] and bb[1] <= pt[1] <= bb[3] and any(pip(pt, r) for r in rings):
            return name
    return None


def clusters(items, eps=0.9):
    """Single-linkage grouping of same-name segments (midpoint + ends) within eps km."""
    n = len(items)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    grid = collections.defaultdict(list)
    for i, (mp, _, _, a, b) in enumerate(items):
        for p in (mp, a, b):
            x, y = p[0] * KX, p[1] * KY
            grid[(int(x // eps), int(y // eps))].append((x, y, i))
    for (gx, gy), lst in grid.items():
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for x, y, i in lst:
                    for x2, y2, j in grid.get((gx + dx, gy + dy), []):
                        if i < j and (x - x2) ** 2 + (y - y2) ** 2 <= eps * eps:
                            ri, rj = find(i), find(j)
                            if ri != rj:
                                parent[ri] = rj
    groups = collections.defaultdict(list)
    for i in range(n):
        groups[find(i)].append(items[i])
    return list(groups.values())


def load_segments(skip=None):
    """name -> [(midpoint, length_km, class, start, end)] in GCJ-02, optionally skipping by regex."""
    segs = collections.defaultdict(list)
    skipped = 0
    with open(work('segments.jsonl'), encoding='utf-8') as f:
        for line in f:
            r = json.loads(line)
            name = r['name'].strip()
            if skip is not None and skip.search(name):
                skipped += 1
                continue
            for pts in wkb_lines(r['wkb']):
                if len(pts) < 2:
                    continue
                pts = [wgs2gcj(*p) for p in pts]
                segs[name].append((midpoint(pts), seglen(pts), r['cls'], pts[0], pts[-1]))
    return segs, skipped


def instances(items):
    """Split one name's segments into separate roads; return (length, representative point, district) each."""
    out = []
    for grp in clusters(items):
        total = sum(g[1] for g in grp)
        cx = sum(g[0][0] * g[1] for g in grp) / max(total, 1e-9)
        cy = sum(g[0][1] * g[1] for g in grp) / max(total, 1e-9)
        rep = min(grp, key=lambda g: (g[0][0] - cx) ** 2 + (g[0][1] - cy) ** 2)[0]
        if not district(rep):
            continue
        by = collections.Counter()
        for g in grp:
            d = district(g[0])
            if d:
                by[d] += g[1]
        cls = collections.Counter(g[2] for g in grp).most_common(1)[0][0]
        out.append({'len': round(total, 2), 'pt': [round(rep[0], 5), round(rep[1], 5)],
                    'district': by.most_common(1)[0][0], 'cls': cls})
    return out
