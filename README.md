# 灵光钱包

灵光钱包 由三部分组成：
- `agent`：风险分析服务（FastAPI）
- `extension`：浏览器钱包扩展（EIP-1193 Provider + 风控弹窗）
- `dapp`：演示站点（连接钱包并发起授权请求）

整体目标：在钱包关键操作前引入 AI 风险提示，形成“请求发起 -> 风险评估 -> 用户确认”的闭环。

## 模块化部署

### Agent
```bash
cd agent
cp .env.example .env
uv sync
uv run service/main.py
```

默认地址：`http://127.0.0.1:8000`

### Extension
```bash
cd extension
cp .env.example .env
npm ci
npm run build
```

然后在 Chrome 加载 `extension/dist`（开发者模式 -> 加载已解压扩展程序）。

### DApp
```bash
cd dapp
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

访问：`http://127.0.0.1:5173`

## 三模块联动部署方案

1. 启动 Agent  
   确认 `http://127.0.0.1:8000` 可访问（extension 通过 `VITE_AGENT_SERVER_URL` 调用它）。
2. 构建并加载 Extension  
   在浏览器启用扩展，确保页面可注入 灵光钱包 Provider。
3. 启动 DApp  
   打开 `http://127.0.0.1:5173`，点击连接钱包。
4. 在 DApp 发起授权请求  
   请求会进入扩展授权页，扩展调用 Agent 返回合约风险提示后再允许用户确认。
5. 在扩展内执行转账/兑换  
   转账触发钓鱼风险分析，兑换触发滑点风险分析，形成完整联动。

## 可配置项（联动关键）
- `extension/.env` 中 `VITE_AGENT_SERVER_URL` 必须指向已启动的 Agent。
- `extension/.env` 中 `VITE_MONADSCAN_API_KEY` 建议配置，否则部分风控上下文会降级。
- 默认代码已指向一组 Monad Testnet 合约地址，可直接联调；若改为自部署地址需重新构建扩展与 DApp。
- 若你替换了测试网合约地址，请同步更新：
  - `extension/src/services/walletClient.ts`
  - `dapp/src/components/ApproveRequestCard.tsx`
