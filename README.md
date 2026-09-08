# 💒 婚礼请帖

基于 Cloudflare Worker + KV 的全栈婚礼请帖系统，支持一对一专属链接、后台管理、宾客导入等功能。

## ✨ 功能一览

| 功能 | 说明 |
|---|---|
| 📱 请帖展示 | 自适应页面，背景图+背景音乐+倒计时+文案 |
| 🎵 背景音乐 | 默认关闭，点击渐入渐出，从CF文件库调用 |
| 🖼️ 背景图 | 从CF文件库调用，URL可后台配置 |
| 📋 RSVP回执 | 宾客可在线回复出席状态 |
| 👥 宾客管理 | 批量导入、删除、查看回执 |
| 🔗 专属链接 | 为每位宾客生成个性化请帖链接 |
| 📊 统计 | 访问量、回执数、出席人数 |
| ⚙️ 管理后台 | 密码登录，所有配置可视化编辑 |
| 🔧 功能开关 | 音乐/背景/倒计时/RSVP/统计 一键开关 |
| 🎨 多主题 | 经典红金 / 优雅暗金 / 现代粉青 |

## 🚀 快速部署

```bash
# 1. 安装依赖
npm install

# 2. 一键部署（自动创建KV + 部署Worker）
npm run deploy
```

部署脚本会自动：
- 检查 Cloudflare 登录状态
- 自动创建 KV namespace
- 更新 wrangler.toml 配置
- 部署 Worker

## 📁 项目结构

```
wedding-invitation/
├── src/
│   └── worker.js          # Worker 主体（路由+API+页面生成）
├── wrangler.toml           # Cloudflare 部署配置
├── package.json            # npm 脚本
├── deploy.js               # 自动部署脚本（KV自动创建）
└── README.md
```

## 🔧 配置说明

### 管理密码
- 默认密码: `lml1971`（在 `wrangler.toml` 的 `[vars]` 中修改）
- 生产环境建议在 Cloudflare 仪表盘设为加密变量

### CF文件库资源
- 文件库地址: `https://wj.lmlcyp.ccwu.cc/`
- 在管理后台 → 「资源设置」中填入：
  - 背景图 URL: `https://wj.lmlcyp.ccwu.cc/JPG/your-photo.jpg`
  - 背景音乐 URL: `https://wj.lmlcyp.ccwu.cc/mp3/your-music.mp3`

### 代码中的可配置项
所有可配置项均在 `src/worker.js` 顶部 `DEFAULT_CONFIG` 中定义，并附有注释标注。
首次部署后配置写入 KV，后续通过管理后台修改，无需改代码。

## 📖 使用方法

### 管理后台
1. 访问 `https://<your-worker>.workers.dev/admin`
2. 输入管理密码登录
3. 在各面板中配置：
   - 基础配置：姓名、日期、地点、模板
   - 资源设置：背景图/音乐/统计API的URL
   - 功能开关：各功能一键开关
   - 文案编辑：标题、邀请语、介绍、结尾
   - 宾客管理：批量导入名单
   - 专属链接：生成、复制、导出每位宾客的专属链接

### 宾客专属链接
1. 在「宾客管理」中批量导入宾客（每行一个姓名，或 姓名,电话）
2. 在「专属链接」中查看每位宾客的链接
3. 可导出链接列表（TXT格式，Tab分隔）

### 统计表格联动
- 在「资源设置」中配置统计API地址
- 系统会自动从该API拉取统计数据

## 🛠 技术栈
- Cloudflare Worker（Edge 运行时）
- Cloudflare KV（键值存储）
- 纯 HTML/CSS/JS（无框架依赖）
- ES Modules 格式
