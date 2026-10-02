"""Forward pass: strip each Shanghai road name down to its stem and look it up in a national gazetteer
of provincial, prefectural and county-level names.

Output: work/roads_all.json (every road instance, with the matched stem if any), work/gazetteer.json.
"""
import collections
import os
import re

from common import COUNTIES, load_json, load_segments, instances, outer_rings, save_json, work

ETH = ('蒙古 维吾尔 布依 朝鲜 土家 哈尼 哈萨克 傈僳 拉祜 东乡 纳西 景颇 柯尔克孜 达斡尔 仫佬 布朗 撒拉 毛南 仡佬 锡伯 '
       '阿昌 普米 塔吉克 乌孜别克 俄罗斯 鄂温克 德昂 保安 裕固 塔塔尔 独龙 鄂伦春 赫哲 门巴 珞巴 基诺 各 回 藏 苗 彝 壮 满 '
       '侗 瑶 白 傣 黎 佤 畲 水 土 羌 怒 京 高山').split()


def strip_admin(n):
    """'镇宁布依族苗族自治县' -> '镇宁', '潍坊市' -> '潍坊'."""
    for suf in ('自治州', '自治县', '自治旗'):
        if n.endswith(suf):
            n = n[:-len(suf)]
            changed = True
            while changed:
                changed = False
                if n.endswith('族'):
                    n, changed = n[:-1], True
                for e in ETH:
                    if n.endswith(e) and len(n) > len(e):
                        n, changed = n[:-len(e)], True
                        break
            return n
    for suf in ('特别行政区', '林区', '特区', '地区', '新区', '矿区', '盟', '市', '县', '区', '旗'):
        if n.endswith(suf) and len(n) - len(suf) >= 2:
            return n[:-len(suf)]
    return n


# ---------- gazetteer: stem -> [(tier, province, full name, [lon, lat])] ----------
# tier 0 province, 1 prefecture, 1.5 historical name, 2 county / county-level city, 3 urban district
PROVS = ('北京 天津 河北 山西 内蒙古 辽宁 吉林 黑龙江 上海 江苏 浙江 安徽 福建 江西 山东 河南 湖北 湖南 广东 广西 海南 '
         '重庆 四川 贵州 云南 西藏 陕西 甘肃 青海 宁夏 新疆 香港 澳门 台湾').split()
G = collections.defaultdict(list)


def add(stem, tier, prov, full, ll):
    G[stem].append((tier, prov, full, ll))


for p in PROVS:
    add(p, 0, p, p, None)
for p in ('西康', '热河', '察哈尔', '绥远'):
    add(p, 0, '旧省', p + '（旧省名）', None)


def cp_of(path):
    return load_json(path)['features'][0]['properties'].get('cp')


def core_of(d):
    """Centre of a prefecture = centre of its smallest urban district."""
    best, best_area = None, 1e18
    files = [os.path.join(d, f) for f in os.listdir(d) if f.endswith('.geojson')]
    pool = [f for f in files if os.path.basename(f)[:-8].endswith('区')] or files
    for f in pool:
        ft = load_json(f)['features'][0]
        a = sum(abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))))
                for r in outer_rings(ft['geometry']))
        if a < best_area and ft['properties'].get('cp'):
            best_area, best = a, ft['properties']['cp']
    return best


for prov in sorted(os.listdir(COUNTIES)):
    pdir = os.path.join(COUNTIES, prov)
    if prov == '台湾' or not os.path.isdir(pdir):
        continue
    for sub in sorted(os.listdir(pdir)):
        sdir = os.path.join(pdir, sub)
        if prov == '直辖市':
            if sub == '上海':
                continue
            for f in sorted(os.listdir(sdir)):
                full = f[:-8]
                add(strip_admin(full), 3 if full.endswith('区') else 2, sub, full, cp_of(os.path.join(sdir, f)))
            continue
        if not os.path.isdir(sdir):
            continue
        add(strip_admin(sub), 1, prov, sub, core_of(sdir))
        for f in sorted(os.listdir(sdir)):
            full = f[:-8]
            add(strip_admin(full), 3 if full.endswith('区') else 2, prov, full, cp_of(os.path.join(sdir, f)))

TAIWAN = {'台北': (121.56, 25.04), '新北': (121.47, 25.01), '基隆': (121.74, 25.13), '桃园': (121.30, 24.99),
          '新竹': (120.97, 24.80), '苗栗': (120.82, 24.56), '台中': (120.68, 24.14), '彰化': (120.54, 24.08),
          '南投': (120.68, 23.91), '云林': (120.43, 23.71), '嘉义': (120.45, 23.48), '台南': (120.21, 22.99),
          '高雄': (120.31, 22.63), '屏东': (120.49, 22.67), '宜兰': (121.75, 24.75), '花莲': (121.60, 23.99),
          '台东': (121.15, 22.76), '澎湖': (119.57, 23.57), '金门': (118.32, 24.43), '淡水': (121.44, 25.17)}
for k, ll in TAIWAN.items():
    add(k, 2 if k == '淡水' else 1, '台湾', k, list(ll))

HISTORIC = {'金陵': ('江苏', '南京古称', (118.78, 32.05)), '汉口': ('湖北', '今属武汉', (114.27, 30.60)),
            '江浦': ('江苏', '今南京浦口区', (118.63, 32.06)), '宛平': ('北京', '今属北京丰台', (116.22, 39.85)),
            '塘沽': ('天津', '今天津滨海新区', (117.65, 39.02)), '大沽': ('天津', '今天津滨海新区', (117.70, 38.97)),
            '牛庄': ('辽宁', '今辽宁海城牛庄镇', (122.69, 40.88)), '腾越': ('云南', '今云南腾冲', (98.49, 25.02)),
            '眉州': ('四川', '今四川眉山', (103.85, 30.08)), '宜山': ('广西', '今广西宜州', (108.64, 24.49)),
            '昌化': ('浙江', '今属杭州临安区', (119.22, 30.16)), '临平': ('浙江', '今杭州临平区', (120.30, 30.42)),
            '九龙': ('香港', '香港九龙', (114.17, 22.32)), '吴县': ('江苏', '今属苏州', (120.62, 31.30)),
            '鄞县': ('浙江', '今宁波鄞州区', (121.55, 29.82)), '奉天': ('辽宁', '沈阳旧称', (123.43, 41.80)),
            '襄樊': ('湖北', '今襄阳', (112.14, 32.04)), '嵊县': ('浙江', '今嵊州', (120.82, 29.59))}
for k, (p, note, ll) in HISTORIC.items():
    add(k, 1.5, p, note, list(ll))

# ---------- road names ----------
SUFFIX = re.compile(r'^(.+?)(大街|大道|支路|路|街|道)$')
# intercity highways are usually named from abbreviations of two local places (宝安公路 = 宝山–安亭)
SKIP = re.compile(r'(公路|高速|快速路|高架|线|隧道|大桥|桥|弄|巷|广场)$')
NUM = '一二三四五六七八九十'


def stems(name):
    """'南京西路' -> ['南京西', '南京'], '东大名路' -> ['东大名', '大名'], '广灵二路' -> ['广灵二', '广灵']."""
    m = SUFFIX.match(name)
    if not m:
        return []
    x = m.group(1)
    out = [x]
    y = x
    if y and y[-1] in '新老':
        y = y[:-1]
        out.append(y)
    while y and y[-1] in NUM:
        y = y[:-1]
    if y != x:
        out.append(y)
    if y and y[-1] in '东西南北中' and len(y) > 2:
        out.append(y[:-1])
    for z in list(out):
        if z and z[0] in '东西南北' and len(z) >= 3:
            out.append(z[1:])
    seen = []
    for o in out:
        if o and o not in seen:
            seen.append(o)
    return seen


if __name__ == '__main__':
    segs, skipped = load_segments(SKIP)
    roads = []
    for name, items in segs.items():
        ss = stems(name)
        hit = next((s for s in ss if s in G and len(s) >= 2), None)
        for inst in instances(items):
            roads.append(dict(name=name, base=hit, bases=ss, **inst))
    save_json(roads, work('roads_all.json'))
    save_json(dict(G), work('gazetteer.json'))
    hits = [r for r in roads if r['base']]
    print('road instances:', len(roads), 'distinct names:', len(set(r['name'] for r in roads)), 'skipped segments:', skipped)
    print('matching a place name:', len(hits), 'instances,', len(set(r['name'] for r in hits)), 'names,',
          len(set(r['base'] for r in hits)), 'stems')
