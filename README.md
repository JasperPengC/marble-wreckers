<h1 align="center">弹珠拆迁队</h1>

<p align="center">
  Marble Wreckers<br>
  论坛水楼题材的弹珠 Roguelike，支持手机与桌面浏览器。
</p>

<p align="center">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square" alt="TypeScript 5.9"></a>
  <a href="https://developer.mozilla.org/docs/Web/API/Canvas_API"><img src="https://img.shields.io/badge/Canvas-2D-C49B3B?style=flat-square" alt="Canvas 2D"></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-%E2%89%A5%201.4-555555?style=flat-square" alt="Bun 1.4 或更新版本"></a>
</p>

<p align="center">
  <a href="#特性">特性</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#操作">操作</a> ·
  <a href="#部署">部署</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.webp">
    <source media="(prefers-color-scheme: light)" srcset="docs/images/hero-light.webp">
    <img src="docs/images/hero-light.webp" width="720" alt="弹珠拆迁队实机画面：左侧为全屏弹珠拆楼与悬浮徽章，右侧为三选一强化。">
  </picture>
</p>

## 特性

拖动瞄准，松手发射，在楼压下来之前拆掉它。每拆完一栋选一次强化，继续挑战更高的楼。

- **论坛主题砖块**：「引战」会爆炸，「回帖」会回血，「加固」限制单次伤害。不同砖块需要不同的拆法。
- **局内构筑**：19 种可叠加强化，包括分身、多线弹道、穿透、暴击和毒火效果；每过一栋三选一，也能花灵石重抽。
- **Boss 与遗物**：每关关底都是带双层护甲的「镇站巨楼」，击败后可选择带有副作用的遗物。
- **关卡制主线**：30 个关卡 × 简单/困难/地狱三档难度，逐关逐档解锁；选关页标注推荐战力，通关拿灵石奖励。
- **战力与任务**：账号战力由养成/成就/关卡进度折算；每日任务和里程碑任务发放灵石奖励。长期进度全部持久化。
- **长期进度**：灵石可购买永久升级，成就和纪录自动保存；每日挑战使用当天的固定种子。
- **全屏沉浸 HUD**：游戏画面铺满整个屏幕，资源数字悬浮成小图标徽章；主页功能收进底部 Dock，暂停/玩法是角落圆形悬浮钮，构筑信息由右下角圆钮展开。
- **手机与桌面适配**：触摸、鼠标和键盘操作，宽屏作战面板，明暗主题、合成音效与减少动效设置。

## 快速开始

安装 [Bun](https://bun.sh/) 1.4 或更新版本，在项目目录运行：

```sh
bun install
bun run dev
```

打开 [localhost:5194](http://localhost:5194/)。手机与电脑连接同一 Wi-Fi 后，可通过电脑的局域网 IP 加 `:5194` 访问。

## 操作

| 操作 | 触摸 / 鼠标 | 键盘 |
| --- | --- | --- |
| 瞄准 | 按住画面拖动 | `←` / `→` |
| 发射 | 松开 | `Space` / `Enter` |
| 暂停 | 右上角悬浮按钮 | `Esc` / `P` |
| 查看构筑 | 右下角构筑圆钮 | — |

进度保存在当前浏览器中，关闭后可以继续。换浏览器或域名前，请先在设置里导出存档。

## 部署

```sh
bun run build:h5
```

将 `dist/web/` 部署到任意静态站点托管服务即可，不需要后端或环境变量。

**Vercel**：导入仓库，使用已有的 [vercel.json](vercel.json)。安装、构建命令和输出目录均已配置。

<details>
<summary>开发命令与其他运行方式</summary>

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `bun run dev` | 本地开发，端口 `5194` |
| `bun run build:h5` | 生成独立网页版，输出至 `dist/web/` |
| `bun run preview:h5` | 预览网页构建，端口 `5195` |
| `bun run build:miniapp` | 生成 linux.do 快应用包，输出至 `dist/package/app.zip` |
| `bun run check` | 类型检查、架构约束、单元测试和浏览器验收 |

浏览器验收需要本机 Chrome 和已启动的开发服务器。

### 运行方式

普通网页使用 `localStorage` 存档、跟随系统主题；linux.do 快应用使用宿主的存储、主题与用户能力。核心玩法共用同一份代码。

SDK 通过 `file:./sdk` 引入，部署时需保留该目录。静态构建需要通过 HTTP(S) 访问。

TapTap 使用 `dist/web/` 中的站点文件打 H5 zip，按[官方流程](https://developer.taptap.cn/agents/)上传、自测和提审。linux.do 使用 `dist/package/app.zip`。

### 素材与权限

游戏画面由 Canvas 与内联 SVG 绘制，音效由 WebAudio 合成；不加载外部字体、图片或音频。linux.do 端只申请 `user.read`、`theme.read`、`storage.read`、`storage.write` 四项权限。

### 更新 README 展示图

开发服务器运行时执行 `node scripts/readme-assets.mjs`。脚本使用本机 Chrome 截取真实游戏状态，生成明暗两版手机机框图；需要切换地址时设置 `README_URL`。

</details>
