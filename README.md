# 灵光钱包 LumiWallet

<p align="left">
  <img src="./extension/public/icons/icon128.png" alt="灵光钱包 Icon" width="120" />
</p>

## 一、项目简介（特色）

灵光钱包是一款基于 AI 的智能安全钱包。  
在用户进行转账、授权或 DEX 交易等场景时，系统会基于交易上下文自动识别交互类型，实时分析潜在风险，并给出可解释的风险提示，帮助用户做出更稳妥的链上决策。

支持场景示例：
- 钓鱼转账预警（如相似地址攻击）
- 合约风险感知
- DEX 滑点解释

## 二、体验须知

- 当前仅支持 Monad 测试网。
- 当前仅支持两种 Token：
  - 测试链原生资产 `MON`
  - 自建 ERC20 Token `eGold`
- `DEX` 兑换功能可能需要测试 `eGold`，
   - `eGold` 水龙头合约地址（在 Monad 测试网上）：`0x3b0F1FB51565cb274c040f30CD05969ab09515d4`
   - 领取规则：任意地址每隔 1 分钟可领取 `100 eGold`。

## 三、部署文档

### 方案一（推荐黑客松评审）- 快捷体验

项目由三部分组成：`agent` 后端、浏览器插件端、`dapp` 页面（用于辅助测试合约授权功能）。  
其中 `agent` 后端与 `dapp` 页面已完成部署，评审仅需安装浏览器插件即可体验核心流程。

1. 浏览器插件 Release 包：  
   https://github.com/Kedao/LumiWallet/releases/tag/v0.1
2. 配套 DApp 访问链接：  
   https://lumi-wallet-hackathon-dapp.vercel.app

### 方案二 - 完整部署（含 .env 配置）

#### 0) 环境准备

- Python `>= 3.12`
- `uv`（Python 包管理工具）
- Node.js `>= 20` + npm
- Chrome/Chromium（用于加载插件）

#### 1) 部署 agent 后端

```bash
cd agent
cp .env.example .env
```

编辑 `agent/.env`：

```env
MODEL_PROVIDER=openai_compatible
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4o-mini
MODEL_API_KEY=YOUR_MODEL_API_KEY
REQUEST_TIMEOUT_S=12
```

安装依赖并启动：

```bash
uv sync
uv run service/main.py
```

默认服务地址：`http://127.0.0.1:8000`

#### 2) 部署浏览器插件 extension

```bash
cd extension
cp .env.example .env
```

编辑 `extension/.env`：

```env
VITE_MONADSCAN_API_KEY=your_monadscan_api_key
VITE_AGENT_SERVER_URL=http://127.0.0.1:8000
```

安装依赖并构建：

```bash
npm ci
npm run build
```

在浏览器安装：
1. 打开 `chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择 `extension/dist`

#### 3) 部署 dapp 页面

```bash
cd dapp
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

访问：`http://127.0.0.1:5173`

#### 4) 联调与访问验证

1. 确认 agent 服务可访问：`http://127.0.0.1:8000`
2. 确认浏览器已启用灵光钱包插件
3. 打开 `http://127.0.0.1:5173` 并连接钱包
4. 通过 DApp 发起授权，或在钱包中发起转账/兑换，验证风险提示链路
