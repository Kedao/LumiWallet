# Agent

AI 分析服务模块。

**运行方式**
1. 安装依赖

```bash
pip install -r agent/service/requirements.txt
```

2. 启动服务

```bash
uvicorn agent.service.main:app --host 0.0.0.0 --port 8000
```

**环境变量**
- `MODEL_PROVIDER`：供应商标识（目前仅占位）
- `MODEL_BASE_URL`：OpenAI 兼容服务的 Base URL
- `MODEL_NAME`：模型名称
- `MODEL_API_KEY`：API Key
- `LLM_DISABLED`：设置为 `true` 时不调用 LLM，返回兜底结果
- `REQUEST_TIMEOUT_S`：LLM 请求超时秒数

**接口**
- `POST /risk/phishing`
- `POST /risk/contract`
- `POST /risk/slippage`
