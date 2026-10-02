// English names for the roads and places in data/geo.json, for the English version of the page.
// Road names are romanised the way Shanghai street signs do it (南京西路 -> Nanjing Rd (W));
// places use pinyin, except for the handful with a settled English name (Harbin, Urumqi, Taipei ...).
// Input: data/geo.json, sources/pinyin (pinyin-pro). Output: data/en.json, rows aligned with geo.roads.
const fs = require('fs');
const path = require('path');
const { pinyin, customPinyin } = require(path.join(__dirname, '..', 'sources', 'pinyin', 'package'));

// readings that pinyin-pro gets wrong for these place names
customPinyin({
  乐清: 'yue qing', 单县: 'shan xian', 什邡: 'shi fang', 洪洞: 'hong tong', 歙县: 'she xian', 莘县: 'shen xian',
  蔚县: 'yu xian', 尉犁: 'yu li', 繁峙: 'fan shi', 大埔: 'da bu', 乐亭: 'lao ting', 犍为: 'qian wei', 筠连: 'jun lian',
  枞阳: 'zong yang', 盱眙: 'xu yi', 番禺: 'pan yu', 铅山: 'yan shan', 六安: 'lu an', 六合: 'lu he', 东阿: 'dong e',
  涡阳: 'guo yang', 浚县: 'xun xian', 柏乡: 'bai xiang', 荥阳: 'xing yang',
  长汀: 'chang ting', 长清: 'chang qing', 长乐: 'chang le', 长宁: 'chang ning', 长寿: 'chang shou', 长兴: 'chang xing',
  重庆: 'chong qing', 厦门: 'xia men', 蚌埠: 'beng bu', 莎车: 'sha che', 吐鲁番: 'tu lu fan', 朝阳: 'chao yang',
  台州: 'tai zhou', 天台: 'tian tai', 都江堰: 'du jiang yan', 曲阜: 'qu fu', 曲靖: 'qu jing', 大名: 'da ming', 华县: 'hua xian',
  华阴: 'hua yin', 华容: 'hua rong', 济南: 'ji nan', 济宁: 'ji ning', 济阳: 'ji yang', 宿迁: 'su qian', 宿州: 'su zhou',
  沈阳: 'shen yang', 漯河: 'luo he', 泌阳: 'bi yang', 珲春: 'hun chun',
  茌平: 'chi ping', 洱源: 'er yuan', 噶尔: 'ga er', 和田: 'he tian', 和龙: 'he long', 乐平: 'le ping', 黄陂: 'huang pi',
  都昌: 'du chang', 乐都: 'le du', 武都: 'wu du',
});

// conventional English names (places only; road names keep the pinyin that is on the street signs)
const EXONYM = {
  哈尔滨: 'Harbin', 齐齐哈尔: 'Qiqihar', 呼和浩特: 'Hohhot', 乌鲁木齐: 'Urumqi', 拉萨: 'Lhasa', 喀什: 'Kashgar', 西安: "Xi'an",
  日喀则: 'Shigatse', 昌都: 'Qamdo', 林芝: 'Nyingchi', 那曲: 'Nagqu', 阿里: 'Ngari', 格尔木: 'Golmud', 吐鲁番: 'Turpan',
  和田: 'Hotan', 阿克苏: 'Aksu', 库尔勒: 'Korla', 克拉玛依: 'Karamay', 阿勒泰: 'Altay', 呼伦贝尔: 'Hulunbuir', 海拉尔: 'Hailar',
  乌兰浩特: 'Ulanhot', 二连浩特: 'Erenhot', 锡林浩特: 'Xilinhot', 鄂尔多斯: 'Ordos', 巴彦淖尔: 'Bayannur', 阿拉善: 'Alxa',
  台北: 'Taipei', 高雄: 'Kaohsiung', 基隆: 'Keelung', 台中: 'Taichung', 台南: 'Tainan', 淡水: 'Tamsui', 金门: 'Kinmen',
  新竹: 'Hsinchu', 嘉义: 'Chiayi', 九龙: 'Kowloon', 香港: 'Hong Kong', 澳门: 'Macao', 内蒙古: 'Inner Mongolia', 西藏: 'Tibet',
  陕西: 'Shaanxi', 吉林: 'Jilin', 博尔塔拉: 'Bortala', 巴音郭楞: 'Bayingolin', 克孜勒苏: 'Kizilsu', 伊犁: 'Ili', 乌兰察布: 'Ulanqab',
  锡林郭勒: 'Xilingol', 兴安: 'Hinggan',
};
// historical names, written out
const HISTORIC = {
  昌化: 'Changhua (now part of Lin’an, Hangzhou)', 大沽: 'Dagu (now Binhai, Tianjin)', 汉口: 'Hankou (now part of Wuhan)',
  江浦: 'Jiangpu (now Pukou, Nanjing)', 金陵: 'Jinling (old name of Nanjing)', 九龙: 'Kowloon (Hong Kong)',
  临平: 'Linping (Hangzhou)', 眉州: 'Meizhou (now Meishan, Sichuan)', 牛庄: 'Niuzhuang (now in Haicheng, Liaoning)',
  热河: 'Rehe (former province)', 塘沽: 'Tanggu (now Binhai, Tianjin)', 腾越: 'Tengyue (now Tengchong, Yunnan)',
  宛平: 'Wanping (now part of Fengtai, Beijing)', 西康: 'Xikang (former province)', 宜山: 'Yishan (now Yizhou, Guangxi)',
  察哈尔: 'Chahar (former province)', 绥远: 'Suiyuan (former province)',
};
const PROV = {
  黑龙江: 'Heilongjiang', 吉林: 'Jilin', 辽宁: 'Liaoning', 北京: 'Beijing', 天津: 'Tianjin', 河北: 'Hebei', 山西: 'Shanxi',
  内蒙古: 'Inner Mongolia', 陕西: 'Shaanxi', 甘肃: 'Gansu', 宁夏: 'Ningxia', 青海: 'Qinghai', 新疆: 'Xinjiang', 山东: 'Shandong',
  江苏: 'Jiangsu', 安徽: 'Anhui', 浙江: 'Zhejiang', 福建: 'Fujian', 江西: 'Jiangxi', 河南: 'Henan', 湖北: 'Hubei', 湖南: 'Hunan',
  广东: 'Guangdong', 广西: 'Guangxi', 海南: 'Hainan', 重庆: 'Chongqing', 四川: 'Sichuan', 贵州: 'Guizhou', 云南: 'Yunnan',
  西藏: 'Tibet', 香港: 'Hong Kong', 澳门: 'Macao', 台湾: 'Taiwan',
};
const ETHNIC = ('维吾尔 哈萨克 柯尔克孜 乌孜别克 塔吉克 塔塔尔 俄罗斯 达斡尔 鄂温克 鄂伦春 蒙古 朝鲜 土家 布依 哈尼 傈僳 拉祜 纳西 景颇 ' +
  '仫佬 毛南 仡佬 东乡 撒拉 保安 裕固 锡伯 阿昌 普米 德昂 独龙 门巴 珞巴 基诺 赫哲 高山 回 藏 苗 彝 壮 满 侗 瑶 白 傣 黎 佤 畲 水 土 羌 怒 京 布朗').split(' ');

// pinyin syllables -> "Xi'an": capitalised, with an apostrophe before a syllable starting with a vowel
function roman(zh) {
  const syl = pinyin(zh, { toneType: 'none', type: 'array', v: false }).map((s) => s.toLowerCase());
  const s = syl.map((x, i) => (i && /^[aoe]/.test(x) ? "'" : '') + x).join('');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const place = (zh) => EXONYM[zh] || roman(zh);
// "黔东南苗族侗族自治州" -> "黔东南", "玉林市" -> "玉林"
function bareUnit(name) {
  let s = name.replace(/(自治州|自治县|自治旗|地区|林区|特区|新区|市|县|区|盟|旗|州)$/, '');
  for (let changed = true; changed;) {
    changed = false;
    for (const e of ETHNIC) {
      const tail = s.endsWith(e + '族') ? e + '族' : e.length > 1 && s.endsWith(e) ? e : '';   // 蒙古自治州 has no 族
      if (tail && s.length > tail.length + 1) { s = s.slice(0, -tail.length); changed = true; }
    }
  }
  return s || name;
}

const DIR = { 东: 'E', 西: 'W', 南: 'S', 北: 'N', 中: 'M' };
const NTH = { 一: '1st', 二: '2nd', 三: '3rd', 四: '4th', 五: '5th', 六: '6th', 七: '7th', 八: '8th', 九: '9th' };
// 南京西路 -> Nanjing Rd (W); 东大名路 -> Daming Rd (E); 广灵二路 -> Guangling 2nd Rd; 临沧支路 -> Lincang Branch Rd
function roadName(name, base) {
  const i = name.indexOf(base);
  const pre = name.slice(0, i), post = name.slice(i + base.length);
  const m = post.match(/^([东西南北中]?)([一二三四五六七八九]?)(支路|大道|路|街)$/);
  if (!m || (pre && !DIR[pre])) return roman(name);
  const [, d, n, kind] = m;
  const type = { 支路: 'Branch Rd', 大道: 'Ave', 路: 'Rd', 街: 'St' }[kind];
  const dir = DIR[pre] || DIR[d];
  return roman(base) + ' ' + (n ? NTH[n] + ' ' : '') + type + (dir ? ` (${dir})` : '');
}
// place label -> [name, context]: 南京市 -> [Nanjing, Jiangsu]; 玉林市兴业县 -> [Xingye, Yulin, Guangxi]
function placeName(base, prov, label, isProv) {
  const P = PROV[prov] || roman(prov);
  if (HISTORIC[base]) return [HISTORIC[base], P];
  if (isProv) return [P, ''];
  const at = label.lastIndexOf(base);
  const parent = at > 0 ? place(bareUnit(label.slice(0, at))) : '';
  const ctx = [parent, P].filter((x, i, a) => x && x !== a[i - 1] && x !== place(base));
  return [place(base), ctx.join(', ')];
}

const ROOT = path.join(__dirname, '..');
const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'geo.json'), 'utf8'));
const roads = geo.roads.map(([name, base, prov, label, isP]) => [roadName(name, base), ...placeName(base, prov, label, isP)]);
const OUT = path.join(ROOT, 'data', 'en.json');
// first column double-checks the alignment with geo.roads on the page
fs.writeFileSync(OUT, JSON.stringify({ v: geo.v, n: roads.length, roads }));
console.log('roads', roads.length, '| bytes', fs.statSync(OUT).size);
