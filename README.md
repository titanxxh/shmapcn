# 上海路名里的中国

上海有 800 多个路名取自全国各地的省、市、县。这个项目把上海的全部路名与全国行政区名逐一比对，并用一张双层三维地图展示映射关系：上层是中国，下层是上海，彩色细线把每座城市连到以它命名的道路，颜色区分省份。

**在线查看：** https://titanxxh.github.io/shmapcn/

## 结果

| | |
|---|---|
| 比对的路名（以“路、街、大道”结尾） | 7,915 |
| 与地名同名的候选 | 1,088 |
| 收录：取自外地地名的路名 | 819 个（829 处道路） |
| 对应的城市与县份 | 662 个 |
| 涉及的省级行政区 | 33 个 |

除了外滩一带“南北向用省名、东西向用城市名”的老规则，方位对应一直延伸到郊区：杨浦、宝山是东北三省，原闸北、普陀是山西、陕西，徐汇是广西，长宁是贵州，浦东是山东；嘉定集中了新疆、甘肃，闵行是云南，金山石化一带是广西。

完整比对表见 [`data/roads.csv`](data/roads.csv)（收录与未收录均列出，未收录的附原因），反向核对见 [`data/reverse-check.csv`](data/reverse-check.csv)。

## 方法

1. **取路名**：从 [Overture Maps](https://overturemaps.org/)（源自 OpenStreetMap，2026-09-23.1 版）取出上海范围内所有有名称的道路，坐标转换为 GCJ-02 后按区界归属到 16 个区；同名且相连的路段合并为一条道路，不相连的同名道路分别计数。
2. **正向比对**：把路名去掉“东西南北中”、数字、“新/老”和“路、街、大道”等后缀，得到词干（如 南京西路 → 南京，东大名路 → 大名，广灵二路 → 广灵），在全国省、地、县三级行政区名（含金陵、汉口、腾越、眉州等少量旧称和台湾地名）中查找。公路、高速等城际道路多以两地缩写命名（宝安公路 = 宝山—安亭），不参与比对。
3. **人工规则过滤**（`scripts/classify.py`）：
   - 排除常见词与口号（中山、和平、解放、新华、朝阳……）、上海本地地名（宝山、普陀、龙华、华亭……）、山河湖海（天山、衡山、怒江、苏州河……）。
   - “永安”“长兴”这类本身也是吉祥字眼的县名，以及一般的市辖区名，只在中心城区七个区计入；在郊区，只有附近 3.5 公里内有同省地名成片出现时才计入（例如闵行的云南县名群）。
   - 同名多处（如“通州”）优先取周边道路所属的省份。
4. **反向核对**（`scripts/reverse.py`）：以 GB/T 2260 中全部 333 个地级行政区和 396 个县级市逐一反查上海全部路名（包括公路、弄、桥），未发现新的遗漏——多出来的匹配都是已收录道路的支弄、地道和桥，以地名缩写命名的公路，或偶然包含该字样的路名；锦州湾路、大凉山路以海湾和山脉命名，按规则不计入。

路名与地名的对应由名称推断，个别道路可能另有出处，欢迎提 issue 指正。

## 目录

```
index.html, assets/      网页（纯 HTML/CSS/JS，无需构建）
data/geo.json            网页使用的地图与道路数据
data/roads.csv           全部候选的比对结果
data/reverse-check.csv   地级市、县级市反向核对结果
scripts/                 数据处理流程
.github/workflows/       GitHub Pages 部署
```

## 重新生成数据

需要 Python 3.10+、Node.js 18+ 和网络连接。

```bash
pip install -r scripts/requirements.txt
bash scripts/fetch_sources.sh      # 行政区划与地图边界（npm 上的公开数据包）→ sources/
cd scripts
python3 fetch_overture.py          # 上海全部道路 → work/segments.jsonl（只按需下载相关数据块）
python3 match.py                   # 正向比对 → work/roads_all.json
python3 classify.py                # 规则过滤 → work/kept.json, data/roads.csv
python3 reverse.py                 # 反向核对 → data/reverse-check.csv
node build_geo.js                  # 地图投影 → data/geo.json
```

本地预览：在仓库根目录运行 `python3 -m http.server`，打开 http://localhost:8000 。

## 数据来源与许可

- 道路名称与位置：© OpenStreetMap 贡献者，经 Overture Maps 发布，[ODbL](https://opendatacommons.org/licenses/odbl/)。由其派生的 `data/` 文件同样以 ODbL 提供。
- 全国省级边界与南海诸岛插图：[Apache ECharts](https://echarts.apache.org/) 4.9 地图数据（Apache-2.0）。
- 区县边界与中心点：[echarts-china-counties-js](https://www.npmjs.com/package/echarts-china-counties-js)（MIT）。
- 行政区划代码与名称：[province-city-china](https://github.com/uiwjs/province-city-china)（MIT，GB/T 2260）。

代码以 MIT 许可发布，见 [LICENSE](LICENSE)。
