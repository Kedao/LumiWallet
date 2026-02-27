# Extension

灵光钱包浏览器扩展（MV3 + React + TypeScript）。  
特色：提供钱包能力（账户/签名/发交易）并在授权、转账、兑换环节接入 Agent 风险分析。

## 部署

### 1) 环境准备
- Node.js（建议 `>=20`）
- npm
- Chrome/Chromium（开发者模式）

### 2) 安装依赖
```bash
cd extension
npm ci
```

### 3) 配置环境变量
```bash
cp .env.example .env
```

`extension/.env`：
- `VITE_AGENT_SERVER_URL`：Agent 服务地址（默认 `http://127.0.0.1:8000`）
- `VITE_MONADSCAN_API_KEY`：Monadscan API Key（用于交易历史与合约信息查询）

### 4) 构建扩展
```bash
npm run build
```

产物目录：`extension/dist`

### 5) 安装到浏览器
1. 打开 `chrome://extensions`
2. 打开“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 选择 `extension/dist`

## 链与合约
- 默认网络：Monad Testnet（`chainId=10143`, `0x279F`）
- 扩展内置了 eGold 与 AMM 合约地址（用于转账与兑换）
- 默认可直接使用当前代码中的测试网地址；不需要先行部署合约。

如你部署了自己的合约，请同步更新：
- `extension/src/services/walletClient.ts`
- `dapp/src/components/ApproveRequestCard.tsx`
