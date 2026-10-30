import {validateOrdinaryFilters,ordinaryFilterContract} from './lib/ordinary-filter-contract.js';
import { collectOrdinarySearch, inspectOrdinarySearchDOM, scrollOrdinarySearchDOM } from './lib/ordinary-search-collector.js';
import {requestFingerprint,sessionBinding,readSearchCursor,writeSearchCursor,publishSearchCheckpoint} from './lib/ordinary-search-cursor.js';
import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getLinkedInTier, getTierConfig, normalizeTier } from './lib/index.js';
import {
  getPeopleSearchUrl,
} from './lib/index.js';
import { validateTier } from './lib/index.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CONFIG_DIR = path.join(process.env.HUNTER_DATA_DIR || path.join(os.homedir(), '.hunter'), 'channels', 'linkedin');
const SCOUT_RESULT_FILE = path.join(CONFIG_DIR, 'linkedin-scout-result.json');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// ========== 地点 Geo ID 自学习缓存 ==========
const GEO_CACHE_FILE = path.join(CONFIG_DIR, 'geo-id-cache.json');

function getGeoCache() {
  try {
    return JSON.parse(fs.readFileSync(GEO_CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveGeoCache(cache) {
  ensureConfigDir();
  fs.writeFileSync(GEO_CACHE_FILE, JSON.stringify(cache, null, 2));
}

// 从 LOCATION_URN_MAP 初始化 geo 缓存（URN → 纯数字 ID）
// 若缓存文件已存在，则合并新增别名（避免旧缓存缺少英文别名）
function initGeoCache() {
  const existing = getGeoCache();
  let updated = false;
  const cache = { ...existing };
  for (const [name, urn] of Object.entries(LOCATION_URN_MAP)) {
    const match = urn.match(/urn:li:geo:(\d+)/);
    if (match && !cache[name]) {
      cache[name] = match[1];
      updated = true;
    }
  }
  if (updated) {
    saveGeoCache(cache);
  }
}

// 档案语言 ISO 码映射
const LANGUAGE_CODE_MAP = {
  '英语': 'en', '英文': 'en', 'English': 'en',
  '中文': 'zh', '简体中文': 'zh', 'Chinese': 'zh',
  '日语': 'ja', '日文': 'ja', 'Japanese': 'ja',
  '韩语': 'ko', '韩文': 'ko', 'Korean': 'ko',
  '法语': 'fr', 'French': 'fr',
  '德语': 'de', 'German': 'de',
  '西班牙语': 'es', 'Spanish': 'es',
  '葡萄牙语': 'pt', 'Portuguese': 'pt',
  '意大利语': 'it', 'Italian': 'it',
  '俄语': 'ru', 'Russian': 'ru',
  '阿拉伯语': 'ar', 'Arabic': 'ar',
  '荷兰语': 'nl', 'Dutch': 'nl',
  '瑞典语': 'sv', 'Swedish': 'sv',
  '波兰语': 'pl', 'Polish': 'pl',
  '土耳其语': 'tr', 'Turkish': 'tr',
  '印地语': 'hi', 'Hindi': 'hi',
  '泰语': 'th', 'Thai': 'th',
  '越南语': 'vi', 'Vietnamese': 'vi',
  '印尼语': 'id', 'Indonesian': 'id',
  '马来语': 'ms', 'Malay': 'ms',
};

// LinkedIn 消费者人才搜索使用的行业数字 ID（legacy V1 编码）
// 同时保留中英文别名，方便不同语言参数传入
// 注意：V2 API 中 Education Management 等少数行业 ID 不同；消费者搜索路径目前使用 V1 ID
const INDUSTRY_ID_MAP = {
  'Accounting': '1', '会计': '1',
  'Airlines/Aviation': '2', '航空': '2',
  'Computer Software': '4', '计算机软件': '4', '软件': '4',
  'Computer Networking': '5', '计算机网络': '5',
  'Computer & Network Security': '6', '计算机与网络安全': '6',
  'Construction': '7', '建筑': '7',
  'Consumer Electronics': '8', '消费电子': '8',
  'Consumer Services': '9', '消费者服务': '9',
  'Design': '13', '设计': '13',
  'Hospital & Health Care': '14', '医院与医疗保健': '14', '医疗保健': '14', 'Healthcare': '14',
  'Pharmaceuticals': '15', '制药': '15',
  'Biotechnology': '16', '生物技术': '16',
  'Medical Devices': '17', '医疗器械': '17',
  'Logistics and Supply Chain': '18', '物流与供应链': '18',
  'Luxury Goods & Jewelry': '19', '奢侈品与珠宝': '19',
  'Market Research': '20', '市场研究': '20',
  'Mechanical or Industrial Engineering': '21', '机械或工业工程': '21',
  'Mental Health Care': '22', '心理健康护理': '22',
  'Civic & Social Organization': '23', '公民与社会组织': '23',
  'Civil Engineering': '24', '土木工程': '24',
  'Manufacturing': '25', '制造业': '25',
  'Automotive': '26', '汽车': '26',
  'Retail': '27', '零售': '27',
  'Chemicals': '28', '化工': '28',
  'Machinery': '29', '机械': '29',
  'Maritime': '30', '海事': '30',
  'Electrical/Electronic Manufacturing': '31', '电子制造': '31',
  'Telecommunications': '32', '电信': '32',
  'Food & Beverages': '33', '食品与饮料': '33',
  'Transportation/Trucking/Railroad': '34', '交通运输': '34',
  'Restaurants': '35', '餐饮': '35',
  'Utilities': '36', '公共事业': '36',
  'Wholesale': '37', '批发': '37',
  'Furniture': '38', '家具': '38',
  'Investment Banking': '39', '投资银行': '39',
  'Financial Services': '40', '金融服务': '40',
  'Banking': '41', '银行': '41',
  'Insurance': '42', '保险': '42',
  'Industrial Automation': '43', '工业自动化': '43',
  'Real Estate': '44', '房地产': '44',
  'Venture Capital & Private Equity': '45', '风险投资与私募股权': '45',
  'Investment Management': '46', '投资管理': '46',
  'Law Practice': '47', '法律实践': '47',
  'Architecture & Planning': '48', '建筑与规划': '48',
  'Computer Games': '49', '电脑游戏': '49',
  'Gambling & Casinos': '50', '赌博与赌场': '50',
  'Arts and Crafts': '51', '艺术与手工艺': '51',
  'Fine Art': '52', '美术': '52',
  'Graphic Design': '53', '平面设计': '53',
  'Health, Wellness and Fitness': '54', '健康与健身': '54',
  'Entertainment': '55', '娱乐': '55',
  'Events Services': '56', '活动服务': '56',
  'Oil & Energy': '57', '石油与能源': '57',
  'Management Consulting': '58', '管理咨询': '58',
  'Mining & Metals': '59', '采矿与金属': '59',
  'Nonprofit Organization Management': '60', '非营利组织管理': '60',
  'Government Administration': '61', '政府管理': '61',
  'International Trade and Development': '62', '国际贸易与发展': '62',
  'Translation and Localization': '63', '翻译与本地化': '63',
  'Wine and Spirits': '64', '葡萄酒与烈酒': '64',
  'Wireless': '65', '无线': '65',
  'Writing and Editing': '66', '写作与编辑': '66',
  'Primary/Secondary Education': '67', '中小学教育': '67',
  'Higher Education': '68', '高等教育': '68',
  'Education Management': '69', '教育管理': '69', '教育': '69',
  'Human Resources': '70', '人力资源': '70',
  'Staffing and Recruiting': '71', '人才招聘': '71',
  'Professional Training & Coaching': '72', '职业培训与教练': '72',
  'Philanthropy': '73', '慈善': '73',
  'Photography': '74', '摄影': '74',
  'Plastics': '75', '塑料': '75',
  'Political Organization': '76', '政治组织': '76',
  'Printing': '77', '印刷': '77',
  'Public Policy': '78', '公共政策': '78',
  'Public Relations and Communications': '79', '公共关系与传播': '79',
  'Marketing and Advertising': '80', '市场营销与广告': '80',
  'Railroad Manufacture': '81', '铁路制造': '81',
  'Ranching': '82', '牧场': '82',
  'Media Production': '83', '媒体制作': '83',
  'Online Media': '84', '网络媒体': '84',
  'Publishing': '85', '出版': '85',
  'Renewables & Environment': '86', '可再生能源与环境': '86',
  'Research': '87', '研究': '87',
  'Security and Investigations': '88', '安全与调查': '88',
  'Semiconductors': '89', '半导体': '89',
  'Shipbuilding': '90', '造船': '90',
  'Sporting Goods': '91', '体育用品': '91',
  'Sports': '92', '体育': '92',
  'Supermarkets': '93', '超市': '93',
  'Textiles': '94', '纺织品': '94',
  'Think Tanks': '95', '智库': '95',
  'Information Technology and Services': '96', '信息技术与服务': '96', 'IT': '96',
  'Tobacco': '97', '烟草': '97',
  'Veterinary': '98', '兽医': '98',
  'Warehousing': '99', '仓储': '99',
  'E-Learning': '132', '在线教育': '132',
};

// LinkedIn 地点 URN 映射（常用地点）
// 同时保留中英文别名，方便不同语言参数传入
const LOCATION_URN_MAP = {
  'Singapore': 'urn:li:geo:102454443',
  '新加坡': 'urn:li:geo:102454443',
  'Malaysia': 'urn:li:geo:106808933',
  '马来西亚': 'urn:li:geo:106808933',
  'China': 'urn:li:geo:102890719',
  '中国': 'urn:li:geo:102890719',
  'Beijing': 'urn:li:geo:101451544',
  '北京': 'urn:li:geo:101451544',
  '北京市': 'urn:li:geo:101451544',
  'Shanghai': 'urn:li:geo:101808138',
  '上海': 'urn:li:geo:101808138',
  '上海市': 'urn:li:geo:101808138',
  'Shenzhen': 'urn:li:geo:105838025',
  '深圳': 'urn:li:geo:105838025',
  '深圳市': 'urn:li:geo:105838025',
  'Guangzhou': 'urn:li:geo:101880885',
  '广州': 'urn:li:geo:101880885',
  '广州市': 'urn:li:geo:101880885',
  'Hangzhou': 'urn:li:geo:101561400',
  '杭州': 'urn:li:geo:101561400',
  '杭州市': 'urn:li:geo:101561400',
  'Chengdu': 'urn:li:geo:102253303',
  '成都': 'urn:li:geo:102253303',
  '成都市': 'urn:li:geo:102253303',
  'Hong Kong': 'urn:li:geo:103291715',
  '香港': 'urn:li:geo:103291715',
  '香港特别行政区': 'urn:li:geo:103291715',
  'Taiwan': 'urn:li:geo:104187078',
  '台湾': 'urn:li:geo:104187078',
  'Japan': 'urn:li:geo:102097524',
  '日本': 'urn:li:geo:102097524',
  'Tokyo': 'urn:li:geo:101351801',
  '东京': 'urn:li:geo:101351801',
  'South Korea': 'urn:li:geo:105149562',
  '韩国': 'urn:li:geo:105149562',
  'Seoul': 'urn:li:geo:101624375',
  '首尔': 'urn:li:geo:101624375',
  'Thailand': 'urn:li:geo:102352552',
  '泰国': 'urn:li:geo:102352552',
  'Vietnam': 'urn:li:geo:104981869',
  '越南': 'urn:li:geo:104981869',
  'Indonesia': 'urn:li:geo:102478259',
  '印度尼西亚': 'urn:li:geo:102478259',
  'United States': 'urn:li:geo:103644278',
  'USA': 'urn:li:geo:103644278',
  '美国': 'urn:li:geo:103644278',
  'San Francisco': 'urn:li:geo:90000084',
  'San Francisco Bay Area': 'urn:li:geo:90000084',
  '旧金山': 'urn:li:geo:90000084',
  '旧金山湾区': 'urn:li:geo:90000084',
  'New York': 'urn:li:geo:102571732',
  'New York City': 'urn:li:geo:102571732',
  '纽约': 'urn:li:geo:102571732',
  '纽约市': 'urn:li:geo:102571732',
  'Los Angeles': 'urn:li:geo:102448103',
  '洛杉矶': 'urn:li:geo:102448103',
  'Seattle': 'urn:li:geo:101496800',
  '西雅图': 'urn:li:geo:101496800',
  'United Kingdom': 'urn:li:geo:101165590',
  'UK': 'urn:li:geo:101165590',
  '英国': 'urn:li:geo:101165590',
  'London': 'urn:li:geo:101165590',
  '伦敦': 'urn:li:geo:101165590',
  'Canada': 'urn:li:geo:101174742',
  '加拿大': 'urn:li:geo:101174742',
  'Toronto': 'urn:li:geo:101841133',
  '多伦多': 'urn:li:geo:101841133',
  'Vancouver': 'urn:li:geo:101410551',
  '温哥华': 'urn:li:geo:101410551',
  'Australia': 'urn:li:geo:101452733',
  '澳大利亚': 'urn:li:geo:101452733',
  'Sydney': 'urn:li:geo:104769905',
  '悉尼': 'urn:li:geo:104769905',
  'Melbourne': 'urn:li:geo:101966246',
  '墨尔本': 'urn:li:geo:101966246',
  'India': 'urn:li:geo:102713980',
  '印度': 'urn:li:geo:102713980',
  'Bangalore': 'urn:li:geo:107721540',
  '班加罗尔': 'urn:li:geo:107721540',
  'Netherlands': 'urn:li:geo:102890830',
  '荷兰': 'urn:li:geo:102890830',
  'Amsterdam': 'urn:li:geo:103366111',
  '阿姆斯特丹': 'urn:li:geo:103366111',
  'Germany': 'urn:li:geo:101282230',
  '德国': 'urn:li:geo:101282230',
  'Berlin': 'urn:li:geo:106967739',
  '柏林': 'urn:li:geo:106967739',
  'France': 'urn:li:geo:105015875',
  '法国': 'urn:li:geo:105015875',
  'Paris': 'urn:li:geo:105341343',
  '巴黎': 'urn:li:geo:105341343',
  'Switzerland': 'urn:li:geo:102690447',
  '瑞士': 'urn:li:geo:102690447',
  'Sweden': 'urn:li:geo:105117694',
  '瑞典': 'urn:li:geo:105117694',
  'Stockholm': 'urn:li:geo:105117694',
  '斯德哥尔摩': 'urn:li:geo:105117694',
  'Israel': 'urn:li:geo:101998814',
  '以色列': 'urn:li:geo:101998814',
  'Tel Aviv': 'urn:li:geo:104271618',
  '特拉维夫': 'urn:li:geo:104271618',
  'United Arab Emirates': 'urn:li:geo:104001434',
  'UAE': 'urn:li:geo:104001434',
  '阿联酋': 'urn:li:geo:104001434',
  'Dubai': 'urn:li:geo:104001434',
  '迪拜': 'urn:li:geo:104001434',
};

// 清理 LinkedIn 卡片文本中的噪音
function cleanLinkedInCardText(text) {
  if (!text) return '';

  // 0. 先把粘连的英文单词拆开（小写后紧跟大写，如 "GroningenGreater" → "Groningen Greater"）
  text = text.replace(/([a-z])([A-Z])/g, '$1 $2');

  // 1. 把英文操作按钮词和中文按钮词断开/移除，避免它们和职位/地点粘在一起
  text = text
    .replace(/Connect/g, ' ')
    .replace(/Follow/g, ' ')
    .replace(/Message/g, ' ')
    .replace(/加为好友/g, ' ')
    .replace(/发消息/g, ' ')
    .replace(/目前就职[:：]/g, ' ')
    .replace(/曾经就职[:：]/g, ' ')
    .replace(/摘要[:：]/g, ' ');

  // 1. 移除关注者信息（中英文）
  const followerMatch = text.match(/[\d,]+\s*(位关注者|followers?)/i);
  if (followerMatch) text = text.substring(0, followerMatch.index);

  // 2. 移除 mutual connection / 共同好友 及其前面的人名
  // 模式 A: "...Name is a mutual connection" / "...和其他 N 人是共同好友" / "... & N other mutual connections"
  const mutualPatterns = [
    /\s+\S+\s+is a mutual connection/i,
    /\s+和其他\s*\d*\s*人是共同好友/,
    /\s+\S+\s+是共同好友/,
    /\s+\S+\s+are mutual connections/i,
    // 整段人名列表 + "& N other mutual connections"
    /[^a-zA-Z]?[A-Z][a-zA-Z]+(?:\s+[a-zA-Z]+)*(?:\s*,\s*[A-Z][a-zA-Z]+(?:\s+[a-zA-Z]+)*)*\s*(?:&|and)\s*\d+\s+other\s+mutual\s+connections?.*$/i,
  ];
  for (const re of mutualPatterns) {
    const m = text.match(re);
    if (m && m.index > 0) {
      text = text.substring(0, m.index).trim();
      break;
    }
  }
  // 3. 兜底：直接找到 "mutual connection" 并截断其前面整个片段
  const mutualIdx = text.toLowerCase().indexOf('mutual connection');
  if (mutualIdx > 0) {
    let cutAt = mutualIdx;
    // 先跳过 "& 3 other" / "and 3 other" 等前缀
    for (let i = mutualIdx - 1; i >= 0; i--) {
      const slice = text.substring(i, mutualIdx).toLowerCase();
      if (/^\s*(?:&|and)\s*\d+\s+other\s*$/.test(slice)) {
        cutAt = i;
        break;
      }
    }
    // 再向前找人名列表开头（遇到非人名字符停止）
    let sawSeparator = false;
    for (let i = cutAt - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === ',' || ch === '&' || /[.!?:;。]/.test(ch)) {
        sawSeparator = true;
        continue;
      }
      if (sawSeparator && !/[a-zA-Z\s\-'.]/.test(ch)) {
        cutAt = i + 1;
        break;
      }
      if (i === 0) cutAt = 0;
    }
    text = text.substring(0, cutAt).trim();
  }

  // 4. 移除连续空白
  text = text.replace(/\s+/g, ' ').trim();

  return text.trim();
}

// 统一人脉度数：中文"2度/3度+"与英文"2nd/3rd+"都归一为英文规范值
function normalizeDegree(value) {
  if (!value) return '';
  const match = String(value).match(/(\d+)\s*(?:度|st|nd|rd|th)\s*(\+)?/i);
  if (!match) return String(value).trim();
  const num = parseInt(match[1], 10);
  const suffix = ['st', 'nd', 'rd'][num - 1] || 'th';
  return `${num}${suffix}${match[2] ? '+' : ''}`;
}

// 按请求数量截断结果：LinkedIn 首页常一次渲染整页（10 条），必须尊重 limit
function applyResultLimit(results, limit) {
  if (!Array.isArray(results)) return [];
  if (!Number.isFinite(limit) || limit <= 0) return results;
  return results.length > limit ? results.slice(0, limit) : results;
}

// 清掉职位尾部残留：悬空括号、粘在后面的行政区划片段、尾部分隔符
function cleanTitleNoise(title) {
  if (!title) return '';
  let out = String(title).trim();
  out = out.replace(/[（(]\s*$/, '').trim();
  out = out.replace(/(?<![A-Za-z.])[A-Za-z]+(?:\s+[A-Za-z]+){0,3}\s*(?:District|Region|County|Province)\s*,?\s*$/i, '').trim();
  out = out.replace(/[\s,·|/\\-]+$/, '').trim();
  return out;
}

// 解析LinkedIn姓名卡片文本（适配2024+新DOM结构，支持中英文界面）
function parseLinkedInNameCard(nameText) {
  if (!nameText) return { name: '', title: '', degree: '', location: '' };

  const cleaned = cleanLinkedInCardText(nameText);

  // 提取名字（• 之前的部分）
  let name = '';
  const dotIdx = cleaned.indexOf('•');
  if (dotIdx > 0) {
    name = cleaned.substring(0, dotIdx).trim();
  }

  // 去重：LinkedIn 有时把名字显示两遍，如 "Wayne Kovacs Wayne Kovacs"
  if (name) {
    const halfLen = Math.floor(name.length / 2);
    const firstHalf = name.substring(0, halfLen).trim();
    const secondHalf = name.substring(halfLen).trim();
    if (firstHalf && secondHalf.includes(firstHalf) || firstHalf.includes(secondHalf)) {
      name = firstHalf.length >= secondHalf.length ? firstHalf : secondHalf;
    }
  }

  // 提取度数：兼容中文"1度"和英文"1st/2nd/3rd/3rd+"
  let degree = '';
  const degreeMatch = cleaned.match(/(\d+)\s*(?:度|st|nd|rd)\+?/i);
  if (degreeMatch) {
    const num = degreeMatch[1];
    degree = cleaned.includes('度') ? `${num}度` : `${num}${['st','nd','rd'][Math.min(parseInt(num)-1,2)] || 'th'}`;
    if (cleaned.includes(`${num}rd+`) || cleaned.includes(`${num}度+`)) degree += '+';
  }

  // 提取地点：优先从 LOCATION_URN_MAP 匹配（现在含中英文别名）
  const locationKeywords = Object.keys(LOCATION_URN_MAP);
  let location = '';
  let locIdx = -1;
  for (const kw of locationKeywords) {
    const idx = cleaned.indexOf(kw);
    if (idx > 0 && (locIdx === -1 || idx < locIdx)) { locIdx = idx; location = kw; }
  }

  // 把 location 扩展成完整地点短语（如 The Hague, South Holland, Netherlands）
  if (location && locIdx > 0) {
    // 从 locIdx 往前找，把连续的 ", XXX" 或 " XXX" 片段也纳入地点
    let start = locIdx;
    const locationPrefixes = new Set(['South', 'North', 'East', 'West', 'New', 'Las', 'Los', 'San', 'Hong', 'Greater', 'Metropolitan']);
    const nonLocationWords = new Set(['Author', 'Researcher', 'Manager', 'Director', 'Engineer', 'Head', 'Teacher', 'Founder', 'CEO', 'CTO', 'President', 'Vice', 'Partner', 'Analyst', 'Consultant', 'Specialist', 'Coordinator', 'Administrator', 'Developer', 'Designer', 'Lead', 'Principal', 'Senior', 'Junior']);
    for (let i = locIdx - 1; i >= 0; i--) {
      const ch = cleaned[i];
      if (ch === ',' || ch === ' ') {
        // 继续往前看是否是一个单词
        let wordStart = i;
        while (wordStart > 0 && cleaned[wordStart - 1] !== ',' && cleaned[wordStart - 1] !== ' ') wordStart--;
        const segment = cleaned.substring(wordStart, i).trim();
        const isKnownGeo = LOCATION_URN_MAP[segment] || locationPrefixes.has(segment);
        const isDirectionPair = /^(South|North|East|West|New|Las|Los|San|Hong)\s[A-Z][a-zA-Z]+$/.test(segment);
        if ((isKnownGeo || isDirectionPair) && !nonLocationWords.has(segment)) {
          start = wordStart;
          continue;
        }
      }
      // 遇到非地点字符停止
      if (/[a-zA-Z]/.test(ch)) {
        // 如果前一个字符是小写字母，说明地点和职位连在一起了，停止
        if (ch === ch.toLowerCase()) break;
      }
      break;
    }
    if (start < locIdx) {
      location = cleaned.substring(start, locIdx + location.length).trim();
      locIdx = start;
    }
  }

  // 兜底：如果 LOCATION_URN_MAP 没命中，尝试匹配 "City, Region, Country" 模式
  // 或 "Greater Xxx" / "Xxx Metropolitan Area" / "Xxx Area" 等地点片段
  if (!location) {
    const locPatterns = [
      // 优先 LinkedIn 常见地点格式
      /(?:^|[^a-zA-Z])(Greater\s+[A-Z][a-zA-Z\s]+?\bArea)(?=\s|$)/,
      /(?:^|[^a-zA-Z])([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\s+(?:Metropolitan\s+)?Area)(?=\s|$)/,
      /([A-Z][a-zA-Z\s]+(?:,\s*[A-Z][a-zA-Z\s]+){1,2})(?=\s|$)/,
      /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\s+(?:Region|District|Country|City))(?=\s|$)/,
    ];
    for (const re of locPatterns) {
      const m = cleaned.match(re);
      if (m) {
        const candidate = m[1].trim();
        // 避免把职位/公司名误判为地点：地点通常在文本中后段；阈值放宽到 0.1，因为 LinkedIn 卡片里职位可能很长
        if (cleaned.endsWith(candidate) || cleaned.indexOf(candidate) > cleaned.length * 0.1) {
          location = candidate;
          locIdx = cleaned.indexOf(location);
          break;
        }
      }
    }
  }

  // 中国后面接城市/省份
  if (location === '中国' || location === 'China') {
    const after = cleaned.substring(locIdx + (location === 'China' ? 5 : 2));
    const cities = ['北京市', '上海市', '广州市', '深圳市', '杭州市', '成都市', '浙江省', '江苏省', '广东省', '福建省', '香港特别行政区', 'Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Hangzhou', 'Chengdu'];
    for (const city of cities) {
      if (after.startsWith(city) || after.startsWith(' ' + city)) {
        location = `中国 ${city}`;
        break;
      }
    }
  }

  // 提取职位（度数之后到地点之前）
  let title = '';
  if (degreeMatch && locIdx > 0) {
    const degEnd = cleaned.indexOf(degreeMatch[0]) + degreeMatch[0].length;
    title = cleaned.substring(degEnd, locIdx).trim().replace(/^[,|\s·]+/, '');
  } else if (degreeMatch) {
    const degEnd = cleaned.indexOf(degreeMatch[0]) + degreeMatch[0].length;
    title = cleaned.substring(degEnd).trim().replace(/^[,|\s·]+/, '');
  } else if (locIdx > 0) {
    // 没有度数时，名字之后到地点之前
    title = cleaned.substring(dotIdx + 1, locIdx).trim().replace(/^[,|\s·]+/, '');
  }

  // 如果 title 末尾还粘着地点，去掉它
  if (title && location) {
    const locIdxInTitle = title.lastIndexOf(location);
    if (locIdxInTitle > 0) {
      title = title.substring(0, locIdxInTitle).trim().replace(/[,\s·]+$/, '');
    }
    // 也尝试去掉地点前缀（如 The Hague, South Holland,）
    const locWithoutLast = location.replace(/,\s*[^,]+$/, '').trim();
    if (locWithoutLast && locWithoutLast !== location) {
      const idx2 = title.lastIndexOf(locWithoutLast);
      if (idx2 > 0) {
        title = title.substring(0, idx2).trim().replace(/[,\s·]+$/, '');
      }
    }
  }

  return { name, title: cleanTitleNoise(title), degree: normalizeDegree(degree), location };
}

/**
 * 在"全部筛选条件"面板中根据区域和标签文字勾选复选框
 * 使用 MouseEvent 模拟点击，兼容 React 自定义组件
 */
async function clickCheckboxByLabel(page, { sectionKeywords, labelValue, fieldName }) {
  if (!labelValue) return false;
  console.error(`\n${fieldName}: ${labelValue}`);

  const result = await page.evaluate(`(function() {
    var sectionKws = ${JSON.stringify(Array.isArray(sectionKeywords) ? sectionKeywords : [sectionKeywords])};
    var targetText = ${JSON.stringify(labelValue)};
    var targetNoSpace = targetText.replace(/\\s/g, '');

    var allEls = Array.from(document.querySelectorAll('*'));

    // 1. 找区域标题
    var sectionIdx = -1;
    for (var i = 0; i < allEls.length; i++) {
      var t = (allEls[i].textContent || '').trim();
      for (var j = 0; j < sectionKws.length; j++) {
        if (t === sectionKws[j] || t.indexOf(sectionKws[j]) >= 0) {
          sectionIdx = i;
          break;
        }
      }
      if (sectionIdx >= 0) break;
    }

    // 2. 在区域内搜索：先找文字匹配的元素，再在周围找 checkbox
    // 改进版：优先精确匹配，支持 checkbox/label 兄弟关系
    function findCheckbox(el) {
      if (!el) return null;

      // 1. 直接在当前元素内搜索
      var cb = el.querySelector('input[type="checkbox"]');
      if (cb) return cb;

      // 2. 检查兄弟元素（直接相邻的 input[type="checkbox"]）
      var prev = el.previousElementSibling;
      if (prev && prev.tagName.toLowerCase() === 'input' && prev.getAttribute('type') === 'checkbox') return prev;
      var next = el.nextElementSibling;
      if (next && next.tagName.toLowerCase() === 'input' && next.getAttribute('type') === 'checkbox') return next;

      // 3. 在父元素中找关联的 checkbox
      if (el.parentElement) {
        var parent = el.parentElement;

        // 3a. 如果当前元素是 label，找 for 属性对应的 checkbox
        if (el.tagName.toLowerCase() === 'label' && el.getAttribute('for')) {
          var forId = el.getAttribute('for');
          var targetCb = parent.querySelector('input[type="checkbox"][id="' + forId + '"], input[type="checkbox"]#' + forId);
          if (targetCb) return targetCb;
        }

        // 3b. 在兄弟元素中按距离找最近的 checkbox
        var siblings = Array.from(parent.children);
        var idx = siblings.indexOf(el);
        for (var offset = 1; offset < siblings.length; offset++) {
          if (idx - offset >= 0) {
            var sib = siblings[idx - offset];
            if (sib.tagName.toLowerCase() === 'input' && sib.getAttribute('type') === 'checkbox') return sib;
            var cbInSib = sib.querySelector('input[type="checkbox"]');
            if (cbInSib) return cbInSib;
          }
          if (idx + offset < siblings.length) {
            var sib = siblings[idx + offset];
            if (sib.tagName.toLowerCase() === 'input' && sib.getAttribute('type') === 'checkbox') return sib;
            var cbInSib = sib.querySelector('input[type="checkbox"]');
            if (cbInSib) return cbInSib;
          }
        }
      }

      // 4. 向上查找两层（兜底）
      if (el.parentElement && el.parentElement.parentElement) {
        cb = el.parentElement.parentElement.querySelector('input[type="checkbox"]');
        if (cb) return cb;
      }

      return null;
    }

    var candidates = [];
    for (var i = (sectionIdx >= 0 ? sectionIdx : 0); i < allEls.length; i++) {
      var el = allEls[i];
      var t = (el.textContent || '').trim().replace(/\\s+/g, ' ');
      var tNoSpace = t.replace(/\\s/g, '');
      var exact = false;
      var match = false;

      // 精确匹配优先级最高
      if (t === targetText || tNoSpace === targetNoSpace) {
        match = true;
        exact = true;
      } else if (t.indexOf(targetText) >= 0 && t.length <= targetText.length + 5) {
        // 部分匹配：要求文字长度接近目标（避免匹配到包含目标的父元素）
        match = true;
      } else if (tNoSpace.indexOf(targetNoSpace) >= 0 && tNoSpace.length <= targetNoSpace.length + 5) {
        match = true;
      }

      if (match) {
        var cb = findCheckbox(el);
        if (cb) {
          candidates.push({ cb: cb, text: t, idx: i, exact: exact, len: t.length });
        }
      }
    }

    if (candidates.length === 0) return JSON.stringify({ found: false, reason: 'no_match' });

    // 选择策略：优先精确匹配 > text 最短 > 区域标题后的第一个
    var chosen = candidates[0];
    if (sectionIdx >= 0) {
      var exactMatches = candidates.filter(function(c) { return c.exact && c.idx > sectionIdx; });
      if (exactMatches.length > 0) {
        // 在精确匹配中选 text 最短的
        chosen = exactMatches.reduce(function(best, curr) {
          return curr.len < best.len ? curr : best;
        });
      } else {
        // 没有精确匹配，选区域标题后 text 最短的
        var afterSection = candidates.filter(function(c) { return c.idx > sectionIdx; });
        if (afterSection.length > 0) {
          chosen = afterSection.reduce(function(best, curr) {
            return curr.len < best.len ? curr : best;
          });
        }
      }
    } else {
      // 无区域标题时，优先精确匹配，其次最短 text
      var exactAll = candidates.filter(function(c) { return c.exact; });
      if (exactAll.length > 0) {
        chosen = exactAll.reduce(function(best, curr) {
          return curr.len < best.len ? curr : best;
        });
      }
    }

    // 3. 模拟真实鼠标点击（触发 React 事件）
    var rect = chosen.cb.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    var mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    var mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    var click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    chosen.cb.dispatchEvent(mousedown);
    chosen.cb.dispatchEvent(mouseup);
    chosen.cb.dispatchEvent(click);

    return JSON.stringify({ found: true, text: chosen.text.substring(0, 40) });
  })()`);

  const r = JSON.parse(result);
  if (!r.found) {
    console.error(`  未找到: ${r.reason}`);
    return false;
  }
  console.error(`  已勾选: "${r.text}"`);
  await sleep(1000);
  return true;
}

/**
 * 在 LinkedIn 搜索页打开"全部筛选条件"面板，应用未解析到 URL 参数的 facet。
 * 当前只处理非 Consumer tier 下的 location/industry/language 未知项。
 */
async function applyFilters(page, unresolved = {}) {
  const filters = [];
  const filterConfigs = [];
  const { unknownLocations = [], unknownLanguages = [], unknownIndustries = [] } = unresolved;

  // 1. 地点筛选 — 只处理未解析到 geo ID 的（已解析的走 URL 参数）
  for (const item of unknownLocations) {
    filterConfigs.push({ sectionKeywords: ['地点', 'Location'], labelValue: item, fieldName: '地点', key: 'location' });
  }

  // 2. 行业筛选 — 只处理未映射到数字 ID 的（已映射的走 URL 参数）
  for (const item of unknownIndustries) {
    filterConfigs.push({ sectionKeywords: ['行业', 'Industry'], labelValue: item, fieldName: '行业', key: 'industry' });
  }

  // 3. 档案语言 — 只处理未映射到 ISO 码的（已映射的走 URL 参数）
  for (const item of unknownLanguages) {
    filterConfigs.push({ sectionKeywords: ['档案语言', '语言', 'Profile language'], labelValue: item, fieldName: '档案语言', key: 'language' });
  }

  if (filterConfigs.length === 0) return filters;

  // ========== 打开"全部筛选条件"面板 ==========
  console.error('\n打开"全部筛选条件"面板...');
  const panelOpened = await page.evaluate(`(function() {
    var keywords = ['全部筛选条件', 'All filters'];
    var all = Array.from(document.querySelectorAll('*'));
    for (var i = 0; i < all.length; i++) {
      var text = (all[i].textContent || '').trim().replace(/\\s+/g, ' ');
      for (var j = 0; j < keywords.length; j++) {
        if (text === keywords[j] || text.indexOf(keywords[j]) >= 0) {
          var el = all[i];
          for (var d = 0; d < 5; d++) {
            if (!el) break;
            var tag = el.tagName.toLowerCase();
            if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') {
              el.click();
              return JSON.stringify({ clicked: true, text: text, method: d === 0 ? 'direct' : 'ancestor' + d });
            }
            el = el.parentElement;
          }
        }
      }
    }
    return JSON.stringify({ clicked: false });
  })()`);
  const panelResult = JSON.parse(panelOpened);
  if (!panelResult.clicked) {
    console.error('  未找到"全部筛选条件"按钮');
    return filters;
  } else {
    console.error(`  面板已打开 (${panelResult.method || 'direct'}: "${panelResult.text}")`);
  }

  await sleep(3000);

  // ========== 滚动右侧筛选面板加载所有选项 ==========
  console.error('\n滚动面板...');
  for (var scrollRound = 0; scrollRound < 6; scrollRound++) {
    await page.evaluate(`(function() {
      var all = Array.from(document.querySelectorAll('*'));
      var bestPanel = null;
      var bestScore = 0;
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var rect = el.getBoundingClientRect();
        var style = window.getComputedStyle(el);
        if (rect.left > window.innerWidth * 0.5 && rect.height > 200) {
          var score = rect.height;
          if (style.position === 'fixed' || style.position === 'absolute') score += 1000;
          if (el.scrollHeight > el.clientHeight) score += 500;
          if (score > bestScore) { bestScore = score; bestPanel = el; }
        }
      }
      if (bestPanel) { bestPanel.scrollBy(0, 400); return 'scrolled'; }
      var aside = document.querySelector('aside');
      if (aside) { aside.scrollBy(0, 400); return 'aside'; }
      return 'none';
    })()`);
    await sleep(500);
  }
  await sleep(1000);

  // ========== 在面板中应用筛选 ==========
  for (const cfg of filterConfigs) {
    if (await clickCheckboxByLabel(page, cfg)) {
      filters.push(`${cfg.key}=${cfg.labelValue}`);
    }
  }

  // ========== 点击"显示结果" ==========
  console.error('\n点击"显示结果"...');
  const applied = await page.evaluate(`(function() {
    var texts = ['显示结果', 'Show results', 'Apply', 'Done'];
    var btns = Array.from(document.querySelectorAll('button, [role="button"], a'));
    for (var i = 0; i < btns.length; i++) {
      var t = btns[i].textContent.trim();
      for (var j = 0; j < texts.length; j++) {
        if (t === texts[j] || t.indexOf(texts[j]) >= 0) {
          btns[i].click();
          return JSON.stringify({ found: true, text: t, method: 'button' });
        }
      }
    }
    var all = Array.from(document.querySelectorAll('*'));
    for (var i = 0; i < all.length; i++) {
      var t = (all[i].textContent || '').trim();
      for (var j = 0; j < texts.length; j++) {
        if (t === texts[j] || t.indexOf(texts[j]) >= 0) {
          var el = all[i];
          for (var d = 0; d < 5; d++) {
            if (!el) break;
            var tag = el.tagName.toLowerCase();
            if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') {
              el.click();
              return JSON.stringify({ found: true, text: t, method: 'ancestor' + d });
            }
            el = el.parentElement;
          }
        }
      }
    }
    return JSON.stringify({ found: false });
  })()`);
  var applyResult = JSON.parse(applied);
  if (applyResult.found) {
    console.error(`  已应用 (${applyResult.method}: "${applyResult.text}")`);
    await sleep(3000);
  } else {
    console.error('  未找到应用按钮');
  }

  if (filters.length > 0) {
    console.error(`  ✓ 已应用筛选: ${filters.join(', ')}`);
  }

  return filters;
}

// ========== 纯工具函数（便于单元测试） ==========

function isConsumerTier(tier) {
  return ['free', 'premium_career', 'premium_business'].includes(normalizeTier(tier) || 'free');
}

function parseNumericIds(value) {
  if (!value) return [];
  return value.split(',').map(s => s.trim()).filter(Boolean).filter(s => /^\d+$/.test(s));
}

function buildEnhancedKeyword(keyword, { location = '', industry = '', language = '' } = {}, tier) {
  if (!isConsumerTier(tier)) return keyword;
  const parts = [keyword];
  if (location) parts.push(...location.split(',').map(s => s.trim()).filter(Boolean));
  if (industry) parts.push(...industry.split(',').map(s => s.trim()).filter(Boolean));
  if (language) parts.push(...language.split(',').map(s => s.trim()).filter(Boolean));
  return parts.filter(Boolean).join(' ');
}

// 组装 scout 结果 meta：searchParams.limit 记录钳制后的实际值，
// requestedLimit 保留用户原始请求；pagesViewed 仅记录实际读取页数，滚动另计。
function buildScoutMeta({ searchParams, requestedLimit, pagesViewed, tier }) {
  return {
    platform: 'linkedin',
    source: 'linkedin-scout',
    searchParams,
    requestedLimit,
    pagesViewed,
    collectedAt: new Date().toISOString(),
    accountTier: tier,
  };
}

cli({
  site: 'hunter-linkedin',
  name: 'scout',
  validateArgs: validateOrdinaryFilters,
  navigateBefore: false, // This adapter owns its search navigation; avoid an extra home visit.
  access: 'write',
  description: 'LinkedIn 增强人才搜索：补充 opencli people-search 不支持的 faceted filters（地点/人脉/公司/学校/行业/语言）。只输出统一 schema 的 JSON，不评估、不打标签、不生成报告。',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', required: true, description: '搜索关键词（职位/技能/职称）' },
    { name: 'location', type: 'string', default: '', description: '地点筛选，逗号分隔多选。Consumer 账号下会作为关键词增强拼入搜索词' },
    { name: 'connection', type: 'string', default: '', description: '人脉关系筛选：1st（一度）/ 2nd（二度）/ 3rd（三度），多个用逗号分隔' },
    { name: 'currentCompany', type: 'string', default: '', description: '目前就职公司筛选，逗号分隔多选。只接受 LinkedIn 公司数字 ID（如 1234567），不接受公司名称' },
    { name: 'pastCompany', type: 'string', default: '', description: '曾经就职公司筛选，逗号分隔多选。只接受 LinkedIn 公司数字 ID' },
    { name: 'school', type: 'string', default: '', description: '学校筛选，逗号分隔多选。只接受 LinkedIn 学校数字 ID' },
    { name: 'industry', type: 'string', default: '', description: '所属行业筛选，逗号分隔多选。Consumer 账号下会作为关键词增强拼入搜索词' },
    { name: 'language', type: 'string', default: '', description: '档案语言筛选，逗号分隔多选。Consumer 账号下会作为关键词增强拼入搜索词' },
    { name: 'limit', type: 'int', default: 20, help: '累计唯一列表人数目标（1–2500）；默认任务覆盖量由Skill提供。平台限制另行返回。' },
    { name: 'maxPages', type: 'int', required: false, help: '本次最多读取的真实页数（1–250），达到后返回续读游标；省略时按limit和平台终点停止' },
    { name: 'cursor', type: 'string', required: false, help: '上次返回的本地续读文件；须同账号、同查询，limit为新的累计目标' },
    { name: 'anonymousPolicy', type: 'string', default: 'stop', help: '确认不可见身份卡片（如 LinkedIn Member）的处理策略：stop=保留具名结果后停止并诊断；continue=保留具名结果并继续后续页' },
    { name: 'output', type: 'string', default: '', description: '输出 JSON 文件路径。默认保存到 ~/.hunter/channels/linkedin/linkedin-scout-result.json' },
    { name: 'skipTierCheck', type: 'boolean', default: true, description: '跳过 LinkedIn 账号档位与实际会话的校验（默认跳过，可用 --skipTierCheck false 开启）' },
  ],
  func: async (page, kwargs) => {
    validateOrdinaryFilters(kwargs);
    const { keyword, location, connection, currentCompany, pastCompany, school, industry, language } = kwargs;
    let limit = kwargs.limit;
    const requestedLimit = kwargs.limit;

    const linkedinTier = getLinkedInTier();
    const consumerTier = isConsumerTier(linkedinTier);
    const tierCfg = getTierConfig(linkedinTier);

    const outputPath = kwargs.output || SCOUT_RESULT_FILE;

    console.error('='.repeat(60));
    console.error('🎯 LinkedIn 增强人才搜索');
    console.error('='.repeat(60));
    console.error(`账号档位: ${tierCfg.label} | 关键词: ${keyword} | 地点: ${location || '不限'} | 数量: ${limit}`);
    if (connection) console.error(`人脉: ${connection}`);
    if (currentCompany) console.error(`目前公司: ${currentCompany}`);
    if (pastCompany) console.error(`曾经公司: ${pastCompany}`);
    if (school) console.error(`学校: ${school}`);
    if (industry) console.error(`行业: ${industry}`);

    if(kwargs.maxPages!==undefined&&(!Number.isInteger(kwargs.maxPages)||kwargs.maxPages<1||kwargs.maxPages>250))throw Object.assign(new Error('invalid_page_limit'),{code:'invalid_page_limit'});
    if(!Number.isInteger(limit)||limit<1||limit>2500)throw Object.assign(new Error('invalid_search_limit'),{code:'invalid_search_limit'});
    if(tierCfg.maxResultsPerSearch&&limit>tierCfg.maxResultsPerSearch)console.error(`ℹ️ 旧档位参考值${tierCfg.maxResultsPerSearch}不是官方额度，本轮按明确limit=${limit}执行；平台实际限制会返回。`);

    if (!kwargs.skipTierCheck) {
      const v = await validateTier(page, linkedinTier);
      if (v.severity === 'error') {
        console.error(`\n❌ ${v.mismatchReason}`);
        return { success: false, error: 'tier_mismatch', details: v };
      }
      if (v.severity === 'warning') {
        console.error(`\n⚠️  ${v.mismatchReason}`);
        if (!v.verified) return {success:false,error:'tier_unconfirmed',details:v};
      }
    }

    // ========== 公司/学校 ID 参数（只接受数字 ID） ==========
    // 公司名称/学校名称解析已移除，避免跳转公司页/学校页；如需名称对应的 ID，先用 linkedin-company-id-lookup 查询
    const currentCompanyIds = parseNumericIds(currentCompany);
    if (currentCompany && currentCompanyIds.length === 0) {
      throw Object.assign(new Error('invalid_currentCompany_ids'),{code:'invalid_currentCompany_ids'});
    } else if (currentCompanyIds.length > 0) {
      console.error(`  ✓ 目前就职公司 ID: ${currentCompanyIds.join(', ')}`);
    }

    const pastCompanyIds = parseNumericIds(pastCompany);
    if (pastCompany && pastCompanyIds.length === 0) {
      throw Object.assign(new Error('invalid_pastCompany_ids'),{code:'invalid_pastCompany_ids'});
    } else if (pastCompanyIds.length > 0) {
      console.error(`  ✓ 曾经就职公司 ID: ${pastCompanyIds.join(', ')}`);
    }

    // ========== 自学习缓存：解析地点 geo ID ==========
    initGeoCache();
    const geoCache = getGeoCache();
    let geoIds = [];
    let unknownLocations = [];

    if (location) {
      const locItems = location.split(',').map(s => s.trim()).filter(Boolean);
      for (const item of locItems) {
        const geoId = geoCache[item];
        if (geoId) {
          geoIds.push(geoId);
        } else {
          unknownLocations.push(item);
        }
      }
      if (geoIds.length > 0 && !consumerTier) console.error(`  📍 已解析地点: ${geoIds.join(', ')}`);
      if (geoIds.length > 0 && consumerTier) console.error(`  📍 地点已加入关键词增强`);
      if (unknownLocations.length > 0 && !consumerTier) console.error(`  ⏳ 地点将走 facet: ${unknownLocations.join(', ')}`);
      if (unknownLocations.length > 0 && consumerTier) console.error(`  📝 未知地点已加入关键词增强: ${unknownLocations.join(', ')}`);
    }

    const schoolIds = parseNumericIds(school);
    if (school && schoolIds.length === 0) {
      throw Object.assign(new Error('invalid_school_ids'),{code:'invalid_school_ids'});
    } else if (schoolIds.length > 0) {
      console.error(`  ✓ 学校 ID: ${schoolIds.join(', ')}`);
    }

    // 档案语言筛选加入URL
    let languageCodes = [];
    let unknownLanguages = [];
    if (language) {
      const langItems = language.split(',').map(s => s.trim()).filter(Boolean);
      for (const item of langItems) {
        const code = LANGUAGE_CODE_MAP[item];
        if (code) {
          languageCodes.push(code);
        } else {
          unknownLanguages.push(item);
        }
      }
      if (languageCodes.length > 0 && !consumerTier) console.error(`  🌐 已解析语言: ${languageCodes.join(', ')}`);
      if (languageCodes.length > 0 && consumerTier) console.error(`  🌐 语言已加入关键词增强`);
    }

    // 行业筛选加入URL
    let industryIds = [];
    let unknownIndustries = [];
    if (industry) {
      const industryItems = industry.split(',').map(s => s.trim()).filter(Boolean);
      for (const item of industryItems) {
        // 允许直接传数字 ID（如 3200）
        if (/^\d+$/.test(item)) {
          industryIds.push(item);
          continue;
        }
        const id = INDUSTRY_ID_MAP[item];
        if (id) {
          industryIds.push(id);
        } else {
          unknownIndustries.push(item);
        }
      }
      if (industryIds.length > 0 && !consumerTier) console.error(`  🏭 已解析行业: ${industryIds.join(', ')}`);
      if (industryIds.length > 0 && consumerTier) console.error(`  🏭 行业已加入关键词增强`);
      if (unknownIndustries.length > 0 && !consumerTier) console.error(`  ⏳ 行业将走 facet: ${unknownIndustries.join(', ')}`);
      if (unknownIndustries.length > 0 && consumerTier) console.error(`  📝 未知行业已加入关键词增强: ${unknownIndustries.join(', ')}`);
    }

    // 构建增强关键词：Free/Consumer 账号下，LinkedIn 的 faceted URL 参数（geoUrn/industry/profileLanguage）
    // 效果不稳定，把地点/行业/语言拼进关键词能显著提升结果相关性
    const enhancedKeyword = buildEnhancedKeyword(keyword, { location, industry, language }, linkedinTier);
    if (enhancedKeyword !== keyword) {
      console.error(`  📝 关键词增强: "${enhancedKeyword}"`);
    }

    // 构建搜索URL（linkedin-scout 固定使用消费者路径；SN/Recruiter 请使用对应专属命令）
    const searchUrl = getPeopleSearchUrl(linkedinTier, {
      keyword: enhancedKeyword,
      connection,
      currentCompanyIds,
      pastCompanyIds,
      // Consumer 账号下 geo/industry/language 走关键词 fallback，不传 faceted URL 参数
      geoIds: consumerTier ? [] : geoIds,
      schoolIds,
      languageCodes: consumerTier ? [] : languageCodes,
      industryIds: consumerTier ? [] : industryIds,
      forceConsumer: true,
    });
    console.error(`\n🔍 搜索URL: ${searchUrl}`);

    const cookies=await page.getCookies({url:'https://www.linkedin.com'});
    const binding=sessionBinding(cookies);
    const anonymousPolicy=kwargs.anonymousPolicy??'stop';
    const requestParams={searchUrl,keyword,location:location??'',connection:connection??'',currentCompany:currentCompany??'',pastCompany:pastCompany??'',school:school??'',industry:industry??'',language:language??'',anonymousPolicy};
    const requestKey=requestFingerprint(requestParams);
    const previous=kwargs.cursor?readSearchCursor(kwargs.cursor,{binding,requestKey}):undefined;
    let baseUrl=previous?.base_url??searchUrl;
    let uiResolved=previous?.ui_resolved??[];
    const initialStarted=performance.now();
    if(!previous){
      await page.goto(searchUrl,{waitUntil:'domcontentloaded',timeout:60000});
      const hasResolvablePanelFilters=!consumerTier&&(unknownLocations.length||unknownLanguages.length||unknownIndustries.length);
      if(hasResolvablePanelFilters){
        // Existing uncommon facet resolution remains scoped to the original query.
        const initial=await page.evaluate(inspectOrdinarySearchDOM);
        if(initial.login||initial.verification||initial.blocked)throw Object.assign(new Error('search_blocked'),{code:'search_blocked'});
        uiResolved=await applyFilters(page,{unknownLocations,unknownLanguages,unknownIndustries});
        const required=[...unknownLocations.map(v=>'location='+v),...unknownIndustries.map(v=>'industry='+v),...unknownLanguages.map(v=>'language='+v)];
        if(required.some(v=>!uiResolved.includes(v)))throw Object.assign(new Error('filter_not_applied'),{code:'filter_not_applied'});
        baseUrl=await page.evaluate('window.location.href');
      }
    }
    const filterContract=ordinaryFilterContract(kwargs,{consumer:consumerTier,searchUrl:baseUrl,uiResolved});
    let pageCheckpoint=null;
    const collection=await collectOrdinarySearch({
      searchUrl:baseUrl,limit,maxPages:kwargs.maxPages,previous,anonymousPolicy,
      onCheckpoint:progress=>{pageCheckpoint=writeSearchCursor({directory:path.join(CONFIG_DIR,'search-cursors'),binding,requestKey,progress:{...progress,base_url:baseUrl,ui_resolved:uiResolved}});publishSearchCheckpoint(process.env.HUNTER_SEARCH_CHECKPOINT_DIR,pageCheckpoint,progress);},
      read:()=>page.evaluate(inspectOrdinarySearchDOM),
      navigate:url=>page.goto(url,{waitUntil:'domcontentloaded',timeout:60000}),
      scroll:()=>page.evaluate(scrollOrdinarySearchDOM),
    });
    collection.timing.operation_ms=performance.now()-initialStarted;
    collection.timing.initial_setup_ms=collection.timing.operation_ms-collection.timing.total_ms;
    let cursor=null;
    if(collection.resume){
      try{cursor=writeSearchCursor({directory:path.join(CONFIG_DIR,'search-cursors'),binding,requestKey,progress:{...collection.resume,base_url:baseUrl,ui_resolved:uiResolved}});}
      catch{collection.interruption={code:'checkpoint_write_failed'};collection.stop_reason='checkpoint_write_failed';}
    }
    let allResults=collection.results.map(r=>{const parsed=parseLinkedInNameCard(r.rawName);return {...r,name:parsed.name,title:parsed.title,location:parsed.location,connectionDegree:parsed.degree,headline:parsed.title};});
    const beforeClientFilter=allResults.length;
    if(unknownLocations.length>0)allResults=allResults.filter(r=>!r.location||unknownLocations.some(loc=>r.location.includes(loc)));

    // 清理地点噪音
    allResults.forEach(r => {
      if (r.location) {
        r.location = r.location
          .replace(/发消息.*$/, '')
          .replace(/目前就职.*$/, '')
          .replace(/\+$/, '')
          .trim();
      }
    });

    // 首页常常一次性返回整页结果，超出请求上限时按请求数量截断
    const limited = applyResultLimit(allResults, limit);
    if (limited.length !== allResults.length) {
      console.error(`  ✂️ 请求 ${limit} 人、实际收集 ${allResults.length} 人，已截断为 ${limit} 人`);
      allResults = limited;
    }

    // 统一 schema 输出
    const previousIds=new Set((previous?.results??[]).map(row=>row.profileId));
    const result = {
      meta: buildScoutMeta({
        searchParams: { keyword, location, connection, currentCompany, pastCompany, school, industry, language, limit, anonymousPolicy },
        requestedLimit,
        pagesViewed: collection.pages_viewed,
        tier: linkedinTier,
      }),
      filter_contract:filterContract,
      filter_observations:collection.filter_observations,
      page_observations:collection.page_observations,
      identity_summary:collection.identity_summary,
      operation:'ordinary-people-search',
      query_fingerprint:collection.query_fingerprint,
      returned_count: allResults.length,
      new_count: allResults.filter(row=>!previousIds.has(row.profileId)).length,
      completeness: collection.completeness,
      truncated: collection.truncated,
      stop_reason: collection.stop_reason,
      cursor,
      recovery_checkpoint:pageCheckpoint,
      interruption: collection.interruption,
      pagination:{pages_viewed:collection.pages_viewed,scroll_rounds:collection.scroll_rounds,total_text:null},
      timing:collection.timing,
      list_coverage:{unique_collected:beforeClientFilter,new_unique_collected:collection.new_count,client_filtered_out:beforeClientFilter-allResults.length},
      candidates: allResults.map((c, i) => ({
        rank: i + 1,
        profileId: c.profileId,
        name: c.name,
        headline: c.headline || c.title || '',
        title: c.title || '',
        location: c.location || '',
        connectionDegree: normalizeDegree(c.connectionDegree),
        profileUrl: c.profileUrl || '',
        channel: 'linkedin',
      })),
    };

    ensureConfigDir();
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.error(`\n💾 结果已保存: ${outputPath}`);
    console.error(`📊 共收集 ${result.candidates.length} 个候选人`);

    return result;
  }
});

export const __test__ = {
  isConsumerTier,
  parseNumericIds,
  buildEnhancedKeyword,
  buildScoutMeta,
  normalizeDegree,
  cleanTitleNoise,
  parseLinkedInNameCard,
  applyResultLimit,
};
