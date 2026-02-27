# Agent

灵光钱包 风险分析服务（FastAPI）。  
提供三类风控接口：钓鱼地址、合约授权、DEX 滑点。

## 部署

### 1) 环境准备
- Python `>=3.12`
- `uv` 包管理器

### 2) 安装依赖
```bash
cd agent
uv sync
```

### 3) 配置环境变量
```bash
cp .env.example .env
```

`agent/.env` 关键配置：
- `MODEL_BASE_URL`：OpenAI 兼容接口地址
- `MODEL_NAME`：模型名
- `MODEL_API_KEY`：模型 Key
- `REQUEST_TIMEOUT_S`：请求超时（秒）

说明：服务启动时会优先读取 `agent/.env`，若不存在则读取仓库根目录 `.env`。

### 4) 启动服务
```bash
uv run service/main.py
```

默认监听：`0.0.0.0:8000`

### 5) 健康检查
```bash
curl -X POST http://127.0.0.1:8000/risk/phishing \
  -H 'Content-Type: application/json' \
  -d '{"address":"0x0000000000000000000000000000000000000001","chain":"monad","transactions":[]}'
```

## 接口
- `POST /risk/phishing`
- `POST /risk/contract`
- `POST /risk/slippage`
