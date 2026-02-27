# DApp

演示站点（React + Vite），用于触发钱包连接与授权流程。  
特色：内置“正常/风险”两类 ERC20 `approve` 请求，便于验证扩展的风控拦截链路。

## 部署

### 1) 环境准备
- Node.js（建议 `>=20`）
- npm

### 2) 安装依赖
```bash
cd dapp
npm ci
```

### 3) 启动开发服务
```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

访问：`http://127.0.0.1:5173`

### 4) 生产构建（可选）
```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

## 联动前提
- 浏览器需已加载 `extension/dist`（灵光钱包扩展），以注入 `window.ethereum` Provider。
- 当前页面会优先选择 灵光钱包 Provider（存在多钱包注入时）。
- 当前演示请求使用硬编码测试网地址；若替换为你自部署的合约/Spender，请修改 `src/components/ApproveRequestCard.tsx` 后重新启动。
