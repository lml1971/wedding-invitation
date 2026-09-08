#!/usr/bin/env node
/**
 * 自动部署脚本
 * ==================
 * 功能：
 *   1. 自动检测并创建 KV namespace
 *   2. 更新 wrangler.toml 中的 KV id
 *   3. 调用 wrangler deploy 部署 Worker
 *   4. 输出部署后的访问地址
 *
 * 使用：npm run deploy
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOML_PATH = path.join(__dirname, 'wrangler.toml');
const KV_BINDING = 'WEDDING_KV';
const PLACEHOLDER_ID = 'AUTO_CREATE_ME';

function log(msg) {
  console.log(`\x1b[36m[deploy]\x1b[0m ${msg}`);
}

function logSuccess(msg) {
  console.log(`\x1b[32m[deploy]\x1b[0m ${msg}`);
}

function logError(msg) {
  console.error(`\x1b[31m[deploy]\x1b[0m ${msg}`);
}

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: options.silent ? 'pipe' : 'inherit', ...options });
  } catch (e) {
    if (options.silent) return null;
    throw e;
  }
}

/** 从 wrangler.toml 读取当前 KV id */
function getCurrentKvId() {
  const toml = fs.readFileSync(TOML_PATH, 'utf8');
  const match = toml.match(/id\s*=\s*"([^"]+)"/);
  return match ? match[1] : null;
}

/** 检查 KV id 是否是真实ID（非占位符） */
function isRealKvId(id) {
  if (!id || id === PLACEHOLDER_ID) return false;
  // 真实 KV namespace id 是32位十六进制字符串
  return /^[a-f0-9]{32}$/i.test(id);
}

/** 更新 wrangler.toml 中的 KV id */
function updateKvId(newId) {
  let toml = fs.readFileSync(TOML_PATH, 'utf8');
  toml = toml.replace(/id\s*=\s*"[^"]*"/, `id = "${newId}"`);
  fs.writeFileSync(TOML_PATH, toml);
}

/** 创建 KV namespace 并返回 id */
function createKvNamespace() {
  log('正在创建 KV namespace: WEDDING_KV ...');
  const output = run(`npx wrangler kv namespace create ${KV_BINDING}`, { silent: true, stdio: 'pipe' });
  if (!output) {
    logError('创建 KV namespace 失败');
    process.exit(1);
  }
  // 解析输出中的 id
  const idMatch = output.match(/id\s*=\s*"([a-f0-9]+)"/);
  if (!idMatch) {
    // 尝试从 JSON 输出解析
    const jsonMatch = output.match(/"id"\s*:\s*"([a-f0-9]+)"/);
    if (!jsonMatch) {
      logError('无法解析 KV namespace id，请手动创建');
      log('输出: ' + output);
      process.exit(1);
    }
    return jsonMatch[1];
  }
  return idMatch[1];
}

/** 检查 wrangler 是否已安装/登录 */
function checkPrerequisites() {
  log('检查环境...');
  // 检查 npx
  try {
    run('npx wrangler --version', { silent: true, stdio: 'pipe' });
  } catch {
    logError('wrangler 未安装，正在安装...');
    run('npm install -g wrangler');
  }

  // 检查登录
  const whoami = run('npx wrangler whoami', { silent: true, stdio: 'pipe' });
  if (!whoami || whoami.includes('not logged in') || whoami.includes('not authenticated')) {
    log('需要登录 Cloudflare...');
    run('npx wrangler login');
  }
  logSuccess('环境检查通过');
}

function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║     💒 婚礼请帖自动部署脚本 💒      ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');

  // 1. 检查环境
  checkPrerequisites();

  // 2. 检查/创建 KV namespace
  const currentId = getCurrentKvId();
  if (!isRealKvId(currentId)) {
    log('检测到 KV namespace 未创建，开始自动创建...');
    const newId = createKvNamespace();
    updateKvId(newId);
    logSuccess(`KV namespace 已创建，id: ${newId}`);
  } else {
    logSuccess(`KV namespace 已配置，id: ${currentId}`);
  }

  // 3. 安装依赖
  log('安装依赖...');
  run('npm install');

  // 4. 部署 Worker
  log('开始部署 Worker...');
  const deployOutput = run('npx wrangler deploy');

  // 5. 提取部署地址
  const workerName = 'wedding-invitation';
  logSuccess('════════════════════════════════════════');
  logSuccess('部署成功！');
  logSuccess('');
  logSuccess('请帖访问地址: https://wedding-invitation.<your-account>.workers.dev/');
  logSuccess('管理后台地址: https://wedding-invitation.<your-account>.workers.dev/admin');
  logSuccess('专属请帖链接: https://wedding-invitation.<your-account>.workers.dev/i/<guestId>');
  logSuccess('');
  logSuccess('默认管理密码: wedding2026 （建议在 CF 仪表盘修改）');
  logSuccess('════════════════════════════════════════');
}

main();
