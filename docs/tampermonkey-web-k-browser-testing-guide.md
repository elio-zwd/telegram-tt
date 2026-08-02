# Telegram Web K 油猴脚本浏览器自动化调试与验收指南

本文档记录了在 AI/Agent 对话中，如何利用本地 HTTP 托管服务与 Chrome DevTools Protocol (CDP) 协议，在真实 Telegram Web K 页面中高效载入、运行并调试 `0.4.0-k10` 及后续油猴脚本的核心方法。

---

## 1. 核心架构与原理

当在自动化/无头 CDP 环境中无法直接通过 Chrome 扩展商店界面进行交互时，通过以下 3 步架构在真实页面中激活 userscript 运行时：

```text
┌───────────────────────────┐      HTTP Fetch      ┌───────────────────────────────┐
│ Local HTTP Server         │ <------------------- │ Telegram Web K Page (Chrome)  │
│ (http://localhost:8888/)  │                      │ (https://web.telegram.org/k/) │
└───────────────────────────┘                      └───────────────────────────────┘
            │                                                      ▲
            │ 托管 compiled userscript                              │ 动态脚本注入
            ▼                                                      │
tampermonkey/telegram-media-continuity-web-k.user.js ─────────────┘
```

1. **本地静态服务**：开启 HTTP 服务监听 `8888` 端口，实时托管仓库中编译好的 `tampermonkey/telegram-media-continuity-web-k.user.js`。
2. **CDP 动态载入**：通过 Chrome DevTools Protocol 在 Telegram Web K 页面中创建 `<script>` 标签指向 `http://localhost:8888/tampermonkey/telegram-media-continuity-web-k.user.js`。
3. **全局 API 与 UI 挂载**：脚本在页面上下文中启动后，自动注册 `window.TelegramMediaContinuity`，并在 MediaViewer 查看器弹窗打开时渲染 Shadow DOM UI (`#telegram-media-continuity-host`)。

---

## 2. 自动化执行与调试步骤

### 2.1 启动本地 HTTP 托管服务器

在 Node.js 中启动轻量托管服务：

```js
const http = require('http');
const fs = require('fs');
const path = require('path');

http.createServer((req, res) => {
  const file = path.join(process.cwd(), req.url);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    fs.createReadStream(file).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('Not Found');
  }
}).listen(8888, () => console.log('Server running on http://localhost:8888/'));
```

### 2.2 在 CDP 页面上下文中载入 Userscript

通过 CDP `evaluate_script` 在页面运行：

```js
() => {
  if (window.TelegramMediaContinuity) {
    return window.TelegramMediaContinuity.getSummary();
  }
  const s = document.createElement('script');
  s.id = 'tg-media-continuity-script';
  s.src = 'http://localhost:8888/tampermonkey/telegram-media-continuity-web-k.user.js';
  document.head.appendChild(s);
  return 'SCRIPT_TAG_ADDED';
}
```

### 2.3 读取调试 API 与控制面板状态

在页面载入后调用调试 API：

```js
// 获取全量配置与运行摘要
window.TelegramMediaContinuity.getSummary();

// 深入探测 DOM 查看器与 Shadow DOM UI
window.TelegramMediaContinuity.inspect();

// 强制重新扫描页面 DOM 结构
window.TelegramMediaContinuity.rescan();
```

---

## 3. 后续对话/Agent 快速调用的最佳实践

1. **自动运行构建**：在测试前执行 `npm run build:tampermonkey:web-k` 生成最新 userscript。
2. **状态验证**：确认 `window.TelegramMediaContinuity` 返回 `version: "0.4.0-k10"`。
3. **打开 MediaViewer**：点击聊天消息中的 `.album-item` 或 `.media-photo` 唤起查看器，控制面板 `#telegram-media-continuity-host` 自动完成挂载与 UI 渲染。
