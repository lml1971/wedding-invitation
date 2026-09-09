/**
 * 婚礼请帖 Cloudflare Worker
 * ============================
 * 功能：请帖展示、后台管理、宾客管理、一对一专属链接、统计
 * 
 * ================== 可配置部分 ==================
 * 以下 DEFAULT_CONFIG 中的值在首次部署时写入 KV，
 * 之后通过管理后台修改，无需改代码重新部署。
 * 
 * 【CF文件库地址】 https://wj.lmlcyp.ccwu.cc/
 *   - 背景图：在后台填入完整URL，如 https://wj.lmlcyp.ccwu.cc/JPG/your-photo.jpg
 *   - 背景音乐：在后台填入完整URL，如 https://wj.lmlcyp.ccwu.cc/mp3/your-music.mp3
 * 
 * 【管理密码】 修改 ADMIN_PASSWORD 环境变量（在 wrangler.toml 或 CF 仪表盘设置）
 * 
 * 【统计API】 在后台"统计API地址"中配置
 * 
 * 【文案内容】 在后台"文案编辑"中修改新郎新娘姓名、日期、地点等
 * =================================================
 */

// ================== 默认配置（首次部署写入KV，后续通过后台修改） ==================
const DEFAULT_CONFIG = {
  // --- 基础信息 ---
  groomName: '李瀚伟',           // 【可配置】新郎姓名
  brideName: '高秋月',           // 【可配置】新娘姓名
  fatherName: '李茂林',              // 【可配置】新郎父亲姓名
  motherName: '崔玉平',              // 【可配置】新郎母亲姓名
  weddingDate: '2026-09-29',   // 【可配置】婚礼日期 YYYY-MM-DD
  weddingTime: '12:00',        // 【可配置】婚礼时间 HH:MM
  lunarDate: '',               // 【可配置】农历日期（留空则自动从公历计算）
  venue: '鑫禧堂礼宴中心',       // 【可配置】婚礼地点/酒店名称
  venueHall: '水晶主题厅',      // 【可配置】宴会厅名称
  address: '忻府区开发区梨花街以南、同德路以西综合楼',  // 【可配置】详细地址
  venueDesc: '',               // 【可配置】场地描述
  navKeyword: '鑫禧堂礼宴中心',  // 【可配置】地图导航搜索关键词
  navUrl: 'https://surl.amap.com/fOExV1w103jX',  // 【可配置】导航短链接（高德短链接，后台可修改）

  // --- CF文件库资源 ---
  // 【可配置】背景图URL（从CF文件库调用，留空则使用默认渐变背景）
  bgImage: '',
  // 【可配置】背景音乐URL（从CF文件库调用，留空则不显示音乐按钮）
  bgMusic: '',
  // 【可配置】分享LOGO图片（base64编码或URL，留空使用默认囍字LOGO）
  logoImage: '',

  // --- 统计API ---
  // 【可配置】统计表格API地址（留空则使用内置统计）
  statsApi: '',

  // --- 模板/主题 ---
  template: 'classic',  // 【可配置】可选: classic | elegant | modern

  // --- 功能开关 ---
  features: {
    music: true,        // 【可配置】背景音乐开关
    bgImage: true,      // 【可配置】背景图开关
    countdown: true,   // 【可配置】倒计时开关
    rsvp: true,         // 【可配置】RSVP回执开关
    stats: true,        // 【可配置】统计功能开关
    story: true,        // 【可配置】爱情故事开关
    events: true,       // 【可配置】婚礼流程开关
    petals: true,       // 【可配置】花瓣飘落动画
    lanterns: true,    // 【可配置】灯笼装饰
  },

  // --- 文案 ---
  text: {
    title: '婚礼邀请',            // 【可配置】请帖标题
    invitation: '诚挚邀请',      // 【可配置】邀请语
    intro: '诚邀您参加我们的婚礼，共同见证幸福时刻',  // 【可配置】介绍文案
    ending: '期待您的到来',      // 【可配置】结尾文案
    quote: '愿有岁月可回首，且以深情共白头',  // 【可配置】浪漫诗句
    poem: '执子之手，与子偕老',  // 【可配置】诗句
    invitationText: '',          // 【可配置】正式邀请信（留空使用默认模板）
  },

  // --- 爱情故事（多章节） ---
  story: [
    { title: '初遇', content: '在街角的咖啡店，一杯热拿铁遇见了一杯蜂蜜柚子茶。' },
    { title: '相伴', content: '清晨的粥比闹钟先醒，傍晚的风带着晚霞回家。' },
    { title: '相守', content: '从深圳湾的月光，到忻州城的红毯，两人一屋，三餐四季。' },
  ],

  // --- 婚礼流程 ---
  events: [
    { title: '婚礼仪式', time: '11:30', desc: '结婚典礼正式开始' },
    { title: '喜宴', time: '12:00', desc: '宴席开始，恭候入席' },
  ],
};

// ================== 农历转换算法（内置，不依赖外部API） ==================

// 农历数据表：1900-2100年，每年用十六进制编码
// 每位含义：1-4位=闰月月份(0=无闰月)，5-16位=每月大小月(1=30天,0=29天)，17位=闰月大小(1=30天,0=29天)
const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x0a930,0x05592, // 1900-1909
  0x09630,0x0a9b0,0x0ab50,0x04b60,0x0aa50,0x0a500,0x0a520,0x0a050,0x062a0,0x068d0, // 1910-1919
  0x072d0,0x08650,0x08670,0x0c550,0x09650,0x055a0,0x092d0,0x0a930,0x0c570,0x0a950, // 1920-1929
  0x0b5a0,0x0a6d0,0x0a570,0x096d0,0x0aa50,0x0b5a0,0x04650,0x0a550,0x1d2a0,0x1b550, // 1930-1939
  0x0a6a0,0x0a5d0,0x0a5b0,0x0a6a0,0x0a9b0,0x0aa50,0x0b2a0,0x1d5b0,0x1b2b0,0x0a930, // 1940-1949
  0x0b550,0x0a570,0x0a4a0,0x0aa50,0x1b255,0x06d30,0x0ada0,0x14b63,0x09370,0x049f8, // 1950-1959
  0x04970,0x064b0,0x16a50,0x0ed25,0x083b0,0x04970,0x05650,0x16570,0x0d4a0,0x0ea50, // 1960-1969
  0x06e35,0x0aa55,0x0a630,0x046d0,0x0a8d0,0x0ab50,0x04b50,0x0a950,0x04b50,0x1b275, // 1970-1979
  0x06a30,0x06d30,0x0af40,0x0ab50,0x04630,0x07a30,0x0aa50,0x0b550,0x19250,0x0b550, // 1980-1989
  0x0a930,0x06a30,0x0ab50,0x04bb0,0x0a870,0x0a930,0x0a4d0,0x0a970,0x0a450,0x0b270, // 1990-1999
  0x06d30,0x0af50,0x0ab60,0x09370,0x04af0,0x0a6b0,0x0a570,0x05370,0x0a9b0,0x04970, // 2000-2009
  0x064b0,0x0a570,0x16550,0x05270,0x0a930,0x0a4a0,0x0aa50,0x1b275,0x06d30,0x0ada0, // 2010-2019
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x16a50,0x0ed25,0x083b0,0x04970,0x05650, // 2020-2029
  0x16570,0x0d4a0,0x0ea50,0x16a90,0x0aad5,0x052a0,0x0a6d0,0x0ab50,0x04b60,0x0a550, // 2030-2039
  0x0a540,0x0a6d0,0x0a930,0x0aa50,0x1b2b0,0x068d0,0x0a950,0x04b50,0x0a520,0x0a5d0, // 2040-2049
  0x0b5a0,0x0a6d0,0x0a570,0x056d0,0x0aa50,0x0b5a0,0x04650,0x0a550,0x1d2a0,0x1b550, // 2050-2059
  0x0a6a0,0x0a5d0,0x0a5b0,0x0a6a0,0x0a9b0,0x0aa50,0x0b2a0,0x1d5b0,0x1b2b0,0x0a930, // 2060-2069
  0x0b550,0x0a570,0x0a4a0,0x0aa50,0x1b255,0x06d30,0x0ada0,0x14b63,0x09370,0x049f8, // 2070-2079
  0x04970,0x064b0,0x16a50,0x0ed25,0x083b0,0x04970,0x05650,0x16570,0x0d4a0,0x0ea50, // 2080-2089
  0x06e35,0x0aa55,0x0a630,0x046d0,0x0a8d0,0x0ab50,0x04b50,0x0a950,0x04b50,0x1b275, // 2090-2099
  0x06a30,0x06d30,0x0af40,0x0ab50,0x04630,0x07a30,0x0aa50,0x0b550,0x19250,0x0b550, // 2100-2109
];

// 天干地支
const TIAN_GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const DI_ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const SHENG_XIAO = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];

// 农历月名（正月至腊月）
const LUNAR_MONTHS = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
const LUNAR_DAYS = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
  '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

/** 获取农历某年的总天数 */
function lunarYearDays(year) {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += (LUNAR_INFO[year - 1900] & i) ? 1 : 0;
  }
  return sum + leapDays(year);
}

/** 闰月天数 */
function leapDays(year) {
  if (leapMonth(year)) {
    return (LUNAR_INFO[year - 1900] & 0x10000) ? 30 : 29;
  }
  return 0;
}

/** 闰月月份（0=无闰月） */
function leapMonth(year) {
  return LUNAR_INFO[year - 1900] & 0xf;
}

/** 某月天数（非闰月） */
function monthDays(year, month) {
  return (LUNAR_INFO[year - 1900] & (0x10000 >> month)) ? 30 : 29;
}

/**
 * 公历转农历
 * @param {number} year - 公历年
 * @param {number} month - 公历月 1-12
 * @param {number} day - 公历日
 * @returns {{lunarYear, lunarMonth, lunarDay, isLeap, yearGanZhi, monthName, dayName, animal}}
 */
function solar2lunar(year, month, day) {
  // 基准日期：1900-01-31 = 农历1900年正月初一
  let offset = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(1900, 0, 31)) / 86400000);
  let lunarYear = 1900;
  let temp = 0;

  // 计算年
  for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) {
    temp = lunarYearDays(lunarYear);
    offset -= temp;
  }
  if (offset < 0) {
    offset += temp;
    lunarYear--;
  }

  // 计算月
  let leap = leapMonth(lunarYear);
  let isLeap = false;
  let lunarMonth = 1;
  let daysInMonth = 0;

  for (lunarMonth = 1; lunarMonth < 13 && offset >= 0; lunarMonth++) {
    if (leap > 0 && lunarMonth === leap + 1 && !isLeap) {
      lunarMonth--;
      isLeap = true;
      daysInMonth = leapDays(lunarYear);
    } else {
      daysInMonth = monthDays(lunarYear, lunarMonth - 1);
    }
    offset -= daysInMonth;
    if (isLeap && lunarMonth === leap + 1) isLeap = false;
  }

  if (offset < 0) {
    offset += daysInMonth;
    lunarMonth--;
  }

  let lunarDay = offset + 1;

  // 天干地支年
  let ganZhiYear = TIAN_GAN[(lunarYear - 4) % 10] + DI_ZHI[(lunarYear - 4) % 12];
  let animal = SHENG_XIAO[(lunarYear - 4) % 12];

  // 月名
  let monthName = (isLeap ? '闰' : '') + LUNAR_MONTHS[lunarMonth - 1] + '月';
  // 日名
  let dayName = LUNAR_DAYS[lunarDay - 1];

  return {
    lunarYear: lunarYear,
    lunarMonth: lunarMonth,
    lunarDay: lunarDay,
    isLeap: isLeap,
    yearGanZhi: ganZhiYear,
    animal: animal,
    monthName: monthName,
    dayName: dayName,
  };
}

/**
 * 公历日期字符串转农历显示文本
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} 如 "农历丙午年八月十六" 或 "" 如果无效
 */
function solar2lunarStr(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  const y = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  const d = parseInt(parts[2]);
  if (!y || !m || !d) return '';
  if (y < 1901 || y > 2100) return '';
  try {
    const lunar = solar2lunar(y, m, d);
    return `农历${lunar.yearGanZhi}年${lunar.monthName}${lunar.dayName}`;
  } catch (e) {
    return '';
  }
}

// ================== 工具函数 ==================

/** 生成随机ID */
function genId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/** 简单的 session token */
function genToken() {
  return genId() + genId();
}

/** 验证管理员密码（异步，需 await） */
async function checkAuth(request, env) {
  const token = request.headers.get('X-Auth-Token') || '';
  if (!token) return false;
  const value = await env.WEDDING_KV.get(`session:${token}`);
  return value === 'valid';
}

/** JSON 响应 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    },
  });
}

/** HTML 响应 */
function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });
}

/** 处理 CORS 预检 */
function handleCORS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    },
  });
}

// ================== 页面：请帖展示（喜庆红金风格） ==================
function getInvitationPage(config, guest, requestUrl) {
  const guestName = guest ? guest.name : '';
  const guestId = guest ? guest.id : '';
  const features = config.features || {};

  // 构造分享 LOGO 的绝对 URL
  const baseUrl = requestUrl ? new URL(requestUrl).origin : '';
  const logoUrl = baseUrl + '/img/logo';

  // 分享标题和描述
  const shareTitle = guestName
    ? `${config.groomName} & ${config.brideName}的婚礼邀请函 - 致${guestName}`
    : `${config.groomName} & ${config.brideName}的婚礼邀请函`;
  const shareDesc = config.text.intro || `诚挚邀请您参加${config.groomName}与${config.brideName}的婚礼`;

  // 主题配色
  const themes = {
    classic: { primary: '#c41e3a', gold: '#d4af37', light: '#fff8e7', dark: '#8b0000' },
    elegant: { primary: '#8b0000', gold: '#c5a050', light: '#faf5e6', dark: '#5c0000' },
    modern: { primary: '#e8335c', gold: '#f0c75e', light: '#fff5f5', dark: '#a01030' },
  };
  const tc = themes[config.template] || themes.classic;

  // 背景样式
  const bgStyle = features.bgImage && config.bgImage
    ? `background: linear-gradient(rgba(139,0,0,0.5), rgba(196,30,58,0.4)), url('${config.bgImage}') center/cover no-repeat fixed;`
    : `background: linear-gradient(180deg, ${tc.dark} 0%, ${tc.primary} 30%, ${tc.primary} 70%, ${tc.dark} 100%);`;

  // 倒计时目标
  const targetDate = `${config.weddingDate}T${config.weddingTime}:00`;

  // 日期格式化
  const dateParts = (config.weddingDate || '').split('-');
  const formattedDate = dateParts.length === 3
    ? `${dateParts[0]}年${parseInt(dateParts[1])}月${parseInt(dateParts[2])}日`
    : config.weddingDate;

  // 农历日期：如果 lunarDate 为空则自动从公历计算
  const lunarStr = config.lunarDate || solar2lunarStr(config.weddingDate);

  // 星期计算
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  let weekDay = '';
  try {
    const d = new Date(config.weddingDate);
    weekDay = weekDays[d.getDay()] || '';
  } catch(e) {}

  // 宾客问候（含称谓）
  const guestTitle = guest ? (guest.title || '') : '';
  const greeting = guestName
    ? `<div class="guest-greeting">尊敬的 <strong>${guestName}</strong>${guestTitle ? ' ' + guestTitle : ''}</div>`
    : `<div class="guest-greeting">致 尊敬的宾客</div>`;

  // 音乐按钮
  const musicBtn = features.music && config.bgMusic ? `
    <div id="musicBtn" class="music-btn" onclick="toggleMusic()" title="点击播放/暂停音乐">
      <span id="musicIcon">🎵</span>
    </div>
    <audio id="bgMusic" loop preload="none">
      <source src="${config.bgMusic}" type="audio/mpeg">
    </audio>` : '';

  // 花瓣动画
  const petalsCanvas = features.petals ? `<canvas id="petals" class="petals-canvas"></canvas>` : '';

  // 灯笼装饰 — 左右对称双喜红灯笼
  const lanterns = features.lanterns ? `
    <div class="lantern-wrap lantern-left">
      <div class="lantern-rope"></div>
      <div class="lantern-cap"></div>
      <div class="lantern-body"><span class="lantern-char">囍</span></div>
      <div class="lantern-bottom"></div>
      <div class="lantern-tassel">
        <div class="tassel-knot"></div>
        <div class="tassel-strands"></div>
      </div>
    </div>
    <div class="lantern-wrap lantern-right">
      <div class="lantern-rope"></div>
      <div class="lantern-cap"></div>
      <div class="lantern-body"><span class="lantern-char">囍</span></div>
      <div class="lantern-bottom"></div>
      <div class="lantern-tassel">
        <div class="tassel-knot"></div>
        <div class="tassel-strands"></div>
      </div>
    </div>` : '';

  // 爱情故事
  const storySection = features.story && config.story && config.story.length > 0 ? `
    <section class="section story-section">
      <div class="section-header">
        <span class="header-line"></span>
        <h2 class="section-title">我们的故事</h2>
        <span class="header-line"></span>
      </div>
      ${config.story.map((s, i) => `
        <div class="story-chapter" style="animation-delay: ${0.2 * i}s;">
          <div class="chapter-num">${String(i + 1).padStart(2, '0')}</div>
          <h3 class="chapter-title">${s.title}</h3>
          <p class="chapter-content">${s.content}</p>
        </div>
      `).join('')}
      <div class="story-signature">— ${config.groomName} &amp; ${config.brideName}</div>
    </section>` : '';

  // 婚礼流程
  const eventsSection = features.events && config.events && config.events.length > 0 ? `
    <section class="section events-section">
      <div class="section-header">
        <span class="header-line"></span>
        <h2 class="section-title">婚礼流程</h2>
        <span class="header-line"></span>
      </div>
      <div class="events-list">
        ${config.events.map(e => `
          <div class="event-item">
            <div class="event-time">${e.time}</div>
            <div class="event-info">
              <div class="event-title">${e.title}</div>
              <div class="event-desc">${e.desc || ''}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </section>` : '';

  // 邀请信
  const invitationText = config.text.invitationText || `吾儿 ${config.groomName} 与 ${config.brideName} 女士，喜结良缘，定于公历${formattedDate}（${lunarStr}${weekDay ? ' · ' + weekDay : ''}），在${config.venue}${config.venueHall ? config.venueHall : ''}举行结婚典礼。届时恭请您携家人光临，同贺新婚之喜。`;

  // RSVP表单
  const rsvpSection = features.rsvp ? `
    <section class="section rsvp-section" id="rsvpSection">
      <div class="section-header">
        <span class="header-line"></span>
        <h2 class="section-title">请回复 RSVP</h2>
        <span class="header-line"></span>
      </div>
      <p class="rsvp-hint">敬请于婚礼前回复，期待与您共度美好时光</p>
      <div class="rsvp-form">
        <div class="rsvp-row">
          <label class="rsvp-label">是否出席</label>
          <select id="rsvpStatus" class="rsvp-select">
            <option value="">请选择...</option>
            <option value="attending">🎉 一定到场</option>
            <option value="maybe">🤔 尽量到场</option>
            <option value="declined">😢 无法出席</option>
          </select>
        </div>
        <div class="rsvp-row">
          <label class="rsvp-label">出席人数</label>
          <div class="rsvp-count-row">
            <input type="number" id="rsvpCount" class="rsvp-input rsvp-count-input" placeholder="请选择或输入人数" min="1" max="6" list="countList" value="">
            <datalist id="countList">
              <option value="1">1人</option>
              <option value="2">2人</option>
              <option value="3">3人</option>
              <option value="4">4人</option>
              <option value="5">5人</option>
              <option value="6">6人</option>
            </datalist>
            <button class="rsvp-submit rsvp-submit-inline" onclick="submitRSVP()">提交回执</button>
          </div>
        </div>
        <div class="rsvp-row">
          <label class="rsvp-label">祝福语（选填，可点选下方祝福）</label>
          <div class="blessing-chips">
            <span class="blessing-chip" onclick="toggleBlessing(this, '百年好合')">百年好合</span>
            <span class="blessing-chip" onclick="toggleBlessing(this, '早生贵子')">早生贵子</span>
            <span class="blessing-chip" onclick="toggleBlessing(this, '永结同心')">永结同心</span>
            <span class="blessing-chip" onclick="toggleBlessing(this, '白头偕老')">白头偕老</span>
            <span class="blessing-chip" onclick="toggleBlessing(this, '幸福美满')">幸福美满</span>
            <span class="blessing-chip" onclick="toggleBlessing(this, '佳偶天成')">佳偶天成</span>
            <span class="blessing-chip" onclick="toggleBlessing(this, '琴瑟和鸣')">琴瑟和鸣</span>
            <span class="blessing-chip" onclick="toggleBlessing(this, '花开并蒂')">花开并蒂</span>
          </div>
          <textarea id="rsvpMessage" class="rsvp-textarea" placeholder="写下您的祝福（选填）或点击上方祝福词多选" rows="3"></textarea>
        </div>
      </div>
      <div id="rsvpResult" class="rsvp-result"></div>
    </section>` : '';

  // 统计上报
  const statsScript = features.stats ? `
    <script>
      fetch('/api/view', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({guestId:'${guestId}'}) }).catch(()=>{});
    </script>` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${shareTitle}</title>
<!-- 微信/朋友圈分享 meta 标签（SSR注入，微信爬虫不执行JS） -->
<meta property="og:type" content="website">
<meta property="og:title" content="${shareTitle}">
<meta property="og:description" content="${shareDesc}">
<meta property="og:image" content="${logoUrl}">
<meta property="og:url" content="${baseUrl}${guestId ? '/i/' + guestId : '/'}">
<meta name="description" content="${shareDesc}">
<!-- 微信分享专用 -->
<meta name="wximage" content="${logoUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${shareTitle}">
<meta name="twitter:description" content="${shareDesc}">
<meta name="twitter:image" content="${logoUrl}">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --c-primary: ${tc.primary};
  --c-gold: ${tc.gold};
  --c-light: ${tc.light};
  --c-dark: ${tc.dark};
}
body {
  ${bgStyle}
  min-height: 100vh;
  font-family: 'STKaiti', '楷体', 'KaiTi', 'Georgia', serif;
  color: ${tc.light};
  overflow-x: hidden;
}
/* 花瓣画布 */
.petals-canvas { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
/* 灯笼 — 传统双喜红灯笼 */
.lantern-wrap {
  position: fixed; top: 0; z-index: 5;
  display: flex; flex-direction: column; align-items: center;
  transform-origin: top center;
  animation: lanternSway 3.5s ease-in-out infinite;
}
.lantern-left { left: 8px; }
.lantern-right { right: 8px; animation-delay: 0.8s; }
.lantern-rope {
  width: 2px; height: 25px;
  background: linear-gradient(180deg, var(--c-gold), #b8860b);
  border-radius: 1px;
}
.lantern-cap {
  width: 44px; height: 8px;
  background: linear-gradient(180deg, var(--c-gold), #b8860b);
  border-radius: 4px 4px 2px 2px;
  margin-bottom: -1px; position: relative; z-index: 2;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.lantern-body {
  width: 55px; height: 68px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, #ff5050 0%, #e60000 50%, #cc0000 100%);
  border: 2.5px solid var(--c-gold);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 25px rgba(255,50,50,0.6), inset 0 -8px 15px rgba(0,0,0,0.2);
  position: relative;
  overflow: hidden;
}
.lantern-body::before {
  content: ''; position: absolute; top: 10%; left: 50%;
  width: 30px; height: 20px; transform: translateX(-50%);
  background: radial-gradient(ellipse, rgba(255,255,255,0.25), transparent 70%);
  border-radius: 50%;
}
.lantern-body::after {
  content: ''; position: absolute; bottom: 5%; left: 50%;
  width: 80%; height: 4px; transform: translateX(-50%);
  background: linear-gradient(90deg, transparent, var(--c-gold), transparent);
  opacity: 0.4;
}
.lantern-char {
  font-size: 1.6rem; color: var(--c-gold); font-weight: bold;
  text-shadow: 0 1px 3px rgba(0,0,0,0.4);
  position: relative; z-index: 3;
}
.lantern-bottom {
  width: 44px; height: 8px;
  background: linear-gradient(180deg, #b8860b, var(--c-gold));
  border-radius: 2px 2px 4px 4px;
  margin-top: -1px; position: relative; z-index: 2;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.lantern-tassel {
  display: flex; flex-direction: column; align-items: center;
  margin-top: 1px;
}
.tassel-knot {
  width: 8px; height: 6px;
  background: var(--c-gold); border-radius: 50%;
}
.tassel-strands {
  width: 12px; height: 28px;
  background: linear-gradient(180deg,
    var(--c-gold) 0%, var(--c-gold) 10%,
    #d4af37 30%, #c5a028 50%, #b89530 70%, #a08020 100%);
  border-radius: 0 0 6px 6px;
  position: relative;
  animation: tasselSway 3.5s ease-in-out infinite;
  transform-origin: top center;
}
.tassel-strands::before {
  content: ''; position: absolute; top: 0; left: 50%;
  width: 1px; height: 100%; transform: translateX(-50%);
  background: rgba(0,0,0,0.15);
}
@keyframes lanternSway {
  0% { transform: rotate(-6deg); }
  25% { transform: rotate(0deg); }
  50% { transform: rotate(6deg); }
  75% { transform: rotate(0deg); }
  100% { transform: rotate(-6deg); }
}
@keyframes tasselSway {
  0% { transform: rotate(-4deg); }
  50% { transform: rotate(4deg); }
  100% { transform: rotate(-4deg); }
}
@media (max-width: 380px) {
  .lantern-body { width: 45px; height: 56px; }
  .lantern-cap, .lantern-bottom { width: 36px; }
  .lantern-char { font-size: 1.3rem; }
}
/* 主容器 */
.container { position: relative; z-index: 3; max-width: 500px; margin: 0 auto; padding: 0; }
/* 英雄区 */
.hero {
  min-height: 100vh; display: flex; flex-direction: column;
  justify-content: center; align-items: center; padding: 1.5rem 1.5rem;
  text-align: center;
}
.hero .xi-big {
  font-size: 5.5rem; color: var(--c-gold); margin-bottom: 0.8rem;
  text-shadow: 0 0 30px rgba(212,175,55,0.5);
  animation: fadeInScale 1.5s ease;
}
.hero .subtitle { font-size: 1.15rem; opacity: 0.8; margin-bottom: 0.5rem; animation: fadeInUp 0.8s ease; }
.hero h1 {
  font-size: 2.2rem; color: var(--c-gold); margin-bottom: 1.2rem;
  letter-spacing: 3px; animation: fadeInUp 1s ease;
  text-shadow: 0 2px 10px rgba(0,0,0,0.3);
}
.guest-greeting {
  font-size: 1.25rem; color: var(--c-gold); margin-bottom: 1.2rem;
  animation: fadeInUp 1.2s ease;
}
.names-block { margin: 0.8rem 0 1.2rem; animation: fadeInUp 1.4s ease; }
.names-block .name { font-size: 3.2rem; font-weight: bold; color: var(--c-light); text-shadow: 0 2px 15px rgba(0,0,0,0.4); }
.names-block .heart { font-size: 2rem; color: var(--c-gold); margin: 0 0.8rem; display: inline-block; animation: heartBeat 1.5s infinite; }
@keyframes heartBeat { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
.poem { font-size: 1.3rem; color: var(--c-gold); margin: 0.8rem 0; animation: fadeInUp 1.6s ease; }
.date-block { margin: 1.2rem 0; animation: fadeInUp 1.8s ease; }
.date-block .date-main { font-size: 1.5rem; color: var(--c-light); }
.date-block .date-sub { font-size: 1.05rem; opacity: 0.7; margin-top: 0.3rem; }
.date-block .date-time { font-size: 1.25rem; color: var(--c-gold); margin-top: 0.5rem; }
/* 英雄区小标题 */
.block-title {
  font-size: 1rem; color: var(--c-gold); opacity: 0.6; letter-spacing: 2px;
  margin-bottom: 0.4rem; position: relative; display: inline-block;
}
.block-title::before, .block-title::after {
  content: ''; display: inline-block; width: 20px; height: 1px;
  background: var(--c-gold); opacity: 0.5; vertical-align: middle;
  margin: 0 0.5rem;
}
/* 英雄区场地信息 */
.hero-venue {
  margin: 0.8rem 0 0.3rem; animation: fadeInUp 1.9s ease;
  display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
}
.hero-venue .hv-name { font-size: 1.6rem; color: var(--c-gold); font-weight: bold; text-shadow: 0 1px 8px rgba(212,175,55,0.4); letter-spacing: 1px; }
.hero-venue .hv-hall { font-size: 1.1rem; color: var(--c-gold); opacity: 0.85; }
.hero-venue .hv-addr { font-size: 0.85rem; opacity: 0.65; max-width: 280px; }
.hero-venue .hv-nav {
  margin-top: 0.4rem; padding: 0.35rem 1.2rem; border: 1px solid var(--c-gold);
  border-radius: 20px; background: rgba(212,175,55,0.12); color: var(--c-gold);
  font-size: 0.8rem; cursor: pointer; font-family: inherit; transition: all 0.2s;
}
.hero-venue .hv-nav:hover { background: rgba(212,175,55,0.3); transform: scale(1.03); }
/* 倒计时 */
.countdown-block { margin: 1.2rem 0; animation: fadeInUp 2s ease; }
.countdown-title { font-size: 1rem; opacity: 0.7; margin-bottom: 0.6rem; text-align: center; }
.countdown-grid { display: flex; justify-content: center; gap: 0.6rem; }
.countdown-box {
  background: rgba(255,255,255,0.12); backdrop-filter: blur(10px);
  border: 1px solid rgba(212,175,55,0.3);
  border-radius: 10px; padding: 0.5rem 0.3rem; min-width: 58px; text-align: center;
}
.countdown-box .num { font-size: 1.7rem; font-weight: bold; color: var(--c-gold); }
.countdown-box .label { font-size: 0.7rem; opacity: 0.7; margin-top: 0.1rem; }
/* 分隔 */
.scroll-hint { margin-top: 1.5rem; font-size: 0.9rem; opacity: 0.5; animation: bounce 2s infinite; }
@keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(8px); } }
/* 通用 section */
.section { padding: 2.2rem 1.5rem; text-align: center; }
.section-header { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 1.2rem; }
.header-line { height: 1px; background: linear-gradient(90deg, transparent, var(--c-gold), transparent); flex: 1; max-width: 60px; }
.section-title { font-size: 1.75rem; color: var(--c-gold); letter-spacing: 2px; }
/* 邀请信 */
.invitation-text {
  font-size: 1.1rem; line-height: 2; opacity: 0.9; max-width: 380px; margin: 0 auto 1.2rem;
  text-align: justify;
}
.invitation-text .highlight { color: var(--c-gold); font-weight: bold; }
.parents-block { margin-top: 1.5rem; font-size: 1.25rem; }
.parents-block .parent-row { margin: 0.5rem 0; }
.parents-block .parent-label { font-size: 1rem; opacity: 0.7; }
.parents-block .parent-name { color: var(--c-gold); font-weight: bold; font-size: 1.5rem; margin: 0 0.4rem; text-shadow: 0 1px 6px rgba(212,175,55,0.4); }
/* 爱情故事 */
.story-chapter { margin: 1.2rem 0; animation: fadeInUp 1s ease; }
.story-chapter .chapter-num {
  font-size: 0.85rem; color: var(--c-gold); opacity: 0.5;
  border: 1px solid var(--c-gold); border-radius: 50%;
  width: 30px; height: 30px; line-height: 28px; margin: 0 auto 0.5rem;
}
.story-chapter .chapter-title { font-size: 1.3rem; color: var(--c-gold); margin-bottom: 0.4rem; }
.story-chapter .chapter-content { font-size: 1.05rem; line-height: 1.8; opacity: 0.85; max-width: 350px; margin: 0 auto; }
.story-signature { margin-top: 1.2rem; font-size: 1rem; color: var(--c-gold); opacity: 0.8; }
/* 婚礼流程 */
.events-list { max-width: 380px; margin: 0 auto; }
.event-item { display: flex; align-items: center; gap: 1rem; margin: 0.8rem 0; text-align: left; }
.event-time { font-size: 1.4rem; color: var(--c-gold); font-weight: bold; min-width: 60px; }
.event-info { flex: 1; }
.event-title { font-size: 1.2rem; color: var(--c-light); }
.event-desc { font-size: 0.95rem; opacity: 0.7; margin-top: 0.2rem; }
/* 场地 */
.venue-card {
  background: rgba(255,255,255,0.08); backdrop-filter: blur(10px);
  border: 1px solid rgba(212,175,55,0.3); border-radius: 12px;
  padding: 1.5rem; max-width: 380px; margin: 0 auto;
}
.venue-card .venue-name { font-size: 1.3rem; color: var(--c-gold); margin-bottom: 0.3rem; }
.venue-card .venue-hall { font-size: 1rem; color: var(--c-gold); opacity: 0.85; margin-bottom: 0.3rem; }
.venue-card .venue-addr { font-size: 0.9rem; opacity: 0.7; }
.venue-card .venue-desc-text { font-size: 0.85rem; opacity: 0.6; margin-top: 0.5rem; }
.venue-nav-btn {
  margin-top: 1rem; padding: 0.6rem 1.5rem; border: 1.5px solid var(--c-gold);
  border-radius: 25px; background: rgba(212,175,55,0.15); color: var(--c-gold);
  font-size: 0.95rem; cursor: pointer; font-family: inherit; transition: all 0.2s;
}
.venue-nav-btn:hover { background: rgba(212,175,55,0.3); transform: scale(1.03); }
/* RSVP */
.rsvp-hint { font-size: 0.95rem; opacity: 0.7; margin-bottom: 0.8rem; }
.rsvp-form { max-width: 380px; margin: 0 auto; display: flex; flex-direction: column; gap: 0.7rem; }
.rsvp-row { display: flex; flex-direction: column; gap: 0.3rem; text-align: left; }
.rsvp-label { font-size: 0.95rem; color: var(--c-gold); }
.rsvp-select, .rsvp-input, .rsvp-textarea {
  width: 100%; padding: 0.7rem; border: 1px solid rgba(212,175,55,0.3);
  border-radius: 8px; background: rgba(255,255,255,0.08); color: var(--c-light);
  font-size: 1rem; font-family: inherit;
}
.rsvp-select option { color: #333; }
.rsvp-textarea { resize: vertical; min-height: 60px; }
.rsvp-count-row { display: flex; gap: 0.6rem; align-items: stretch; }
.rsvp-count-input { flex: 1; }
.rsvp-submit-inline {
  flex-shrink: 0; padding: 0.7rem 1.2rem; white-space: nowrap;
}
.blessing-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }
.blessing-chip {
  padding: 0.3rem 0.7rem; border: 1px solid rgba(212,175,55,0.4);
  border-radius: 16px; background: rgba(212,175,55,0.1); color: var(--c-gold);
  font-size: 0.85rem; cursor: pointer; transition: all 0.2s; user-select: none;
}
.blessing-chip:hover { background: rgba(212,175,55,0.3); transform: scale(1.05); }
.blessing-chip.active { background: var(--c-gold); color: var(--c-primary); border-color: var(--c-gold); }
.rsvp-submit {
  padding: 0.8rem; border: none; border-radius: 8px;
  background: linear-gradient(135deg, var(--c-primary), var(--c-dark));
  color: var(--c-gold); font-size: 1.1rem; cursor: pointer;
  font-family: inherit; letter-spacing: 2px; transition: transform 0.2s, opacity 0.2s;
  border: 1px solid var(--c-gold);
}
.rsvp-submit:hover { transform: scale(1.02); opacity: 0.9; }
.rsvp-result { text-align: center; margin-top: 0.8rem; }
/* 页脚 */
.footer { padding: 2.2rem 1.5rem 3rem; text-align: center; }
.footer .footer-names { font-size: 1.4rem; color: var(--c-gold); margin-bottom: 0.5rem; }
.footer .footer-date { font-size: 1rem; opacity: 0.7; }
.footer .footer-quote { font-size: 1.1rem; color: var(--c-gold); margin-top: 0.8rem; opacity: 0.8; }
/* 音乐按钮 */
.music-btn {
  position: fixed; top: 150px; right: 14px; width: 34px; height: 34px;
  border-radius: 50%; background: var(--c-primary);
  border: 1.5px solid var(--c-gold); display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 0.95rem; z-index: 999;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4); transition: all 0.3s;
  color: var(--c-gold);
}
.music-btn:hover { transform: scale(1.1); border-color: #fff; }
.music-btn.playing { animation: musicSpin 3s linear infinite, musicPulse 2s infinite; }
@keyframes musicSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes musicPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(212,175,55,0.4); } 50% { box-shadow: 0 0 0 8px rgba(212,175,55,0); } }
/* 动画 */
@keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeInScale { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
/* 滚动渐入 */
.fade-in { opacity: 0; transform: translateY(40px); transition: all 0.8s ease; }
.fade-in.visible { opacity: 1; transform: translateY(0); }
</style>
</head>
<body>
${petalsCanvas}
${lanterns}
<div class="container">
  <!-- 英雄区 -->
  <section class="hero">
    ${greeting}
    <div class="xi-big">囍</div>
    <p class="subtitle">${config.text.invitation || '诚挚邀请'}</p>
    <h1>${config.text.title}</h1>
    <div class="names-block">
      <span class="name">${config.groomName}</span>
      <span class="heart">❤</span>
      <span class="name">${config.brideName}</span>
    </div>
    <p class="poem">${config.text.poem || '执子之手，与子偕老'}</p>
    <div class="date-block">
      <div class="block-title">婚礼时间</div>
      <div class="date-main">${formattedDate}</div>
      ${weekDay ? `<div class="date-sub">${weekDay}</div>` : ''}
      ${lunarStr ? `<div class="date-sub">${lunarStr}</div>` : ''}
      <div class="date-time">${config.weddingTime}</div>
    </div>
    <div class="hero-venue">
      <div class="block-title">婚礼地点</div>
      <div class="hv-name">${config.venue}</div>
      ${config.venueHall ? `<div class="hv-hall">${config.venueHall}</div>` : ''}
      <div class="hv-addr">${config.address}</div>
      <button class="hv-nav" onclick="openMapNav()">点击导航</button>
    </div>
    ${features.countdown ? `
    <div class="countdown-block">
      <div class="countdown-title">距离婚礼还有</div>
      <div class="countdown-grid" id="countdown">
        <div class="countdown-box"><div class="num" id="cd-days">0</div><div class="label">天</div></div>
        <div class="countdown-box"><div class="num" id="cd-hours">0</div><div class="label">时</div></div>
        <div class="countdown-box"><div class="num" id="cd-mins">0</div><div class="label">分</div></div>
        <div class="countdown-box"><div class="num" id="cd-secs">0</div><div class="label">秒</div></div>
      </div>
    </div>` : ''}
    <div class="scroll-hint">向下滑动 ↓</div>
  </section>

  <!-- 邀请信 -->
  <section class="section fade-in">
    <div class="section-header">
      <span class="header-line"></span>
      <h2 class="section-title">诚挚邀请</h2>
      <span class="header-line"></span>
    </div>
    <p class="invitation-text">${invitationText}</p>
    ${(config.fatherName || config.motherName) ? `
    <div class="parents-block">
      ${config.fatherName ? `<div class="parent-row"><span class="parent-label">父亲</span><span class="parent-name">${config.fatherName}</span>敬邀</div>` : ''}
      ${config.motherName ? `<div class="parent-row"><span class="parent-label">母亲</span><span class="parent-name">${config.motherName}</span>敬邀</div>` : ''}
    </div>` : ''}
  </section>

  ${storySection}

  ${eventsSection}

  ${rsvpSection}

  <!-- 页脚 -->
  <footer class="footer">
    <div class="footer-names">${config.groomName} &amp; ${config.brideName}</div>
    <div class="footer-date">${formattedDate} · ${config.venue}</div>
    <div class="footer-quote">"${config.text.quote || '愿有岁月可回首，且以深情共白头'}"</div>
  </footer>
</div>

${musicBtn}

<script>
// ================== 倒计时 ==================
${features.countdown ? `
const target = new Date('${targetDate}').getTime();
function updateCountdown() {
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) {
    const el = document.getElementById('countdown');
    if (el) el.parentElement.innerHTML = '<div class="countdown-title">婚礼进行中 🎉</div>';
    return;
  }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const dd = document.getElementById('cd-days'); if (dd) dd.textContent = d;
  const hh = document.getElementById('cd-hours'); if (hh) hh.textContent = h;
  const mm = document.getElementById('cd-mins'); if (mm) mm.textContent = m;
  const ss = document.getElementById('cd-secs'); if (ss) ss.textContent = s;
}
updateCountdown();
setInterval(updateCountdown, 1000);` : ''}

// ================== 花瓣飘落动画 ==================
${features.petals ? `
const canvas = document.getElementById('petals');
const ctx = canvas.getContext('2d');
let petals = [];
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
function createPetal() {
  return {
    x: Math.random() * canvas.width,
    y: -20,
    size: 8 + Math.random() * 12,
    speedY: 0.5 + Math.random() * 1.5,
    speedX: (Math.random() - 0.5) * 0.5,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.02,
    color: ['#ff6b6b', '#ee5a5a', '#ff8e8e', '#d4af37', '#ffb347'][Math.floor(Math.random()*5)],
    opacity: 0.5 + Math.random() * 0.5,
  };
}
function drawPetal(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.globalAlpha = p.opacity;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, p.size * 0.5, p.size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function animatePetals() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (petals.length < 30) petals.push(createPetal());
  petals = petals.filter(p => {
    p.y += p.speedY;
    p.x += p.speedX + Math.sin(p.y * 0.01) * 0.3;
    p.rotation += p.rotSpeed;
    if (p.y > canvas.height + 20) return false;
    drawPetal(p);
    return true;
  });
  requestAnimationFrame(animatePetals);
}
animatePetals();` : ''}

// ================== 滚动渐入 ==================
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.15 });
document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

// ================== 背景音乐 ==================
let musicPlaying = false;
function toggleMusic() {
  const audio = document.getElementById('bgMusic');
  const btn = document.getElementById('musicBtn');
  const icon = document.getElementById('musicIcon');
  if (!audio) return;
  if (musicPlaying) {
    fadeAudio(audio, false, () => { audio.pause(); btn.classList.remove('playing'); musicPlaying = false; });
  } else {
    audio.play().then(() => {
      btn.classList.add('playing'); musicPlaying = true;
      fadeAudio(audio, true);
    }).catch(() => {});
  }
}
function fadeAudio(audio, fadeIn, cb) {
  const t = fadeIn ? 0.6 : 0;
  audio.volume = fadeIn ? 0 : audio.volume;
  const step = fadeIn ? 0.02 : -0.02;
  const timer = setInterval(() => {
    audio.volume += step;
    if (fadeIn && audio.volume >= t) { audio.volume = t; clearInterval(timer); if(cb) cb(); }
    if (!fadeIn && audio.volume <= 0) { audio.volume = 0; clearInterval(timer); if(cb) cb(); }
  }, 50);
}

// ================== RSVP ==================
const GUEST_ID = '${guestId}';
const NAV_URL = '${(config.navUrl || 'https://surl.amap.com/fOExV1w103jX').replace(/'/g, "\\'")}';
function openMapNav() {
  window.open(NAV_URL, '_blank');
}
function toggleBlessing(el, text) {
  const ta = document.getElementById('rsvpMessage');
  let selected = ta.value.trim() ? ta.value.trim().split(/[，,、\s]+/).filter(Boolean) : [];
  const idx = selected.indexOf(text);
  if (idx >= 0) {
    selected.splice(idx, 1);
    el.classList.remove('active');
  } else {
    selected.push(text);
    el.classList.add('active');
  }
  ta.value = selected.join('，');
}
function submitRSVP() {
  const status = document.getElementById('rsvpStatus').value;
  const count = document.getElementById('rsvpCount').value;
  const message = document.getElementById('rsvpMessage').value;
  const result = document.getElementById('rsvpResult');
  if (!status) { result.innerHTML = '<span style="color:#ff6b6b;">请选择出席状态</span>'; return; }
  fetch('/api/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guestId: GUEST_ID, status, count: count ? parseInt(count) : null, message })
  }).then(r => r.json()).then(() => {
    result.innerHTML = '<span style="color:#d4af37;">✅ 回执已提交，感谢您的回复！</span>';
  }).catch(() => {
    result.innerHTML = '<span style="color:#ff6b6b;">提交失败，请稍后重试</span>';
  });
}
</script>
${statsScript}
</body>
</html>`;
}

// ================== 页面：管理后台 ==================
function getAdminPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>婚礼请帖管理后台</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; }
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.login-box { background: #16213e; padding: 2.5rem; border-radius: 16px; width: 90%; max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
.login-box h1 { text-align: center; margin-bottom: 1.5rem; color: #e94560; font-size: 1.5rem; }
.login-box input { width: 100%; padding: 0.8rem; margin-bottom: 1rem; border: 1px solid #333; border-radius: 8px; background: #0f3460; color: #fff; font-size: 1rem; }
.login-box input:focus { border-color: #e94560; outline: none; }
.login-box button { width: 100%; padding: 0.8rem; border: none; border-radius: 8px; background: #e94560; color: #fff; font-size: 1.1rem; cursor: pointer; transition: opacity 0.2s; }
.login-box button:hover { opacity: 0.85; }
.login-error { color: #e74c3c; text-align: center; margin-top: 0.5rem; font-size: 0.9rem; display: none; }
.dashboard { display: none; padding: 1rem; max-width: 900px; margin: 0 auto; }
.nav { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.nav button { padding: 0.6rem 1.2rem; border: none; border-radius: 8px; background: #0f3460; color: #eee; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; }
.nav button.active { background: #e94560; color: #fff; }
.nav .right { margin-left: auto; }
.panel { background: #16213e; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; display: none; }
.panel.active { display: block; }
.panel h2 { color: #e94560; margin-bottom: 1rem; font-size: 1.2rem; }
.form-group { margin-bottom: 1rem; }
.form-group label { display: block; margin-bottom: 0.3rem; font-size: 0.9rem; color: #aaa; }
.form-group input, .form-group textarea, .form-group select { width: 100%; padding: 0.6rem; border: 1px solid #333; border-radius: 6px; background: #0f3460; color: #fff; font-size: 0.95rem; }
.form-group textarea { resize: vertical; min-height: 60px; }
.toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; }
.toggle-row label { font-size: 0.95rem; }
.toggle { position: relative; width: 48px; height: 26px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #333; border-radius: 26px; transition: 0.3s; }
.toggle .slider:before { content: ''; position: absolute; height: 20px; width: 20px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.3s; }
.toggle input:checked + .slider { background: #e94560; }
.toggle input:checked + .slider:before { transform: translateX(22px); }
.btn { padding: 0.6rem 1.2rem; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; transition: opacity 0.2s; }
.btn-primary { background: #e94560; color: #fff; }
.btn-success { background: #2ecc71; color: #fff; }
.btn-danger { background: #e74c3c; color: #fff; }
.btn-gold { background: #d4af37; color: #1a1a2e; }
.btn:hover { opacity: 0.85; }
table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
th, td { padding: 0.6rem; text-align: left; border-bottom: 1px solid #333; font-size: 0.85rem; }
th { color: #e94560; }
.guest-link { color: #3498db; text-decoration: none; word-break: break-all; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; }
.stat-card { background: #0f3460; border-radius: 8px; padding: 1rem; text-align: center; }
.stat-card .num { font-size: 2rem; color: #e94560; font-weight: bold; }
.stat-card .label { font-size: 0.85rem; color: #aaa; margin-top: 0.3rem; }
.toast { position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem; border-radius: 8px; color: #fff; z-index: 9999; animation: slideIn 0.3s ease; }
.toast-success { background: #2ecc71; }
.toast-error { background: #e74c3c; }
@keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.import-area { width: 100%; min-height: 100px; padding: 0.6rem; border: 1px solid #333; border-radius: 6px; background: #0f3460; color: #fff; font-size: 0.9rem; resize: vertical; }
.hint { font-size: 0.8rem; color: #888; margin-top: 0.3rem; }
.add-guest-row { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.add-guest-row input { flex: 1; padding: 0.6rem; border: 1px solid #333; border-radius: 6px; background: #0f3460; color: #fff; font-size: 0.9rem; }
.event-edit-row { display: flex; gap: 0.4rem; margin-bottom: 0.5rem; align-items: center; flex-wrap: wrap; }
.event-edit-row input { padding: 0.5rem; border: 1px solid #333; border-radius: 6px; background: #0f3460; color: #fff; font-size: 0.85rem; }
.event-edit-row .evt-time { width: 80px; }
.event-edit-row .evt-title { flex: 1; min-width: 120px; }
.event-edit-row .evt-desc { flex: 1; min-width: 100px; }
.story-edit-row { margin-bottom: 0.8rem; padding: 0.8rem; border: 1px solid #333; border-radius: 8px; background: #0d2a4a; }
.story-edit-row .story-title { width: 100%; padding: 0.5rem; border: 1px solid #333; border-radius: 6px; background: #0f3460; color: #fff; font-size: 0.9rem; margin-bottom: 0.4rem; }
.story-edit-row .story-content { width: 100%; padding: 0.5rem; border: 1px solid #333; border-radius: 6px; background: #0f3460; color: #fff; font-size: 0.85rem; resize: vertical; min-height: 50px; margin-bottom: 0.4rem; }
</style>
</head>
<body>
<div class="login-wrap" id="loginWrap">
  <div class="login-box">
    <h1>💒 婚礼请帖管理</h1>
    <input type="password" id="pwdInput" placeholder="请输入管理密码" onkeypress="if(event.key==='Enter')doLogin()">
    <button onclick="doLogin()">登录</button>
    <div class="login-error" id="loginError">密码错误，请重试</div>
  </div>
</div>
<div class="dashboard" id="dashboard">
  <div class="nav">
    <button class="nav-btn active" data-panel="config" onclick="showPanel('config')">基础配置</button>
    <button class="nav-btn" data-panel="assets" onclick="showPanel('assets')">资源设置</button>
    <button class="nav-btn" data-panel="features" onclick="showPanel('features')">功能开关</button>
    <button class="nav-btn" data-panel="text" onclick="showPanel('text')">文案编辑</button>
    <button class="nav-btn" data-panel="events" onclick="showPanel('events')">流程故事</button>
    <button class="nav-btn" data-panel="guests" onclick="showPanel('guests')">宾客管理</button>
    <button class="nav-btn" data-panel="links" onclick="showPanel('links')">专属链接</button>
    <button class="nav-btn" data-panel="stats" onclick="showPanel('stats')">统计</button>
    <button class="nav-btn right" onclick="doLogout()">退出</button>
  </div>

  <div class="panel active" id="panel-config">
    <h2>基础配置</h2>
    <div class="form-group"><label>新郎姓名</label><input id="cfg-groom" type="text"></div>
    <div class="form-group"><label>新娘姓名</label><input id="cfg-bride" type="text"></div>
    <div class="form-group"><label>新郎父亲姓名</label><input id="cfg-father" type="text" placeholder="留空则不显示"></div>
    <div class="form-group"><label>新郎母亲姓名</label><input id="cfg-mother" type="text" placeholder="留空则不显示"></div>
    <div class="form-group"><label>婚礼日期</label><input id="cfg-date" type="date"></div>
    <div class="form-group"><label>婚礼时间</label><input id="cfg-time" type="time"></div>
    <div class="form-group"><label>农历日期</label><input id="cfg-lunar" type="text" placeholder="留空则自动从公历日期计算"></div>
    <div class="form-group"><label>婚礼地点/酒店名称</label><input id="cfg-venue" type="text"></div>
    <div class="form-group"><label>宴会厅名称</label><input id="cfg-venueHall" type="text" placeholder="如：水晶主题厅"></div>
    <div class="form-group"><label>详细地址</label><input id="cfg-address" type="text"></div>
    <div class="form-group"><label>场地描述</label><input id="cfg-venueDesc" type="text" placeholder="选填"></div>
    <div class="form-group"><label>地图导航关键词</label><input id="cfg-navKeyword" type="text" placeholder="如：鑫禧堂礼宴中心"><div class="hint">用于地图搜索的关键词</div></div>
    <div class="form-group"><label>导航短链接</label><input id="cfg-navUrl" type="text" placeholder="https://surl.amap.com/xxx"><div class="hint">高德短链接，导航按钮直接跳转此链接（优先于关键词）</div></div>
    <div class="form-group"><label>请帖模板</label><select id="cfg-template"><option value="classic">经典红金</option><option value="elegant">优雅暗金</option><option value="modern">现代粉青</option></select></div>
    <button class="btn btn-primary" onclick="saveConfig()">保存配置</button>
  </div>

  <div class="panel" id="panel-assets">
    <h2>资源设置（CF文件库）</h2>
    <div class="form-group">
      <label>喜帖分享LOGO</label>
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
        <img id="logoPreview" style="width:80px;height:80px;border-radius:8px;border:2px solid #333;background:#0f3460;object-fit:cover;" alt="LOGO预览">
        <div>
          <input type="file" id="logoUpload" accept="image/*" style="display:none;" onchange="handleLogoUpload(this)">
          <button class="btn btn-gold" onclick="document.getElementById('logoUpload').click()">上传LOGO</button>
          <button class="btn btn-danger" onclick="clearLogo()" style="margin-left:0.5rem;">清除</button>
        </div>
      </div>
      <div class="hint">上传图片作为微信分享时的LOGO（建议300x300或500x400）。未上传时使用默认囍字LOGO。</div>
      <input id="cfg-logoImage" type="hidden">
    </div>
    <div class="form-group">
      <label>背景图 URL</label>
      <input id="cfg-bgImage" type="text" placeholder="https://wj.lmlcyp.ccwu.cc/JPG/your-photo.jpg">
      <div class="hint">从CF文件库获取直链，填入完整URL。留空使用默认渐变背景。</div>
    </div>
    <div class="form-group">
      <label>背景音乐 URL</label>
      <input id="cfg-bgMusic" type="text" placeholder="https://wj.lmlcyp.ccwu.cc/mp3/your-music.mp3">
      <div class="hint">填入MP3文件直链。留空则不显示音乐按钮。</div>
    </div>
    <div class="form-group">
      <label>统计 API 地址</label>
      <input id="cfg-statsApi" type="text" placeholder="https://your-worker.workers.dev/api/stats">
      <div class="hint">外部统计表格API地址。留空则使用内置统计。</div>
    </div>
    <button class="btn btn-primary" onclick="saveConfig()">保存</button>
  </div>

  <div class="panel" id="panel-features">
    <h2>功能开关</h2>
    <div class="toggle-row"><label>🎵 背景音乐</label><label class="toggle"><input type="checkbox" id="feat-music"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>🖼️ 背景图</label><label class="toggle"><input type="checkbox" id="feat-bgImage"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>⏰ 倒计时</label><label class="toggle"><input type="checkbox" id="feat-countdown"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>📋 RSVP回执</label><label class="toggle"><input type="checkbox" id="feat-rsvp"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>📊 统计功能</label><label class="toggle"><input type="checkbox" id="feat-stats"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>📖 爱情故事</label><label class="toggle"><input type="checkbox" id="feat-story"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>📅 婚礼流程</label><label class="toggle"><input type="checkbox" id="feat-events"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>🌸 花瓣飘落</label><label class="toggle"><input type="checkbox" id="feat-petals"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>🏮 灯笼装饰</label><label class="toggle"><input type="checkbox" id="feat-lanterns"><span class="slider"></span></label></div>
    <button class="btn btn-primary" onclick="saveConfig()" style="margin-top:1rem;">保存</button>
  </div>

  <div class="panel" id="panel-text">
    <h2>文案编辑</h2>
    <div class="form-group"><label>请帖标题</label><input id="cfg-title" type="text"></div>
    <div class="form-group"><label>邀请语</label><input id="cfg-invitation" type="text"></div>
    <div class="form-group"><label>诗句</label><input id="cfg-poem" type="text" placeholder="如：执子之手，与子偕老"></div>
    <div class="form-group"><label>介绍文案</label><textarea id="cfg-intro"></textarea></div>
    <div class="form-group"><label>结尾文案</label><textarea id="cfg-ending"></textarea></div>
    <div class="form-group"><label>浪漫诗句（页脚）</label><input id="cfg-quote" type="text" placeholder="如：愿有岁月可回首，且以深情共白头"></div>
    <div class="form-group"><label>正式邀请信（留空使用默认模板）</label><textarea id="cfg-invitationText" placeholder="留空将自动生成：吾儿 [新郎] 与 [新娘] 女士..."></textarea></div>
    <button class="btn btn-primary" onclick="saveConfig()">保存文案</button>
  </div>

  <div class="panel" id="panel-events">
    <h2>婚礼流程</h2>
    <p class="hint" style="margin-bottom:1rem;">添加婚礼当天的流程安排，每项包含时间、名称和描述</p>
    <div id="eventsList"></div>
    <button class="btn btn-gold" onclick="addEventItem()">+ 添加流程项</button>
    <h2 style="margin-top:2rem;">爱情故事</h2>
    <p class="hint" style="margin-bottom:1rem;">添加你们的爱情故事章节，每章包含标题和内容</p>
    <div id="storyList"></div>
    <button class="btn btn-gold" onclick="addStoryItem()">+ 添加故事章节</button>
    <div style="margin-top:1.5rem;">
      <button class="btn btn-primary" onclick="saveConfig()">保存流程与故事</button>
    </div>
  </div>

  <div class="panel" id="panel-guests">
    <h2>宾客管理</h2>
    <div class="add-guest-row" style="flex-wrap:wrap;">
      <input id="singleGuestName" type="text" placeholder="宾客姓名" style="flex:1;min-width:100px;">
      <select id="singleGuestTitle" style="width:90px;padding:0.6rem;border:1px solid #333;border-radius:6px;background:#0f3460;color:#fff;font-size:0.85rem;">
        <option value="">称谓</option>
        <option value="先生">先生</option>
        <option value="女士">女士</option>
        <option value="全家">全家</option>
        <option value="老师">老师</option>
        <option value="教授">教授</option>
        <option value="博士">博士</option>
        <option value="经理">经理</option>
      </select>
      <input id="singleGuestPhone" type="text" placeholder="电话（选填）" style="width:120px;padding:0.6rem;border:1px solid #333;border-radius:6px;background:#0f3460;color:#fff;font-size:0.85rem;">
      <button class="btn btn-gold" onclick="addSingleGuest()">添加</button>
    </div>
    <div class="form-group">
      <label>批量导入宾客名单（每行格式：姓名,称谓,电话 — 称谓和电话可选）</label>
      <textarea class="import-area" id="guestImport" placeholder="张三,先生,13800138000&#10;李四,女士&#10;王五,全家&#10;赵六"></textarea>
      <div class="hint">支持从统计表格复制粘贴，每行一位宾客</div>
    </div>
    <button class="btn btn-success" onclick="importGuests()">批量导入</button>
    <button class="btn btn-primary" onclick="loadGuests()" style="margin-left:0.5rem;">刷新列表</button>
    <table id="guestTable">
      <thead><tr><th>姓名</th><th>称谓</th><th>电话</th><th>回执状态</th><th>专属链接</th><th>操作</th></tr></thead>
      <tbody id="guestList"></tbody>
    </table>
  </div>

  <div class="panel" id="panel-links">
    <h2>专属请帖链接</h2>
    <p class="hint" style="margin-bottom:1rem;">每位宾客的专属链接格式：/i/宾客ID，打开后显示个性化请帖（含宾客姓名）</p>
    <button class="btn btn-success" onclick="refreshLinks()">刷新链接列表</button>
    <button class="btn btn-gold" onclick="exportLinks()" style="margin-left:0.5rem;">导出链接列表</button>
    <table id="linkTable" style="margin-top:1rem;">
      <thead><tr><th>宾客</th><th>专属链接</th><th>复制</th></tr></thead>
      <tbody id="linkList"></tbody>
    </table>
  </div>

  <div class="panel" id="panel-stats">
    <h2>访问统计</h2>
    <div class="stats-grid">
      <div class="stat-card"><div class="num" id="stat-views">0</div><div class="label">总访问量</div></div>
      <div class="stat-card"><div class="num" id="stat-guests">0</div><div class="label">宾客总数</div></div>
      <div class="stat-card"><div class="num" id="stat-rsvp">0</div><div class="label">已回执</div></div>
      <div class="stat-card"><div class="num" id="stat-attending">0</div><div class="label">出席人数</div></div>
    </div>
    <button class="btn btn-primary" onclick="loadStats()" style="margin-top:1rem;">刷新统计</button>
  </div>
</div>

<script>
// ================== 全局变量 ==================
let AUTH_TOKEN = '';
let currentConfig = {};
let guestsData = [];

// ================== 登录 ==================
function doLogin() {
  const pwd = document.getElementById('pwdInput').value;
  if (!pwd) { document.getElementById('loginError').textContent = '请输入密码'; document.getElementById('loginError').style.display = 'block'; return; }
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pwd })
  }).then(r => r.json()).then(data => {
    if (data.token) {
      AUTH_TOKEN = data.token;
      localStorage.setItem('adminToken', AUTH_TOKEN);
      showDashboard();
    } else {
      document.getElementById('loginError').textContent = data.error || '密码错误';
      document.getElementById('loginError').style.display = 'block';
    }
  }).catch(() => {
    document.getElementById('loginError').textContent = '登录失败，请检查网络';
    document.getElementById('loginError').style.display = 'block';
  });
}

function showDashboard() {
  document.getElementById('loginWrap').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  loadConfig();
  loadGuests();
  loadStats();
}

function doLogout() {
  AUTH_TOKEN = '';
  localStorage.removeItem('adminToken');
  location.reload();
}

window.addEventListener('load', () => {
  const saved = localStorage.getItem('adminToken');
  if (saved) { AUTH_TOKEN = saved; showDashboard(); }
});

// ================== 面板切换 ==================
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  const btn = document.querySelector('.nav-btn[data-panel="' + name + '"]');
  if (btn) btn.classList.add('active');
  if (name === 'links') refreshLinks();
  if (name === 'stats') loadStats();
}

// ================== 农历转换（后台管理用） ==================
const LUNAR_INFO_A = [0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x0a930,0x05592,0x09630,0x0a9b0,0x0ab50,0x04b60,0x0aa50,0x0a500,0x0a520,0x0a050,0x062a0,0x068d0,0x072d0,0x08650,0x08670,0x0c550,0x09650,0x055a0,0x092d0,0x0a930,0x0c570,0x0a950,0x0b5a0,0x0a6d0,0x0a570,0x096d0,0x0aa50,0x0b5a0,0x04650,0x0a550,0x1d2a0,0x1b550,0x0a6a0,0x0a5d0,0x0a5b0,0x0a6a0,0x0a9b0,0x0aa50,0x0b2a0,0x1d5b0,0x1b2b0,0x0a930,0x0b550,0x0a570,0x0a4a0,0x0aa50,0x1b255,0x06d30,0x0ada0,0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x16a50,0x0ed25,0x083b0,0x04970,0x05650,0x16570,0x0d4a0,0x0ea50,0x06e35,0x0aa55,0x0a630,0x046d0,0x0a8d0,0x0ab50,0x04b50,0x0a950,0x04b50,0x1b275,0x06a30,0x06d30,0x0af40,0x0ab50,0x04630,0x07a30,0x0aa50,0x0b550,0x19250,0x0b550,0x0a930,0x06a30,0x0ab50,0x04bb0,0x0a870,0x0a930,0x0a4d0,0x0a970,0x0a450,0x0b270,0x06d30,0x0af50,0x0ab60,0x09370,0x04af0,0x0a6b0,0x0a570,0x05370,0x0a9b0,0x04970,0x064b0,0x0a570,0x16550,0x05270,0x0a930,0x0a4a0,0x0aa50,0x1b275,0x06d30,0x0ada0,0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x16a50,0x0ed25,0x083b0,0x04970,0x05650,0x16570,0x0d4a0,0x0ea50,0x16a90,0x0aad5,0x052a0,0x0a6d0,0x0ab50,0x04b60,0x0a550,0x0a540,0x0a6d0,0x0a930,0x0aa50,0x1b2b0,0x068d0,0x0a950,0x04b50,0x0a520,0x0a5d0,0x0b5a0,0x0a6d0,0x0a570,0x056d0,0x0aa50,0x0b5a0,0x04650,0x0a550,0x1d2a0,0x1b550,0x0a6a0,0x0a5d0,0x0a5b0,0x0a6a0,0x0a9b0,0x0aa50,0x0b2a0,0x1d5b0,0x1b2b0,0x0a930,0x0b550,0x0a570,0x0a4a0,0x0aa50,0x1b255,0x06d30,0x0ada0,0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x16a50,0x0ed25,0x083b0,0x04970,0x05650,0x16570,0x0d4a0,0x0ea50,0x06e35,0x0aa55,0x0a630,0x046d0,0x0a8d0,0x0ab50,0x04b50,0x0a950,0x04b50,0x1b275,0x06a30,0x06d30,0x0af40,0x0ab50,0x04630,0x07a30,0x0aa50,0x0b550,0x19250,0x0b550];
const TG = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const DZ = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const LMS = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
const LDS = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
function lYearDays(y) { var s=348; for(var i=0x8000;i>0x8;i>>=1) s+=(LUNAR_INFO_A[y-1900]&i)?1:0; return s+((LUNAR_INFO_A[y-1900]&0xf)?((LUNAR_INFO_A[y-1900]&0x10000)?30:29):0); }
function lMonthDays(y,m) { return (LUNAR_INFO_A[y-1900]&(0x10000>>m))?30:29; }
function lLeap(y) { return LUNAR_INFO_A[y-1900]&0xf; }
function lLeapDays(y) { return lLeap(y)?((LUNAR_INFO_A[y-1900]&0x10000)?30:29):0; }
function solar2lunarStr(dateStr) {
  if(!dateStr) return '';
  var p=dateStr.split('-'); if(p.length!==3) return '';
  var y=parseInt(p[0]),m=parseInt(p[1]),d=parseInt(p[2]); if(!y||!m||!d) return '';
  if(y<1901||y>2100) return '';
  try {
    var off=Math.floor((Date.UTC(y,m-1,d)-Date.UTC(1900,0,31))/86400000);
    var ly=1900,t=0;
    for(ly=1900;ly<2101&&off>0;ly++){t=lYearDays(ly);off-=t;}
    if(off<0){off+=t;ly--;}
    var leap=lLeap(ly),isLeap=false,lm=1,dim=0;
    for(lm=1;lm<13&&off>=0;lm++){
      if(leap>0&&lm===leap+1&&!isLeap){lm--;isLeap=true;dim=lLeapDays(ly);}
      else{dim=lMonthDays(ly,lm-1);}
      off-=dim; if(isLeap&&lm===leap+1)isLeap=false;
    }
    if(off<0){off+=dim;lm--;}
    var ld=off+1;
    var gz=TG[(ly-4)%10]+DZ[(ly-4)%12];
    var mn=(isLeap?'闰':'')+LMS[lm-1]+'月';
    var dn=LDS[ld-1];
    return '农历'+gz+'年'+mn+dn;
  } catch(e){ return ''; }
}
function autoFillLunar() {
  var dateVal = document.getElementById('cfg-date').value;
  var lunarField = document.getElementById('cfg-lunar');
  if (!dateVal) return;
  var auto = solar2lunarStr(dateVal);
  if (auto) { lunarField.value = auto; showToast('农历已自动填入：' + auto, 'success'); }
}

// ================== 婚礼时间与喜宴流程联动 ==================

/** 判断流程项是否为"喜宴"类项目 */
function isBanquetEvent(title) {
  if (!title) return false;
  var t = title.trim();
  return t === '喜宴' || t === '婚宴' || t === '宴席' || t === '婚宴开始' || t.indexOf('宴') > -1;
}

/** 基础配置婚礼时间变更 → 同步到流程中的喜宴时间 */
function syncWeddingTimeToEvents() {
  var newTime = document.getElementById('cfg-time').value;
  if (!newTime) return;
  var rows = document.querySelectorAll('#eventsList .event-edit-row');
  var synced = false;
  rows.forEach(function(row) {
    var titleEl = row.querySelector('.evt-title');
    var timeEl = row.querySelector('.evt-time');
    if (titleEl && timeEl && isBanquetEvent(titleEl.value)) {
      timeEl.value = newTime;
      synced = true;
    }
  });
  if (synced) showToast('喜宴时间已同步为 ' + newTime, 'success');
}

/** 流程中喜宴时间变更 → 同步到基础配置婚礼时间 */
function syncEventTimeToWedding() {
  var rows = document.querySelectorAll('#eventsList .event-edit-row');
  rows.forEach(function(row) {
    var titleEl = row.querySelector('.evt-title');
    var timeEl = row.querySelector('.evt-time');
    if (titleEl && timeEl && isBanquetEvent(titleEl.value)) {
      var t = timeEl.value;
      if (t) {
        var weddingTimeEl = document.getElementById('cfg-time');
        if (weddingTimeEl.value !== t) {
          weddingTimeEl.value = t;
          showToast('婚礼时间已同步为 ' + t, 'success');
        }
      }
    }
  });
}

// ================== LOGO 上传管理 ==================
function handleLogoUpload(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 512 * 1024) { showToast('图片过大，请压缩到512KB以下', 'error'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var base64 = e.target.result;
    document.getElementById('cfg-logoImage').value = base64;
    document.getElementById('logoPreview').src = base64;
    showToast('LOGO已加载，点击保存生效', 'success');
  };
  reader.onerror = function() { showToast('读取图片失败', 'error'); };
  reader.readAsDataURL(file);
}

function clearLogo() {
  document.getElementById('cfg-logoImage').value = '';
  document.getElementById('logoPreview').src = '/img/logo';
  showToast('LOGO已清除，将使用默认囍字LOGO', 'success');
}

// ================== 配置管理 ==================
function loadConfig() {
  fetch('/api/config').then(r => r.json()).then(data => {
    currentConfig = data;
    document.getElementById('cfg-groom').value = data.groomName || '';
    document.getElementById('cfg-bride').value = data.brideName || '';
    document.getElementById('cfg-father').value = data.fatherName || '';
    document.getElementById('cfg-mother').value = data.motherName || '';
    document.getElementById('cfg-date').value = data.weddingDate || '';
    document.getElementById('cfg-date').onchange = autoFillLunar;
    document.getElementById('cfg-time').value = data.weddingTime || '';
    document.getElementById('cfg-time').onchange = syncWeddingTimeToEvents;
    document.getElementById('cfg-lunar').value = data.lunarDate || '';
    document.getElementById('cfg-venue').value = data.venue || '';
    document.getElementById('cfg-venueHall').value = data.venueHall || '';
    document.getElementById('cfg-address').value = data.address || '';
    document.getElementById('cfg-venueDesc').value = data.venueDesc || '';
    document.getElementById('cfg-navKeyword').value = data.navKeyword || '';
    document.getElementById('cfg-navUrl').value = data.navUrl || '';
    document.getElementById('cfg-template').value = data.template || 'classic';
    document.getElementById('cfg-bgImage').value = data.bgImage || '';
    document.getElementById('cfg-bgMusic').value = data.bgMusic || '';
    document.getElementById('cfg-statsApi').value = data.statsApi || '';
    // LOGO 加载
    var logoVal = data.logoImage || '';
    document.getElementById('cfg-logoImage').value = logoVal;
    document.getElementById('logoPreview').src = logoVal || '/img/logo';
    const t = data.text || {};
    document.getElementById('cfg-title').value = t.title || '';
    document.getElementById('cfg-invitation').value = t.invitation || '';
    document.getElementById('cfg-poem').value = t.poem || '';
    document.getElementById('cfg-intro').value = t.intro || '';
    document.getElementById('cfg-ending').value = t.ending || '';
    document.getElementById('cfg-quote').value = t.quote || '';
    document.getElementById('cfg-invitationText').value = t.invitationText || '';
    const f = data.features || {};
    document.getElementById('feat-music').checked = f.music !== false;
    document.getElementById('feat-bgImage').checked = f.bgImage !== false;
    document.getElementById('feat-countdown').checked = f.countdown !== false;
    document.getElementById('feat-rsvp').checked = f.rsvp !== false;
    document.getElementById('feat-stats').checked = f.stats !== false;
    document.getElementById('feat-story').checked = f.story !== false;
    document.getElementById('feat-events').checked = f.events !== false;
    document.getElementById('feat-petals').checked = f.petals !== false;
    document.getElementById('feat-lanterns').checked = f.lanterns !== false;
    // 渲染流程列表
    renderEvents(data.events || []);
    // 渲染故事列表
    renderStory(data.story || []);
  }).catch(() => showToast('加载配置失败', 'error'));
}

function saveConfig() {
  const config = {
    groomName: document.getElementById('cfg-groom').value,
    brideName: document.getElementById('cfg-bride').value,
    fatherName: document.getElementById('cfg-father').value,
    motherName: document.getElementById('cfg-mother').value,
    weddingDate: document.getElementById('cfg-date').value,
    weddingTime: document.getElementById('cfg-time').value,
    lunarDate: document.getElementById('cfg-lunar').value,
    venue: document.getElementById('cfg-venue').value,
    venueHall: document.getElementById('cfg-venueHall').value,
    address: document.getElementById('cfg-address').value,
    venueDesc: document.getElementById('cfg-venueDesc').value,
    navKeyword: document.getElementById('cfg-navKeyword').value,
    navUrl: document.getElementById('cfg-navUrl').value,
    template: document.getElementById('cfg-template').value,
    bgImage: document.getElementById('cfg-bgImage').value,
    bgMusic: document.getElementById('cfg-bgMusic').value,
    logoImage: document.getElementById('cfg-logoImage').value,
    statsApi: document.getElementById('cfg-statsApi').value,
    text: {
      title: document.getElementById('cfg-title').value,
      invitation: document.getElementById('cfg-invitation').value,
      poem: document.getElementById('cfg-poem').value,
      intro: document.getElementById('cfg-intro').value,
      ending: document.getElementById('cfg-ending').value,
      quote: document.getElementById('cfg-quote').value,
      invitationText: document.getElementById('cfg-invitationText').value,
    },
    features: {
      music: document.getElementById('feat-music').checked,
      bgImage: document.getElementById('feat-bgImage').checked,
      countdown: document.getElementById('feat-countdown').checked,
      rsvp: document.getElementById('feat-rsvp').checked,
      stats: document.getElementById('feat-stats').checked,
      story: document.getElementById('feat-story').checked,
      events: document.getElementById('feat-events').checked,
      petals: document.getElementById('feat-petals').checked,
      lanterns: document.getElementById('feat-lanterns').checked,
    },
    events: collectEvents(),
    story: collectStory(),
  };
  Object.assign(currentConfig, config);
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': AUTH_TOKEN },
    body: JSON.stringify(currentConfig)
  }).then(r => r.json()).then(() => {
    showToast('保存成功', 'success');
  }).catch(() => showToast('保存失败', 'error'));
}

// ================== 婚礼流程编辑 ==================
function renderEvents(events) {
  const list = document.getElementById('eventsList');
  if (!list) return;
  if (!events.length) events = [{ time: '', title: '', desc: '' }];
  list.innerHTML = events.map(function(e, i) {
    return '<div class="event-edit-row" data-idx="' + i + '">'
      + '<input type="time" class="evt-time" value="' + (e.time || '') + '" placeholder="时间" onchange="syncEventTimeToWedding()">'
      + '<input type="text" class="evt-title" value="' + (e.title || '') + '" placeholder="流程名称（如：婚礼仪式）" onchange="syncEventTimeToWedding()">'
      + '<input type="text" class="evt-desc" value="' + (e.desc || '') + '" placeholder="描述（选填）">'
      + '<button class="btn btn-danger" onclick="removeEventItem(' + i + ')">删除</button>'
      + '</div>';
  }).join('');
}

function addEventItem() {
  const list = document.getElementById('eventsList');
  const i = list.children.length;
  const div = document.createElement('div');
  div.className = 'event-edit-row';
  div.setAttribute('data-idx', i);
  div.innerHTML = '<input type="time" class="evt-time" value="" placeholder="时间" onchange="syncEventTimeToWedding()">'
    + '<input type="text" class="evt-title" value="" placeholder="流程名称" onchange="syncEventTimeToWedding()">'
    + '<input type="text" class="evt-desc" value="" placeholder="描述（选填）">'
    + '<button class="btn btn-danger" onclick="removeEventItem(' + i + ')">删除</button>';
  list.appendChild(div);
}

function removeEventItem(idx) {
  const list = document.getElementById('eventsList');
  const rows = list.querySelectorAll('.event-edit-row');
  // 从后往前删，避免索引偏移
  if (rows[idx]) rows[idx].remove();
  // 重新编号
  var rows_after = list.querySelectorAll('.event-edit-row');
  rows_after.forEach(function(row, i) {
    row.setAttribute('data-idx', i);
    var btn = row.querySelector('button');
    if (btn) btn.setAttribute('onclick', 'removeEventItem(' + i + ')');
  });
}

function collectEvents() {
  const rows = document.querySelectorAll('#eventsList .event-edit-row');
  const events = [];
  rows.forEach(function(row) {
    var time = row.querySelector('.evt-time').value.trim();
    var title = row.querySelector('.evt-title').value.trim();
    var desc = row.querySelector('.evt-desc').value.trim();
    if (title) events.push({ time: time, title: title, desc: desc });
  });
  return events;
}

// ================== 爱情故事编辑 ==================
function renderStory(story) {
  const list = document.getElementById('storyList');
  if (!list) return;
  if (!story.length) story = [{ title: '', content: '' }];
  list.innerHTML = story.map(function(s, i) {
    return '<div class="story-edit-row" data-idx="' + i + '">'
      + '<input type="text" class="story-title" value="' + (s.title || '') + '" placeholder="章节标题（如：初遇）">'
      + '<textarea class="story-content" placeholder="章节内容">' + (s.content || '') + '</textarea>'
      + '<button class="btn btn-danger" onclick="removeStoryItem(' + i + ')">删除</button>'
      + '</div>';
  }).join('');
}

function addStoryItem() {
  const list = document.getElementById('storyList');
  const i = list.children.length;
  const div = document.createElement('div');
  div.className = 'story-edit-row';
  div.setAttribute('data-idx', i);
  div.innerHTML = '<input type="text" class="story-title" value="" placeholder="章节标题">'
    + '<textarea class="story-content" placeholder="章节内容"></textarea>'
    + '<button class="btn btn-danger" onclick="removeStoryItem(' + i + ')">删除</button>';
  list.appendChild(div);
}

function removeStoryItem(idx) {
  var list = document.getElementById('storyList');
  var rows = list.querySelectorAll('.story-edit-row');
  if (rows[idx]) rows[idx].remove();
  var rows_after = list.querySelectorAll('.story-edit-row');
  rows_after.forEach(function(row, i) {
    row.setAttribute('data-idx', i);
    var btn = row.querySelector('button');
    if (btn) btn.setAttribute('onclick', 'removeStoryItem(' + i + ')');
  });
}

function collectStory() {
  var rows = document.querySelectorAll('#storyList .story-edit-row');
  var story = [];
  rows.forEach(function(row) {
    var title = row.querySelector('.story-title').value.trim();
    var content = row.querySelector('.story-content').value.trim();
    if (title) story.push({ title: title, content: content });
  });
  return story;
}

// ================== 宾客管理 ==================
// 添加单个宾客
function addSingleGuest() {
  const nameEl = document.getElementById('singleGuestName');
  const titleEl = document.getElementById('singleGuestTitle');
  const phoneEl = document.getElementById('singleGuestPhone');
  const name = nameEl.value.trim();
  if (!name) { showToast('请输入宾客姓名', 'error'); return; }
  const title = titleEl.value;
  const phone = phoneEl.value.trim();
  fetch('/api/guests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': AUTH_TOKEN },
    body: JSON.stringify({ guests: [{ name: name, title: title, phone: phone }] })
  }).then(r => r.json()).then(data => {
    if (data.success) {
      showToast('已添加：' + name + (title ? ' ' + title : '') + '，链接：' + location.origin + '/i/' + data.guestIds[0], 'success');
      nameEl.value = ''; titleEl.value = ''; phoneEl.value = '';
      loadGuests();
    } else {
      showToast('添加失败', 'error');
    }
  }).catch(() => showToast('添加失败', 'error'));
}

// 批量导入
function importGuests() {
  const text = document.getElementById('guestImport').value.trim();
  if (!text) { showToast('请输入宾客名单', 'error'); return; }
  const lines = text.split('\\n').map(l => l.trim()).filter(l => l);
  const guests = lines.map(l => {
    const parts = l.split(',');
    const name = parts[0] ? parts[0].trim() : '';
    // 第二列可能是称谓也可能是电话，判断逻辑：长度<=4且中文则为称谓
    let title = '', phone = '';
    if (parts[1]) {
      const v = parts[1].trim();
      if (/^[\u4e00-\u9fa5]{1,4}$/.test(v)) { title = v; phone = (parts[2]||'').trim(); }
      else { phone = v; }
    }
    return { name: name, title: title, phone: phone };
  });
  fetch('/api/guests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': AUTH_TOKEN },
    body: JSON.stringify({ guests })
  }).then(r => r.json()).then(data => {
    showToast('导入 ' + data.added + ' 位宾客成功', 'success');
    document.getElementById('guestImport').value = '';
    loadGuests();
  }).catch(() => showToast('导入失败', 'error'));
}

function loadGuests() {
  fetch('/api/guests', { headers: { 'X-Auth-Token': AUTH_TOKEN } })
    .then(r => r.json()).then(data => {
      guestsData = data.guests || [];
      const list = document.getElementById('guestList');
      const base = location.origin + '/i/';
      list.innerHTML = guestsData.map(function(g) {
        const rsvpText = g.rsvp ? ({attending:'到场', maybe:'待定', declined:'不出席'}[g.rsvp] || '-') : '未回复';
        const url = base + g.id;
        return '<tr><td>' + g.name + '</td><td>' + (g.title || '-') + '</td><td>' + (g.phone || '-') + '</td><td>' + rsvpText + '</td>'
          + '<td><a class="guest-link" href="' + url + '" target="_blank">查看请帖</a></td>'
          + '<td><button class="btn btn-danger" onclick="deleteGuest(\\'' + g.id + '\\')">删除</button></td></tr>';
      }).join('');
    }).catch(function() { showToast('加载宾客失败', 'error'); });
}

function deleteGuest(id) {
  if (!confirm('确认删除该宾客？')) return;
  fetch('/api/guests/' + id, { method: 'DELETE', headers: { 'X-Auth-Token': AUTH_TOKEN } })
    .then(r => r.json()).then(() => { showToast('已删除', 'success'); loadGuests(); })
    .catch(() => showToast('删除失败', 'error'));
}

// ================== 专属链接 ==================
function refreshLinks() {
  fetch('/api/guests', { headers: { 'X-Auth-Token': AUTH_TOKEN } })
    .then(r => r.json()).then(data => {
      guestsData = data.guests || [];
      const list = document.getElementById('linkList');
      const base = location.origin + '/i/';
      list.innerHTML = guestsData.map(function(g) {
        const url = base + g.id;
        return '<tr><td>' + g.name + '</td>'
          + '<td><a class="guest-link" href="' + url + '" target="_blank">' + url + '</a></td>'
          + '<td><button class="btn btn-primary" onclick="copyLink(\\'' + url + '\\')">复制</button></td></tr>';
      }).join('');
    }).catch(function() { showToast('加载失败', 'error'); });
}

function exportLinks() {
  const base = location.origin + '/i/';
  if (guestsData.length === 0) { showToast('请先导入宾客', 'error'); return; }
  var lines = guestsData.map(function(g) { return g.name + (g.title ? '\\t' + g.title : '') + '\\t' + base + g.id; });
  var content = '姓名\\t称谓\\t专属链接\\n' + lines.join('\\n');
  var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'guest-links.txt';
  a.click();
  showToast('已导出 ' + guestsData.length + ' 条链接', 'success');
}

function copyLink(url) {
  navigator.clipboard.writeText(url).then(function() { showToast('链接已复制', 'success'); });
}

// ================== 统计 ==================
function loadStats() {
  fetch('/api/stats', { headers: { 'X-Auth-Token': AUTH_TOKEN } })
    .then(r => r.json()).then(data => {
      document.getElementById('stat-views').textContent = data.views || 0;
      document.getElementById('stat-guests').textContent = data.guestCount || 0;
      document.getElementById('stat-rsvp').textContent = data.rsvpCount || 0;
      document.getElementById('stat-attending').textContent = data.attendingCount || 0;
    }).catch(() => showToast('加载统计失败', 'error'));
}

// ================== Toast ==================
function showToast(msg, type) {
  var t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'success');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.remove(); }, 3000);
}
</script>
</body>
</html>`;
}

// ================== Worker 入口 ==================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS 预检
    if (method === 'OPTIONS') return handleCORS();

    // ================== 页面路由 ==================

    // 请帖页面（根路径）
    if ((path === '/' || path === '/index.html') && method === 'GET') {
      return await serveInvitation(env, null, request.url);
    }

    // 专属请帖页面（/i/:guestId）
    const guestMatch = path.match(/^\/i\/([a-z0-9]+)$/);
    if (guestMatch && method === 'GET') {
      return await serveInvitation(env, guestMatch[1], request.url);
    }

    // 管理后台页面
    if ((path === '/admin' || path === '/admin/') && method === 'GET') {
      return htmlResponse(getAdminPage());
    }

    // LOGO图片接口 — 供微信分享 og:image 使用
    if (path === '/img/logo' && method === 'GET') {
      return await serveLogo(env);
    }

    // ================== API 路由 ==================

    // 登录
    if (path === '/api/login' && method === 'POST') {
      const body = await request.json();
      const adminPwd = env.ADMIN_PASSWORD || 'wedding2026'; // 【可配置】默认管理密码
      if (body.password === adminPwd) {
        const token = genToken();
        await env.WEDDING_KV.put(`session:${token}`, 'valid', { expirationTtl: 86400 });
        return jsonResponse({ success: true, token });
      }
      return jsonResponse({ success: false, error: '密码错误' }, 401);
    }

    // 获取公开配置
    if (path === '/api/config' && method === 'GET') {
      const config = await getConfig(env);
      return jsonResponse(config);
    }

    // 保存配置（需认证）
    if (path === '/api/config' && method === 'POST') {
      if (!await checkAuth(request, env)) return jsonResponse({ error: '未授权' }, 401);
      const body = await request.json();
      await env.WEDDING_KV.put('config', JSON.stringify(body));
      return jsonResponse({ success: true });
    }

    // 获取宾客列表（需认证）
    if (path === '/api/guests' && method === 'GET') {
      if (!await checkAuth(request, env)) return jsonResponse({ error: '未授权' }, 401);
      const guests = await getGuests(env);
      for (const g of guests) {
        const rsvp = await env.WEDDING_KV.get(`rsvp:${g.id}`);
        if (rsvp) g.rsvp = JSON.parse(rsvp).status;
      }
      return jsonResponse({ guests });
    }

    // 添加/批量导入宾客（需认证）
    if (path === '/api/guests' && method === 'POST') {
      if (!await checkAuth(request, env)) return jsonResponse({ error: '未授权' }, 401);
      const body = await request.json();
      const guests = await getGuests(env);
      let added = 0;
      const guestIds = [];
      for (const g of (body.guests || [])) {
        if (!g.name) continue; // 跳过无名字的行
        const id = genId();
        guests.push({ id, name: g.name, title: g.title || '', phone: g.phone || '' });
        guestIds.push(id);
        added++;
      }
      await env.WEDDING_KV.put('guests', JSON.stringify(guests));
      return jsonResponse({ success: true, added, guestIds });
    }

    // 删除宾客（需认证）
    const deleteMatch = path.match(/^\/api\/guests\/([a-z0-9]+)$/);
    if (deleteMatch && method === 'DELETE') {
      if (!await checkAuth(request, env)) return jsonResponse({ error: '未授权' }, 401);
      const guests = await getGuests(env);
      const filtered = guests.filter(g => g.id !== deleteMatch[1]);
      await env.WEDDING_KV.put('guests', JSON.stringify(filtered));
      await env.WEDDING_KV.delete(`rsvp:${deleteMatch[1]}`);
      return jsonResponse({ success: true });
    }

    // RSVP 提交（公开）
    if (path === '/api/rsvp' && method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch(e) {}
      if (body.guestId) {
        await env.WEDDING_KV.put(`rsvp:${body.guestId}`, JSON.stringify({
          status: body.status,
          count: body.count || null,
          message: body.message || '',
          timestamp: Date.now(),
        }));
      }
      return jsonResponse({ success: true });
    }

    // 访问统计上报（公开）
    if (path === '/api/view' && method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch(e) {}
      const views = parseInt(await env.WEDDING_KV.get('stat:views') || '0') + 1;
      await env.WEDDING_KV.put('stat:views', String(views));
      if (body.guestId) {
        const gv = parseInt(await env.WEDDING_KV.get(`stat:view:${body.guestId}`) || '0') + 1;
        await env.WEDDING_KV.put(`stat:view:${body.guestId}`, String(gv));
      }
      return jsonResponse({ success: true });
    }

    // 获取统计数据（需认证）
    if (path === '/api/stats' && method === 'GET') {
      if (!await checkAuth(request, env)) return jsonResponse({ error: '未授权' }, 401);
      const views = parseInt(await env.WEDDING_KV.get('stat:views') || '0');
      const guests = await getGuests(env);
      let rsvpCount = 0, attendingCount = 0;
      for (const g of guests) {
        const rsvp = await env.WEDDING_KV.get(`rsvp:${g.id}`);
        if (rsvp) {
          const r = JSON.parse(rsvp);
          rsvpCount++;
          if (r.status === 'attending') attendingCount += r.count || 1;
        }
      }
      return jsonResponse({
        views,
        guestCount: guests.length,
        rsvpCount,
        attendingCount,
      });
    }

    // 404
    return new Response('Not Found', { status: 404 });
  },
};

// ================== KV 辅助函数 ==================

/** 获取配置（首次自动初始化默认值） */
async function getConfig(env) {
  let config = await env.WEDDING_KV.get('config');
  if (!config) {
    await env.WEDDING_KV.put('config', JSON.stringify(DEFAULT_CONFIG));
    return DEFAULT_CONFIG;
  }
  const parsed = JSON.parse(config);
  // 配置版本迁移：强制更新地址相关字段为最新值
  const cfgVersion = parsed._cfgVersion || 0;
  if (cfgVersion < 2) {
    // v2: 更新场地地址和导航链接
    parsed.venue = DEFAULT_CONFIG.venue;
    parsed.venueHall = DEFAULT_CONFIG.venueHall;
    parsed.address = DEFAULT_CONFIG.address;
    parsed.navKeyword = DEFAULT_CONFIG.navKeyword;
    if (!parsed.navUrl) parsed.navUrl = DEFAULT_CONFIG.navUrl;
    parsed._cfgVersion = 2;
    await env.WEDDING_KV.put('config', JSON.stringify(parsed));
  }
  // 合并默认值（确保新增字段有值）
  return { ...DEFAULT_CONFIG, ...parsed, features: { ...DEFAULT_CONFIG.features, ...(parsed.features || {}) }, text: { ...DEFAULT_CONFIG.text, ...(parsed.text || {}) } };
}

/** 获取宾客列表 */
async function getGuests(env) {
  const data = await env.WEDDING_KV.get('guests');
  return data ? JSON.parse(data) : [];
}

/** 返回请帖页面 */
async function serveInvitation(env, guestId, requestUrl) {
  const config = await getConfig(env);
  let guest = null;
  if (guestId) {
    const guests = await getGuests(env);
    guest = guests.find(g => g.id === guestId);
  }
  const html = getInvitationPage(config, guest, requestUrl);
  return htmlResponse(html);
}

/** 返回LOGO图片 — 供微信分享 og:image 使用 */
async function serveLogo(env) {
  const config = await getConfig(env);
  const logo = config.logoImage;
  if (!logo) {
    // 默认LOGO：红底金色囍字 300x300 PNG
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
      <rect width="300" height="300" fill="#c41e3a"/>
      <text x="150" y="210" font-size="180" fill="#d4af37" text-anchor="middle" font-family="serif" font-weight="bold">囍</text>
    </svg>`;
    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' } });
  }
  // 如果是 base64 data URI
  if (logo.startsWith('data:')) {
    const match = logo.match(/^data:(image\/[\w+]+);base64,(.+)$/);
    if (match) {
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Response(bytes, { headers: { 'Content-Type': match[1], 'Cache-Control': 'public, max-age=3600' } });
    }
  }
  // 如果是 URL，重定向
  if (logo.startsWith('http')) {
    return Response.redirect(logo, 302);
  }
  return new Response('Not Found', { status: 404 });
}
