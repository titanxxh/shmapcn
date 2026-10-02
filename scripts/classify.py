"""Decide which matched road names really borrow a Chinese place name.

Rules (see README):
  * EXCLUDE — everyday words and slogans, Shanghai's own places, mountains / rivers / seas / bays.
  * SOFT    — words that also read as ordinary auspicious or descriptive words, and bare urban-district
              names. These count in the seven central districts; elsewhere only when at least two
              other place-named roads of the same province (or three of the same region) lie within 3.5 km.
Each kept road records its basis: 'distinct' (the name only reads as this place), 'core' (a SOFT word kept
because it is in a central district), 'cluster' (a SOFT word kept because of same-province neighbours) or
'ambiguous' (several provinces have a place of this name; picked by PREFER or the neighbours). All but
'distinct' are inferences and are flagged as such on the page.
Output: work/kept.json, work/meta.json, data/roads.csv
"""
import collections
import csv
import os

from common import COUNTIES, DATA, dkm, load_json, save_json, work

R = load_json(work('roads_all.json'))
G = load_json(work('gazetteer.json'))

# prefecture parent of each county (for display, e.g. 即墨区 -> 青岛市即墨区)
PARENT = {}
for prov in os.listdir(COUNTIES):
    pdir = os.path.join(COUNTIES, prov)
    if not os.path.isdir(pdir):
        continue
    for sub in os.listdir(pdir):
        sdir = os.path.join(pdir, sub)
        if os.path.isdir(sdir):
            for f in os.listdir(sdir):
                if f.endswith('.geojson'):
                    PARENT[(sub if prov == '直辖市' else prov, f[:-8])] = sub

CORE = {'黄浦区', '静安区', '徐汇区', '长宁区', '普陀区', '虹口区', '杨浦区'}

EXCLUDE = set('''中山 东方 朝阳 和平 解放 新华 复兴 振兴 工农 前进 红旗 红星 向阳 东风 建华 爱民 友谊 共和 新建 新城 新市 城中 城北 城西 东城 西城
滨江 滨湖 湖滨 运河 海港 站前 南山 青山 白云 西湖 东湖 江南 河西 海棠 牡丹 芙蓉 荷塘 月湖 莲花 花山 太平 大同 长安 中原 龙华 宝山 普陀
天山 崂山 衡山 金沙 南海 东海 双河 山南 新北 海西 白沙 公安 合作 平原 凤凰 华亭 宝兴 新兴 苏州 怒江 卧龙 天河 天宁 古城 西市 港北 云安
江海 玉泉 建安 民乐 永胜 长兴 长岛 龙泉 西林 龙山 东港 沙河 金水 铁山 东昌 新龙 峨山 临江 沿河 香格里拉 浦江 崇州'''.split())

SOFT = set('''万安 永安 永宁 永和 永康 永兴 永泰 永平 永福 永丰 永新 永吉 永清 永春 永寿 永德 永登 永年 长乐 长宁 长寿 安宁 安平 安国 安福 安仁 安义 安远 安达
新民 新乐 新丰 新田 新源 新和 新泰 新宾 兴业 兴隆 兴国 兴城 康乐 同心 富民 大兴 宝安 紫金 桃源 石门 清河 清水 万宁 光泽 德兴 德安 天台 南安 南华
凌云 乐业 惠民 惠东 太和 大通 大新 龙门 石龙 大丰 江城 金川 金平 金阳 平安 平阳 平南 平乐 平山 平定 民和 民丰 富平 富川 和政 华宁 华容 华阴
吉安 定安 定兴 定边 福海 东兴 东安 东平 东明 中宁 中江 丰顺 双江 双峰 白水 白河 温泉 西华 进贤 庆安 天等 天镇 金华 西安 金塔 南乐 南郑
来安 正阳 汝南 白玉 富锦 富蕴 玉门 玉田 玉环 玉屏 海安 海阳 海城 海宁 江山 江安 广南 广德 广丰 合浦 合阳 同安 宁安 宁城 宁强 宁国 文安
政和 恩平 德昌 开平 开江 新会 南康 南明 南沙 曲江 龙城 龙文 汇川 万山 叠彩 右江 合川 船山 碧江 裕安 金台 铜山 青秀 花溪 东川 东胜 凌河 江川
通海 延寿 泰顺 秀山 江汉 洪山 嘉陵 延庆 顺义 顺庆 顺德 永川 高陵 高昌 兴庆 八步 乐都 丰南 临桂 南浔 上虞 柳南 柳江 新洲 石屏 石林 祥云'''.split())

# names distinctive enough to stand on their own even though they are urban districts or appear in SOFT
DISTINCT = set('''上虞 丹徒 余杭 六合 凉州 南浔 博山 历城 双城 双阳 双流 台儿庄 吴中 吴兴 吴江 呼兰 安塞 定海 宣化 密云 山海关 延平 昌平 昭化 武昌 武进 武都
汉阳 江宁 沙市 海拉尔 乐都 玉树 甘德 贵德 和政 临夏 临泽 临洮 临潭 天祝 崇信 榆中 华宁 景东 景洪 景谷 金塔 丰顺 东明 金阳 碧江 江汉 丰南 淮阴 爱辉 牟平
番禺 福山 芝罘 苏家屯 虎丘 金坛 长清 集宁 零陵 麦积 黄陂 临潼 通州 海州 荆州 淮安 白银 栖霞 昌邑'''.split())
PREFER = {'通州': '江苏', '海州': '江苏', '兴安': '内蒙古', '九龙': '香港', '吉林': '吉林', '河南': '河南'}
OLD_PROVINCE = {'西康': '四川', '热河': '河北', '察哈尔': '河北', '绥远': '内蒙古'}

REGION = {}
for names, reg in (('黑龙江 吉林 辽宁', '东北'), ('北京 天津 河北 山西 内蒙古', '华北'), ('陕西 甘肃 宁夏 青海 新疆', '西北'),
                   ('山东 江苏 安徽 浙江 福建 江西 上海 台湾', '华东'), ('河南 湖北 湖南', '华中'),
                   ('广东 广西 海南 香港 澳门', '华南'), ('重庆 四川 贵州 云南 西藏', '西南')):
    for p in names.split():
        REGION[p] = reg


def best_tier(stem):
    return min(m[0] for m in G[stem])


def is_soft(stem):
    if stem in DISTINCT:
        return False
    return stem in SOFT or best_tier(stem) >= 3


cand = [r for r in R if r['base'] and r['base'] not in EXCLUDE and r['len'] >= 0.06]
strong = [r for r in cand if not is_soft(r['base'])]


def neighbours(r, radius=3.5):
    c = collections.Counter()
    for s in strong:
        if s is not r and dkm(s['pt'], r['pt']) <= radius:
            for p in set(m[1] for m in G[s['base']] if m[0] == best_tier(s['base'])):
                c[p] += 1
                c['R:' + REGION.get(p, '')] += 1
    return c


def pick(stem, near):
    """Best match for a stem, and whether other provinces had an equally good claim to it."""
    ms = sorted(G[stem], key=lambda m: m[0])
    tied = [m for m in ms if m[0] == ms[0][0]]
    ambiguous = len(set(m[1] for m in tied)) > 1
    if stem in PREFER:
        for m in ms:
            if m[1] == PREFER[stem]:
                return m, True
    if len(tied) > 1 and near:
        tied.sort(key=lambda m: -near.get(m[1], 0))
    return tied[0], ambiguous


kept, dropped = [], []
for r in cand:
    b = r['base']
    near = neighbours(r)
    lane = r['name'].endswith('街') and b in SOFT          # old-town lanes often carry auspicious names
    if is_soft(b) and (r['district'] not in CORE or lane):
        ok = [m for m in G[b] if near.get(m[1], 0) >= 2 or (not lane and near.get('R:' + REGION.get(m[1], '?'), 0) >= 3)]
        if not ok:
            dropped.append(r)
            continue
        m = sorted(ok, key=lambda m: (-near.get(m[1], 0), -near.get('R:' + REGION.get(m[1], '?'), 0), m[0]))[0]
        basis = 'cluster'
    else:
        m, ambiguous = pick(b, near)
        basis = 'core' if is_soft(b) else 'ambiguous' if ambiguous else 'distinct'
    tier, prov, full, ll = m
    # what a 'cluster' entry leans on: same-province (or else same-region) place-named roads within 3.5 km
    nearby = ''
    if basis == 'cluster':
        n_prov, reg = near.get(prov, 0), REGION.get(prov, '')
        nearby = f'{n_prov} 条同省' if n_prov >= 2 else f'{near.get("R:" + reg, 0)} 条{reg}地区'
    if prov == '旧省':
        prov = OLD_PROVINCE[b]
    if tier == 0:
        label, kind = full, 'P'
    elif tier == 1.5:
        label, kind = b + '（' + full + '）', 'C'
    else:
        parent = PARENT.get((prov, full))
        label = full if (tier == 1 or not parent or parent == full) else parent + full
        kind = 'C'
    kept.append({'name': r['name'], 'base': b, 'prov': prov, 'label': label, 'kind': kind, 'tier': tier,
                 'district': r['district'], 'pt': r['pt'], 'll': ll, 'len': r['len'], 'basis': basis, 'near': nearby})

save_json(kept, work('kept.json'))
names = set(r['name'] for r in R)
cand_names = set(r['name'] for r in R if r['base'])
kept_names = set(k['name'] for k in kept)
meta = {'checked': len(names), 'candidates': len(cand_names), 'kept': len(kept_names), 'instances': len(kept),
        'places': len(set((k['prov'], k['base']) for k in kept)),
        'exWords': sorted(set(r['base'] for r in R if r['base'] in EXCLUDE)),
        'source': 'Overture Maps 2026-09-23.1 (OpenStreetMap)'}
save_json(meta, work('meta.json'))

CITY_LEVEL = {'北京', '天津', '重庆', '香港', '澳门'}
kept_keys = {(k['name'], k['district']) for k in kept}
with open(os.path.join(DATA, 'roads.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['路名', '所在区', '匹配地名', '省级行政区', '对应行政区', '结果', '说明', '判定'])
    BASIS = {'distinct': '名称独特',
             'core': '推断：也是常见字眼或市辖区名，位于中心城区',
             'cluster': '推断：也是常见字眼，附近 3.5 公里内有 {}地名路',
             'ambiguous': '推断：多个省份有同名地方，按周边道路或惯例选定'}
    for k in sorted(kept, key=lambda k: (k['prov'], k['base'], k['name'])):
        kind = '省名' if k['kind'] == 'P' and k['prov'] not in CITY_LEVEL else '城市/县名'
        w.writerow([k['name'], k['district'], k['base'], k['prov'], k['label'], '收录', kind, BASIS[k['basis']].format(k['near'])])
    rest = [r for r in R if r['base'] and (r['name'], r['district']) not in kept_keys]
    for r in sorted(rest, key=lambda r: (r['base'], r['name'])):
        why = ('常见词/本地地名/山河湖海' if r['base'] in EXCLUDE else
               '长度过短' if r['len'] < 0.06 else '吉祥字眼，所在区无同省地名成片')
        w.writerow([r['name'], r['district'], r['base'], '', '', '未收录', why, ''])

print('kept', len(kept), 'instances,', meta['kept'], 'names,', meta['places'], 'places; dropped soft', len(dropped))
print(collections.Counter(k['district'] for k in kept).most_common())
print('basis', collections.Counter(k['basis'] for k in kept).most_common())
