"""Reverse check: take every current prefecture-level unit and every county-level city (GB/T 2260),
and search *all* Shanghai road names (any suffix, including 公路/弄/桥) for names containing it.
Anything the forward pass did not already decide on is listed as 新发现 for manual review.

Output: data/reverse-check.csv, work/reverse.json
"""
import collections
import csv
import os
import re

from common import ADMIN, DATA, instances, load_json, load_segments, save_json, work

ETH = ('蒙古 维吾尔 布依 朝鲜 土家 哈尼 哈萨克 傈僳 拉祜 东乡 纳西 景颇 柯尔克孜 达斡尔 仫佬 布朗 撒拉 毛南 仡佬 锡伯 '
       '阿昌 普米 塔吉克 乌孜别克 俄罗斯 鄂温克 德昂 保安 裕固 塔塔尔 独龙 鄂伦春 赫哲 门巴 珞巴 基诺 各 回 藏 苗 彝 壮 满 '
       '侗 瑶 白 傣 黎 佤 畲 水 土 羌 怒 京').split()

# reviewed by hand: every 新发现 hit is a lane / underpass / tunnel / bridge of a road already counted,
# an intercity highway named from local abbreviations, or a coincidental substring; these two are the
# only ones that do derive from a city's name, but they are named after a bay and a mountain range,
# which the forward rules exclude (as with 杭州湾大道, 长白山路, 瑞丽江路).
BORDERLINE = {'锦州湾路': '以锦州湾（海湾）命名', '大凉山路': '以大凉山（山脉）命名'}


def stem(n):
    if n.endswith('自治州'):
        n = n[:-3]
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
    for s in ('地区', '盟', '市'):
        if n.endswith(s) and len(n) - len(s) >= 2:
            return n[:-len(s)]
    return n


adm = load_json(ADMIN)
prov_name = {x['province']: re.sub(r'(省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)$', '', x['name'])
             for x in adm if x['city'] == 0 and x['area'] == 0 and x['town'] == 0}
levels = {
    '地级': [x for x in adm if x['city'] != 0 and x['area'] == 0 and x['town'] == 0 and '直辖' not in x['name']],
    '县级市': [x for x in adm if x['area'] != 0 and x['town'] == 0 and x['name'].endswith('市')],
}

segs, _ = load_segments()
inst = {name: instances(items) for name, items in segs.items()}
inst = {k: v for k, v in inst.items() if v}
names = sorted(inst)
kept = set(k['name'] for k in load_json(work('kept.json')))
decided = set(r['name'] for r in load_json(work('roads_all.json')) if r['base'])

summary = {'names': len(names)}
with open(os.path.join(DATA, 'reverse-check.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['层级', '行政区', '省级行政区', '包含该名的上海路名', '所在区', '长度(km)', '状态', '说明'])
    for level, units in levels.items():
        units = [(stem(x['name']), x['name'], prov_name[x['province']]) for x in units]
        units = [u for u in units if len(u[0]) >= 2 and u[2] != '上海']
        status_count = collections.Counter()
        found_units = set()
        for s, full, prov in units:
            for n in (n for n in names if s in n):
                status = '已收录' if n in kept else ('正向已排除' if n in decided else '新发现')
                note = BORDERLINE.get(n, '人工复核：非以该城市命名' if status == '新发现' else '')
                status_count[status] += 1
                if status == '已收录':
                    found_units.add(full)
                w.writerow([level, full, prov, n, '/'.join(sorted(set(i['district'] for i in inst[n]))),
                            round(sum(i['len'] for i in inst[n]), 2), status, note])
        summary[level] = {'units': len(units), 'withRoad': len(found_units), **status_count}
        print(level, summary[level])
summary['added'] = 0
save_json(summary, work('reverse.json'))
