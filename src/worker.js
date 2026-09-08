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
  groomName: '新郎',           // 新郎姓名
  brideName: '新娘',           // 新娘姓名
  weddingDate: '2026-10-01',   // 婚礼日期 YYYY-MM-DD
  weddingTime: '11:30',        // 婚礼时间 HH:MM
  venue: 'XX大酒店',           // 婚礼地点
  address: 'XX市XX区XX路XX号',  // 详细地址

  // --- CF文件库资源 ---
  // 背景图URL（从CF文件库调用，留空则使用默认渐变背景）
  bgImage: '',
  // 背景音乐URL（从CF文件库调用，留空则不显示音乐按钮）
  bgMusic: '',

  // --- 统计API ---
  // 统计表格API地址（留空则使用内置统计）
  statsApi: '',

  // --- 模板/主题 ---
  template: 'classic',  // 可选: classic | elegant | modern

  // --- 功能开关 ---
  features: {
    music: true,        // 背景音乐开关
    bgImage: true,      // 背景图开关
    countdown: true,   // 倒计时开关
    rsvp: true,         // RSVP回执开关
    stats: true,        // 统计功能开关
    gallery: false,     // 相册开关（预留）
  },

  // --- 文案 ---
  text: {
    title: '我们要结婚啦',
    intro: '诚邀您参加我们的婚礼，共同见证幸福时刻',
    ending: '期待您的到来',
    invitation: '诚挚邀请',
  },
};

// ================== 工具函数 ==================

/** 生成随机ID */
function genId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/** 简单的 session token */
function genToken() {
  return genId() + genId();
}

/** 验证管理员密码 */
function checkAuth(request, env) {
  const token = request.headers.get('X-Auth-Token') || '';
  return env.ADMIN_SESSIONS?.get(`session:${token}`) === 'valid';
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

// ================== 页面：请帖展示 ==================
function getInvitationPage(config, guest) {
  const guestName = guest ? guest.name : '';
  const guestId = guest ? guest.id : '';
  const features = config.features || {};

  // 背景样式
  const bgStyle = features.bgImage && config.bgImage
    ? `background: linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.4)), url('${config.bgImage}') center/cover no-repeat fixed;`
    : `background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);`;

  // 主题样式
  const themeColors = {
    classic: { primary: '#c0392b', secondary: '#e74c3c', accent: '#f1c40f', bg: '#fff5f5' },
    elegant: { primary: '#2c3e50', secondary: '#34495e', accent: '#d4af37', bg: '#fafafa' },
    modern: { primary: '#e91e63', secondary: '#f06292', accent: '#00bcd4', bg: '#f5f5f5' },
  };
  const tc = themeColors[config.template] || themeColors.classic;

  // 倒计时目标
  const targetDate = `${config.weddingDate}T${config.weddingTime}:00`;

  // 音乐按钮HTML
  const musicBtn = features.music && config.bgMusic ? `
    <div id="musicBtn" class="music-btn" onclick="toggleMusic()">
      <span id="musicIcon">🔇</span>
      <div class="music-notes" id="musicNotes">
        <span>♪</span><span>♫</span><span>♪</span>
      </div>
    </div>
    <audio id="bgMusic" loop preload="none">
      <source src="${config.bgMusic}" type="audio/mpeg">
    </audio>` : '';

  // RSVP表单
  const rsvpSection = features.rsvp ? `
    <div class="rsvp-section" id="rsvpSection">
      <h2 class="section-title" style="color: ${tc.accent};">出席回执</h2>
      <div class="rsvp-form">
        <select id="rsvpStatus" class="rsvp-select">
          <option value="">请选择...</option>
          <option value="attending">🎉 一定到场</option>
          <option value="maybe">🤔 尽量到场</option>
          <option value="declined">😢 无法出席</option>
        </select>
        <input type="number" id="rsvpCount" class="rsvp-input" placeholder="出席人数" min="1" max="10">
        <textarea id="rsvpMessage" class="rsvp-textarea" placeholder="祝福语（选填）" rows="2"></textarea>
        <button class="rsvp-submit" onclick="submitRSVP()" style="background: ${tc.primary};">提交回执</button>
      </div>
      <div id="rsvpResult" class="rsvp-result"></div>
    </div>` : '';

  // 宾客个性化问候
  const greeting = guestName ? `<p class="guest-greeting">尊敬的 <strong>${guestName}</strong></p>` : '';

  // 统计上报（如果启用）
  const statsScript = features.stats ? `
    <script>
      // 上报页面访问（内置统计）
      fetch('/api/view', { method: 'POST' }).catch(()=>{});
      ${guestId ? `fetch('/api/view', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({guestId:'${guestId}'}) }).catch(()=>{});` : ''}
    </script>` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${config.text.title} - ${config.groomName} & ${config.brideName}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  ${bgStyle}
  min-height: 100vh;
  font-family: 'Georgia', 'STKaiti', '楷体', serif;
  color: #fff;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* 主容器 */
.container { width: 100%; max-width: 500px; padding: 2rem 1.5rem; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; }
/* 标题 */
.title-section { text-align: center; margin-bottom: 2rem; animation: fadeInUp 1s ease; }
.title-section h1 { font-size: 2.2rem; color: ${tc.accent}; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); margin-bottom: 0.5rem; letter-spacing: 2px; }
.title-section .subtitle { font-size: 1.1rem; opacity: 0.9; }
/* 名字 */
.names { font-size: 3rem; font-weight: bold; margin: 1.5rem 0; text-shadow: 2px 2px 8px rgba(0,0,0,0.5); animation: fadeInUp 1.2s ease; }
.names .and { font-size: 1.5rem; margin: 0 0.5rem; opacity: 0.7; }
/* 日期时间 */
.date-section { text-align: center; margin: 1.5rem 0; animation: fadeInUp 1.4s ease; }
.date-section .date { font-size: 1.6rem; color: ${tc.accent}; }
.date-section .time { font-size: 1.2rem; margin-top: 0.3rem; opacity: 0.9; }
/* 倒计时 */
.countdown { display: flex; justify-content: center; gap: 0.8rem; margin: 1.5rem 0; animation: fadeInUp 1.6s ease; }
.countdown-box { background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); border-radius: 12px; padding: 0.8rem 0.5rem; min-width: 65px; text-align: center; }
.countdown-box .num { font-size: 1.8rem; font-weight: bold; color: ${tc.accent}; }
.countdown-box .label { font-size: 0.7rem; opacity: 0.8; margin-top: 0.2rem; }
/* 地点 */
.venue-section { text-align: center; margin: 1.5rem 0; animation: fadeInUp 1.8s ease; }
.venue-section .venue-name { font-size: 1.3rem; color: ${tc.accent}; }
.venue-section .venue-addr { font-size: 0.9rem; opacity: 0.8; margin-top: 0.3rem; }
/* 邀请文案 */
.invite-text { text-align: center; margin: 1.5rem 0; font-size: 1rem; line-height: 1.8; opacity: 0.9; animation: fadeInUp 2s ease; }
.guest-greeting { font-size: 1.1rem; text-align: center; margin-bottom: 0.5rem; color: ${tc.accent}; animation: fadeInUp 0.8s ease; }
/* RSVP */
.rsvp-section { width: 100%; margin: 1.5rem 0; animation: fadeInUp 2.2s ease; }
.rsvp-form { display: flex; flex-direction: column; gap: 0.8rem; }
.rsvp-select, .rsvp-input, .rsvp-textarea { width: 100%; padding: 0.8rem; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; background: rgba(255,255,255,0.1); color: #fff; font-size: 1rem; backdrop-filter: blur(10px); }
.rsvp-select option { color: #333; }
.rsvp-textarea { resize: none; }
.rsvp-submit { padding: 0.8rem; border: none; border-radius: 8px; color: #fff; font-size: 1.1rem; cursor: pointer; transition: transform 0.2s, opacity 0.2s; }
.rsvp-submit:hover { transform: scale(1.02); opacity: 0.9; }
.rsvp-result { text-align: center; margin-top: 1rem; font-size: 1rem; }
/* 音乐按钮 */
.music-btn { position: fixed; bottom: 20px; right: 20px; width: 50px; height: 50px; border-radius: 50%; background: ${tc.primary}; border: 2px solid ${tc.accent}; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.5rem; z-index: 999; box-shadow: 0 2px 10px rgba(0,0,0,0.3); transition: all 0.3s; }
.music-btn.playing { animation: pulse 2s infinite; }
@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(241,196,15,0.4); } 50% { box-shadow: 0 0 0 15px rgba(241,196,15,0); } }
.music-notes { position: absolute; top: -30px; left: 50%; transform: translateX(-50%); pointer-events: none; opacity: 0; }
.music-notes span { position: absolute; font-size: 1rem; color: ${tc.accent}; animation: floatNote 2s infinite; }
.music-notes span:nth-child(1) { left: -15px; animation-delay: 0s; }
.music-notes span:nth-child(2) { left: 0; animation-delay: 0.5s; }
.music-notes span:nth-child(3) { left: 15px; animation-delay: 1s; }
.music-btn.playing .music-notes { opacity: 1; }
@keyframes floatNote { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-40px); opacity: 0; } }
/* 动画 */
@keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
/* 页脚 */
.footer { text-align: center; padding: 2rem 0; font-size: 0.8rem; opacity: 0.6; }
</style>
</head>
<body>
<div class="container">
  <div class="title-section">
    <p class="subtitle">${config.text.invitation || '诚挚邀请'}</p>
    <h1>${config.text.title}</h1>
  </div>
  ${greeting}
  <div class="names">
    ${config.groomName}<span class="and">&</span>${config.brideName}
  </div>
  ${features.countdown ? `
  <div class="countdown" id="countdown">
    <div class="countdown-box"><div class="num" id="cd-days">0</div><div class="label">天</div></div>
    <div class="countdown-box"><div class="num" id="cd-hours">0</div><div class="label">时</div></div>
    <div class="countdown-box"><div class="num" id="cd-mins">0</div><div class="label">分</div></div>
    <div class="countdown-box"><div class="num" id="cd-secs">0</div><div class="label">秒</div></div>
  </div>` : ''}
  <div class="date-section">
    <div class="date">${config.weddingDate}</div>
    <div class="time">${config.weddingTime}</div>
  </div>
  <div class="venue-section">
    <div class="venue-name">${config.venue}</div>
    <div class="venue-addr">${config.address}</div>
  </div>
  <div class="invite-text">
    <p>${config.text.intro}</p>
    <p style="margin-top:1rem; color:${tc.accent};">${config.text.ending}</p>
  </div>
  ${rsvpSection}
  <div class="footer">
    <p>${config.groomName} & ${config.brideName} 敬邀</p>
  </div>
</div>
${musicBtn}
<script>
// ================== 倒计时 ==================
${features.countdown ? `
const target = new Date('${targetDate}').getTime();
function updateCountdown() {
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) { document.getElementById('countdown').style.display = 'none'; return; }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  document.getElementById('cd-days').textContent = d;
  document.getElementById('cd-hours').textContent = h;
  document.getElementById('cd-mins').textContent = m;
  document.getElementById('cd-secs').textContent = s;
}
updateCountdown();
setInterval(updateCountdown, 1000);` : ''}

// ================== 背景音乐 ==================
let musicPlaying = false;
function toggleMusic() {
  const audio = document.getElementById('bgMusic');
  const btn = document.getElementById('musicBtn');
  const icon = document.getElementById('musicIcon');
  if (!audio) return;
  if (musicPlaying) {
    // 渐出
    fadeAudio(audio, false, () => { audio.pause(); icon.textContent = '🔇'; btn.classList.remove('playing'); musicPlaying = false; });
  } else {
    audio.play();
    icon.textContent = '🔊';
    btn.classList.add('playing');
    musicPlaying = true;
    // 渐入
    fadeAudio(audio, true);
  }
}
function fadeAudio(audio, fadeIn, callback) {
  const target = fadeIn ? 0.6 : 0;
  const start = fadeIn ? 0 : audio.volume;
  audio.volume = start;
  const step = fadeIn ? 0.02 : -0.02;
  const timer = setInterval(() => {
    audio.volume += step;
    if (fadeIn && audio.volume >= target) { audio.volume = target; clearInterval(timer); if (callback) callback(); }
    if (!fadeIn && audio.volume <= 0) { audio.volume = 0; clearInterval(timer); if (callback) callback(); }
  }, 50);
}

// ================== RSVP 提交 ==================
const GUEST_ID = '${guestId}';
function submitRSVP() {
  const status = document.getElementById('rsvpStatus').value;
  const count = document.getElementById('rsvpCount').value;
  const message = document.getElementById('rsvpMessage').value;
  const result = document.getElementById('rsvpResult');
  if (!status) { result.innerHTML = '<span style="color:#e74c3c;">请选择出席状态</span>'; return; }
  fetch('/api/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guestId: GUEST_ID, status, count: parseInt(count)||1, message })
  }).then(r => r.json()).then(data => {
    result.innerHTML = '<span style="color:#2ecc71;">✅ 回执已提交，感谢您的回复！</span>';
  }).catch(() => {
    result.innerHTML = '<span style="color:#e74c3c;">提交失败，请稍后重试</span>';
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
/* 登录页 */
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.login-box { background: #16213e; padding: 2.5rem; border-radius: 16px; width: 90%; max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
.login-box h1 { text-align: center; margin-bottom: 1.5rem; color: #e94560; font-size: 1.5rem; }
.login-box input { width: 100%; padding: 0.8rem; margin-bottom: 1rem; border: 1px solid #333; border-radius: 8px; background: #0f3460; color: #fff; font-size: 1rem; }
.login-box input:focus { border-color: #e94560; outline: none; }
.login-box button { width: 100%; padding: 0.8rem; border: none; border-radius: 8px; background: #e94560; color: #fff; font-size: 1.1rem; cursor: pointer; transition: opacity 0.2s; }
.login-box button:hover { opacity: 0.85; }
.login-error { color: #e74c3c; text-align: center; margin-top: 0.5rem; font-size: 0.9rem; display: none; }
/* 仪表盘 */
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
/* 开关 */
.toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; }
.toggle-row label { font-size: 0.95rem; }
.toggle { position: relative; width: 48px; height: 26px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #333; border-radius: 26px; transition: 0.3s; }
.toggle .slider:before { content: ''; position: absolute; height: 20px; width: 20px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.3s; }
.toggle input:checked + .slider { background: #e94560; }
.toggle input:checked + .slider:before { transform: translateX(22px); }
/* 按钮 */
.btn { padding: 0.6rem 1.2rem; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; transition: opacity 0.2s; }
.btn-primary { background: #e94560; color: #fff; }
.btn-success { background: #2ecc71; color: #fff; }
.btn-danger { background: #e74c3c; color: #fff; }
.btn:hover { opacity: 0.85; }
/* 表格 */
table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
th, td { padding: 0.6rem; text-align: left; border-bottom: 1px solid #333; font-size: 0.85rem; }
th { color: #e94560; }
.guest-link { color: #3498db; text-decoration: none; word-break: break-all; }
/* 统计卡片 */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; }
.stat-card { background: #0f3460; border-radius: 8px; padding: 1rem; text-align: center; }
.stat-card .num { font-size: 2rem; color: #e94560; font-weight: bold; }
.stat-card .label { font-size: 0.85rem; color: #aaa; margin-top: 0.3rem; }
/* 提示 */
.toast { position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem; border-radius: 8px; color: #fff; z-index: 9999; animation: slideIn 0.3s ease; }
.toast-success { background: #2ecc71; }
.toast-error { background: #e74c3c; }
@keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
/* 导入区域 */
.import-area { width: 100%; min-height: 100px; padding: 0.6rem; border: 1px solid #333; border-radius: 6px; background: #0f3460; color: #fff; font-size: 0.9rem; resize: vertical; }
.hint { font-size: 0.8rem; color: #888; margin-top: 0.3rem; }
</style>
</head>
<body>
<!-- 登录 -->
<div class="login-wrap" id="loginWrap">
  <div class="login-box">
    <h1>💒 婚礼请帖管理</h1>
    <input type="password" id="pwdInput" placeholder="请输入管理密码" onkeypress="if(event.key==='Enter')doLogin()">
    <button onclick="doLogin()">登录</button>
    <div class="login-error" id="loginError">密码错误，请重试</div>
  </div>
</div>

<!-- 仪表盘 -->
<div class="dashboard" id="dashboard">
  <div class="nav">
    <button class="nav-btn active" onclick="showPanel('config')">⚙️ 基础配置</button>
    <button class="nav-btn" onclick="showPanel('assets')">🖼️ 资源设置</button>
    <button class="nav-btn" onclick="showPanel('features')">🔧 功能开关</button>
    <button class="nav-btn" onclick="showPanel('text')">📝 文案编辑</button>
    <button class="nav-btn" onclick="showPanel('guests')">👥 宾客管理</button>
    <button class="nav-btn" onclick="showPanel('links')">🔗 专属链接</button>
    <button class="nav-btn" onclick="showPanel('stats')">📊 统计</button>
    <button class="nav-btn right" onclick="doLogout()">退出</button>
  </div>

  <!-- 基础配置 -->
  <div class="panel active" id="panel-config">
    <h2>基础配置</h2>
    <div class="form-group"><label>新郎姓名</label><input id="cfg-groom" type="text"></div>
    <div class="form-group"><label>新娘姓名</label><input id="cfg-bride" type="text"></div>
    <div class="form-group"><label>婚礼日期</label><input id="cfg-date" type="date"></div>
    <div class="form-group"><label>婚礼时间</label><input id="cfg-time" type="time"></div>
    <div class="form-group"><label>婚礼地点</label><input id="cfg-venue" type="text"></div>
    <div class="form-group"><label>详细地址</label><input id="cfg-address" type="text"></div>
    <div class="form-group"><label>请帖模板</label><select id="cfg-template"><option value="classic">经典红金</option><option value="elegant">优雅暗金</option><option value="modern">现代粉青</option></select></div>
    <button class="btn btn-primary" onclick="saveConfig()">保存配置</button>
  </div>

  <!-- 资源设置 -->
  <div class="panel" id="panel-assets">
    <h2>资源设置（CF文件库）</h2>
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

  <!-- 功能开关 -->
  <div class="panel" id="panel-features">
    <h2>功能开关</h2>
    <div class="toggle-row"><label>🎵 背景音乐</label><label class="toggle"><input type="checkbox" id="feat-music"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>🖼️ 背景图</label><label class="toggle"><input type="checkbox" id="feat-bgImage"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>⏰ 倒计时</label><label class="toggle"><input type="checkbox" id="feat-countdown"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>📋 RSVP回执</label><label class="toggle"><input type="checkbox" id="feat-rsvp"><span class="slider"></span></label></div>
    <div class="toggle-row"><label>📊 统计功能</label><label class="toggle"><input type="checkbox" id="feat-stats"><span class="slider"></span></label></div>
    <button class="btn btn-primary" onclick="saveConfig()" style="margin-top:1rem;">保存</button>
  </div>

  <!-- 文案编辑 -->
  <div class="panel" id="panel-text">
    <h2>文案编辑</h2>
    <div class="form-group"><label>请帖标题</label><input id="cfg-title" type="text"></div>
    <div class="form-group"><label>邀请语</label><input id="cfg-invitation" type="text"></div>
    <div class="form-group"><label>介绍文案</label><textarea id="cfg-intro"></textarea></div>
    <div class="form-group"><label>结尾文案</label><textarea id="cfg-ending"></textarea></div>
    <button class="btn btn-primary" onclick="saveConfig()">保存文案</button>
  </div>

  <!-- 宾客管理 -->
  <div class="panel" id="panel-guests">
    <h2>宾客管理</h2>
    <div class="form-group">
      <label>批量导入宾客名单（每行一个姓名，或 姓名,电话）</label>
      <textarea class="import-area" id="guestImport" placeholder="张三&#10;李四,13800138000&#10;王五"></textarea>
      <div class="hint">支持从统计表格复制粘贴，每行一位宾客</div>
    </div>
    <button class="btn btn-success" onclick="importGuests()">导入宾客</button>
    <button class="btn btn-primary" onclick="loadGuests()" style="margin-left:0.5rem;">刷新列表</button>
    <table id="guestTable">
      <thead><tr><th>姓名</th><th>电话</th><th>回执状态</th><th>操作</th></tr></thead>
      <tbody id="guestList"></tbody>
    </table>
  </div>

  <!-- 专属链接 -->
  <div class="panel" id="panel-links">
    <h2>专属请帖链接</h2>
    <button class="btn btn-success" onclick="generateAllLinks()">为所有宾客生成链接</button>
    <button class="btn btn-primary" onclick="exportLinks()" style="margin-left:0.5rem;">导出链接列表</button>
    <table id="linkTable" style="margin-top:1rem;">
      <thead><tr><th>宾客</th><th>专属链接</th><th>复制</th></tr></thead>
      <tbody id="linkList"></tbody>
    </table>
  </div>

  <!-- 统计 -->
  <div class="panel" id="panel-stats">
    <h2>访问统计</h2>
    <div class="stats-grid" id="statsGrid">
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
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pwd })
  }).then(r => r.json()).then(data => {
    if (data.token) {
      AUTH_TOKEN = data.token;
      localStorage.setItem('adminToken', AUTH_TOKEN);
      document.getElementById('loginWrap').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      loadConfig();
      loadGuests();
      loadStats();
    } else {
      document.getElementById('loginError').style.display = 'block';
    }
  }).catch(() => {
    document.getElementById('loginError').textContent = '登录失败，请检查网络';
    document.getElementById('loginError').style.display = 'block';
  });
}

function doLogout() {
  AUTH_TOKEN = '';
  localStorage.removeItem('adminToken');
  location.reload();
}

// 自动登录（token缓存在localStorage）
window.addEventListener('load', () => {
  const saved = localStorage.getItem('adminToken');
  if (saved) {
    AUTH_TOKEN = saved;
    document.getElementById('loginWrap').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadConfig();
    loadGuests();
    loadStats();
  }
});

// ================== 面板切换 ==================
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  event.target.classList.add('active');
  if (name === 'links') loadLinks();
  if (name === 'stats') loadStats();
}

// ================== 配置管理 ==================
function loadConfig() {
  fetch('/api/config').then(r => r.json()).then(data => {
    currentConfig = data;
    document.getElementById('cfg-groom').value = data.groomName || '';
    document.getElementById('cfg-bride').value = data.brideName || '';
    document.getElementById('cfg-date').value = data.weddingDate || '';
    document.getElementById('cfg-time').value = data.weddingTime || '';
    document.getElementById('cfg-venue').value = data.venue || '';
    document.getElementById('cfg-address').value = data.address || '';
    document.getElementById('cfg-template').value = data.template || 'classic';
    document.getElementById('cfg-bgImage').value = data.bgImage || '';
    document.getElementById('cfg-bgMusic').value = data.bgMusic || '';
    document.getElementById('cfg-statsApi').value = data.statsApi || '';
    document.getElementById('cfg-title').value = (data.text && data.text.title) || '';
    document.getElementById('cfg-invitation').value = (data.text && data.text.invitation) || '';
    document.getElementById('cfg-intro').value = (data.text && data.text.intro) || '';
    document.getElementById('cfg-ending').value = (data.text && data.text.ending) || '';
    const f = data.features || {};
    document.getElementById('feat-music').checked = f.music !== false;
    document.getElementById('feat-bgImage').checked = f.bgImage !== false;
    document.getElementById('feat-countdown').checked = f.countdown !== false;
    document.getElementById('feat-rsvp').checked = f.rsvp !== false;
    document.getElementById('feat-stats').checked = f.stats !== false;
  }).catch(() => showToast('加载配置失败', 'error'));
}

function saveConfig() {
  const config = {
    groomName: document.getElementById('cfg-groom').value,
    brideName: document.getElementById('cfg-bride').value,
    weddingDate: document.getElementById('cfg-date').value,
    weddingTime: document.getElementById('cfg-time').value,
    venue: document.getElementById('cfg-venue').value,
    address: document.getElementById('cfg-address').value,
    template: document.getElementById('cfg-template').value,
    bgImage: document.getElementById('cfg-bgImage').value,
    bgMusic: document.getElementById('cfg-bgMusic').value,
    statsApi: document.getElementById('cfg-statsApi').value,
    text: {
      title: document.getElementById('cfg-title').value,
      invitation: document.getElementById('cfg-invitation').value,
      intro: document.getElementById('cfg-intro').value,
      ending: document.getElementById('cfg-ending').value,
    },
    features: {
      music: document.getElementById('feat-music').checked,
      bgImage: document.getElementById('feat-bgImage').checked,
      countdown: document.getElementById('feat-countdown').checked,
      rsvp: document.getElementById('feat-rsvp').checked,
      stats: document.getElementById('feat-stats').checked,
    }
  };
  // 合并当前配置（保留未在面板显示的字段）
  Object.assign(currentConfig, config);
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': AUTH_TOKEN },
    body: JSON.stringify(currentConfig)
  }).then(r => r.json()).then(() => {
    showToast('保存成功', 'success');
  }).catch(() => showToast('保存失败', 'error'));
}

// ================== 宾客管理 ==================
function importGuests() {
  const text = document.getElementById('guestImport').value.trim();
  if (!text) { showToast('请输入宾客名单', 'error'); return; }
  const lines = text.split('\\n').map(l => l.trim()).filter(l => l);
  const guests = lines.map(l => {
    const parts = l.split(',');
    return { name: parts[0].trim(), phone: (parts[1] || '').trim() };
  });
  fetch('/api/guests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': AUTH_TOKEN },
    body: JSON.stringify({ guests })
  }).then(r => r.json()).then(data => {
    showToast('导入 ' + data.added + ' 位宾客', 'success');
    document.getElementById('guestImport').value = '';
    loadGuests();
  }).catch(() => showToast('导入失败', 'error'));
}

function loadGuests() {
  fetch('/api/guests', { headers: { 'X-Auth-Token': AUTH_TOKEN } })
    .then(r => r.json()).then(data => {
      guestsData = data.guests || [];
      const list = document.getElementById('guestList');
      list.innerHTML = guestsData.map(g => {
        const rsvpText = g.rsvp ? ({attending:'🎉到场', maybe:'🤔待定', declined:'😊不出席'}[g.rsvp] || '-') : '未回复';
        return '<tr><td>' + g.name + '</td><td>' + (g.phone || '-') + '</td><td>' + rsvpText + '</td><td><button class="btn btn-danger" onclick="deleteGuest(\\'' + g.id + '\\')">删除</button></td></tr>';
      }).join('');
    }).catch(() => showToast('加载宾客失败', 'error'));
}

function deleteGuest(id) {
  if (!confirm('确认删除该宾客？')) return;
  fetch('/api/guests/' + id, { method: 'DELETE', headers: { 'X-Auth-Token': AUTH_TOKEN } })
    .then(r => r.json()).then(() => { showToast('已删除', 'success'); loadGuests(); })
    .catch(() => showToast('删除失败', 'error'));
}

// ================== 专属链接 ==================
function loadLinks() {
  fetch('/api/guests', { headers: { 'X-Auth-Token': AUTH_TOKEN } })
    .then(r => r.json()).then(data => {
      guestsData = data.guests || [];
      const list = document.getElementById('linkList');
      const base = location.origin + '/i/';
      list.innerHTML = guestsData.map(g => {
        const url = base + g.id;
        return '<tr><td>' + g.name + '</td><td><a class="guest-link" href="' + url + '" target="_blank">' + url + '</a></td><td><button class="btn btn-primary" onclick="copyLink(\\'' + url + '\\')">复制</button></td></tr>';
      }).join('');
    }).catch(() => showToast('加载失败', 'error'));
}

function generateAllLinks() {
  loadLinks();
  showToast('链接已生成', 'success');
}

function exportLinks() {
  const base = location.origin + '/i/';
  const lines = guestsData.map(g => g.name + '\\t' + base + g.id);
  const csv = '姓名\\t专属链接\\n' + lines.join('\\n');
  const blob = new Blob([csv], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'guest-links.txt';
  a.click();
}

function copyLink(url) {
  navigator.clipboard.writeText(url).then(() => showToast('已复制', 'success'));
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

// ================== Toast 提示 ==================
function showToast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'success');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
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

    // 请帖页面（根路径或 /i/:guestId）
    if ((path === '/' || path === '/index.html') && method === 'GET') {
      return await serveInvitation(env, null);
    }
    const guestMatch = path.match(/^\/i\/([a-z0-9]+)$/);
    if (guestMatch && method === 'GET') {
      return await serveInvitation(env, guestMatch[1]);
    }

    // 管理后台页面
    if ((path === '/admin' || path === '/admin/') && method === 'GET') {
      return htmlResponse(getAdminPage());
    }

    // ================== API 路由 ==================

    // 登录
    if (path === '/api/login' && method === 'POST') {
      const body = await request.json();
      const adminPwd = env.ADMIN_PASSWORD || 'admin123'; // 【可配置】默认管理密码，建议通过环境变量修改
      if (body.password === adminPwd) {
        const token = genToken();
        // 存储 session（24小时过期）
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
      if (!checkAuth(request, env)) return jsonResponse({ error: '未授权' }, 401);
      const body = await request.json();
      await env.WEDDING_KV.put('config', JSON.stringify(body));
      return jsonResponse({ success: true });
    }

    // 获取宾客列表（需认证）
    if (path === '/api/guests' && method === 'GET') {
      if (!checkAuth(request, env)) return jsonResponse({ error: '未授权' }, 401);
      const guests = await getGuests(env);
      // 附带 RSVP 信息
      for (const g of guests) {
        const rsvp = await env.WEDDING_KV.get(`rsvp:${g.id}`);
        if (rsvp) g.rsvp = JSON.parse(rsvp).status;
      }
      return jsonResponse({ guests });
    }

    // 批量导入宾客（需认证）
    if (path === '/api/guests' && method === 'POST') {
      if (!checkAuth(request, env)) return jsonResponse({ error: '未授权' }, 401);
      const body = await request.json();
      const guests = await getGuests(env);
      let added = 0;
      for (const g of (body.guests || [])) {
        const id = genId();
        guests.push({ id, name: g.name, phone: g.phone || '' });
        added++;
      }
      await env.WEDDING_KV.put('guests', JSON.stringify(guests));
      return jsonResponse({ success: true, added });
    }

    // 删除宾客（需认证）
    const deleteMatch = path.match(/^\/api\/guests\/([a-z0-9]+)$/);
    if (deleteMatch && method === 'DELETE') {
      if (!checkAuth(request, env)) return jsonResponse({ error: '未授权' }, 401);
      const guests = await getGuests(env);
      const filtered = guests.filter(g => g.id !== deleteMatch[1]);
      await env.WEDDING_KV.put('guests', JSON.stringify(filtered));
      await env.WEDDING_KV.delete(`rsvp:${deleteMatch[1]}`);
      return jsonResponse({ success: true });
    }

    // RSVP 提交（公开）
    if (path === '/api/rsvp' && method === 'POST') {
      const body = await request.json();
      if (body.guestId) {
        await env.WEDDING_KV.put(`rsvp:${body.guestId}`, JSON.stringify({
          status: body.status,
          count: body.count || 1,
          message: body.message || '',
          timestamp: Date.now(),
        }));
      }
      return jsonResponse({ success: true });
    }

    // 访问统计上报（公开）
    if (path === '/api/view' && method === 'POST') {
      const body = await request.json?.() || {};
      const views = parseInt(await env.WEDDING_KV.get('stat:views') || '0') + 1;
      await env.WEDDING_KV.put('stat:views', String(views));
      if (body.guestId) {
        const guestViews = parseInt(await env.WEDDING_KV.get(`stat:view:${body.guestId}`) || '0') + 1;
        await env.WEDDING_KV.put(`stat:view:${body.guestId}`, String(guestViews));
      }
      return jsonResponse({ success: true });
    }

    // 获取统计数据（需认证）
    if (path === '/api/stats' && method === 'GET') {
      if (!checkAuth(request, env)) return jsonResponse({ error: '未授权' }, 401);
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
      // 如果配置了外部统计API，也可以在这里调用
      const config = await getConfig(env);
      let externalStats = null;
      if (config.statsApi) {
        try {
          const resp = await fetch(config.statsApi);
          externalStats = await resp.json();
        } catch (e) { /* 外部API不可用，忽略 */ }
      }
      return jsonResponse({
        views,
        guestCount: guests.length,
        rsvpCount,
        attendingCount,
        externalStats,
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
  return JSON.parse(config);
}

/** 获取宾客列表 */
async function getGuests(env) {
  const data = await env.WEDDING_KV.get('guests');
  return data ? JSON.parse(data) : [];
}

/** 返回请帖页面 */
async function serveInvitation(env, guestId) {
  const config = await getConfig(env);
  let guest = null;
  if (guestId) {
    const guests = await getGuests(env);
    guest = guests.find(g => g.id === guestId);
  }
  const html = getInvitationPage(config, guest);
  return htmlResponse(html);
}
