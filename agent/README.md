# Agent

AI 分析服务模块。

**运行方式**
1. 安装依赖（在 `agent/` 目录）

```bash
uv sync
```

2. 配置环境变量

```bash
cp .env.example .env
# 然后编辑 .env，填入真实 MODEL_API_KEY / MODEL_BASE_URL / MODEL_NAME
```

3. 启动服务

```bash
uv run service/main.py
```

**环境变量**
- `MODEL_PROVIDER`：供应商标识（目前仅占位）
- `MODEL_BASE_URL`：OpenAI 兼容服务的 Base URL
- `MODEL_NAME`：模型名称
- `MODEL_API_KEY`：API Key
- `REQUEST_TIMEOUT_S`：LLM 请求超时秒数

**测试命令**
- 单元测试（不依赖外部接口）：
```bash
uv run pytest -q tests/test_risk_service.py
```
- 集成测试（需要服务已启动）：
```bash
uv run tests/integration_api_test.py
```

**接口**
- `POST /risk/phishing`
- `POST /risk/contract`
- `POST /risk/slippage`

**返回结构**
- `POST /risk/phishing`
  - 返回 `PhishingRiskResponse`
  - 字段：
    - `risk_level`：`high | medium | low | unknown`
    - `summary`：总体结论
    - `confidence`：`0~1`
    - `most_similar_address`：最相似地址（无数据时为 `null`）
    - `most_similar_similarity`：最相似地址相似度（`0~1`）
    - `most_similar_transactions`：最相似地址相关交易详情（按时间倒序，最多 3 笔）
    - `similarity_method`：相似度算法说明
- `POST /risk/contract`
  - 返回 `SecurityRiskResponse`
  - 字段：
    - `risk_level`：`high | medium | low | unknown`
    - `summary`：总体结论
    - `confidence`：`0~1`
    - `top_reasons`：固定 3 条主因，每条包含 `reason` 与 `explanation`
- `POST /risk/slippage`
  - 返回 `SlippageRiskResponse`
  - 字段：
    - `slippage_level`：滑点大小（定性等级：`high | medium | low | unknown`）
    - `summary`：一句通俗解释“为什么会发生这种滑点”

**返回样例**
- `POST /risk/phishing` 返回示例
```json
{
  "risk_level": "高",
  "summary": "目标地址与历史交易地址高度相似，存在仿冒风险。",
  "confidence": 0.84,
  "most_similar_address": "0xA11ce0000000000000000000000000000000BEEA",
  "most_similar_similarity": 0.93,
  "most_similar_transactions": [
    {
      "tx_hash": "0x1111",
      "timestamp": 1739001000,
      "from_address": "0xA11ce0000000000000000000000000000000BEEA",
      "to_address": "0xA11ce0000000000000000000000000000000BEE9"
    },
    {
      "tx_hash": "0x2222",
      "timestamp": 1739001600,
      "from_address": "0xA11ce0000000000000000000000000000000BEE8",
      "to_address": "0xA11ce0000000000000000000000000000000BEE7"
    }
  ],
  "similarity_method": "weighted(prefix=0.4,suffix=0.4,levenshtein=0.2)"
}
```

- `POST /risk/contract` 返回示例
```json
{
  "risk_level": "中",
  "summary": "该合约具备较高管理权限，交互前需谨慎评估。",
  "confidence": 0.78,
  "top_reasons": [
    {
      "reason": "可升级权限开启",
      "explanation": "管理员可替换实现合约，逻辑存在变更风险。"
    },
    {
      "reason": "具备暂停权限",
      "explanation": "项目方可暂停交易或转账，影响可用性。"
    },
    {
      "reason": "代码透明度一般",
      "explanation": "合约审计信息与公开资料不足，降低可验证性。"
    }
  ]
}
```

- `POST /risk/slippage` 返回示例
```json
{
  "slippage_level": "中",
  "summary": "本次输入金额相对池子规模偏大，会明显推动池内价格，因此会出现中等滑点。"
}
```

**请求概述**
- `POST /risk/phishing`
  - 用于钓鱼地址风险分析
  - 主要输入：`address`，`lang`（默认 `zh`），`transactions`（本地保存的交易记录，最近最多 100 笔）
- `POST /risk/contract`
  - 用于合约风险分析
  - 主要输入：`contract_address`，`lang`（默认 `zh`），`interaction_type`，`code`，`creator`，`proxy`，`permissions`，`token_flags`，`tags`
- `POST /risk/slippage`
  - 用于滑点分析
  - 主要输入：`pool_address`，`lang`（默认 `zh`），`token_pay_amount`，`pool`

**字段说明**
- `POST /risk/phishing`
  - `address`：目标地址（对方地址）
  - `chain`：链标识，当前固定为 `monad`
  - `lang`：返回语言标识，支持 `zh` / `en`，默认 `zh`
  - `transactions`：本地保存的最近交易记录（最多 100 笔），用于与目标地址做相似度对比
  - `transactions[].tx_hash`：交易哈希
  - `transactions[].timestamp`：交易时间戳（秒）
  - `transactions[].from_address`：候选地址来源（必填）
  - `transactions[].to_address`：候选地址来源（可选）
  - `transactions[].contract_address`：候选地址来源（可选）
  - `transactions[].value`：交易金额（字符串表示）
  - `transactions[].token_address`：代币合约地址（原生币可为空）
  - `transactions[].token_decimals`：代币精度
  - `transactions[].tx_type`：交易类型（`transfer` / `approve` / `contract_call` / `swap` / `mint` / `stake`）
  - `transactions[].method_sig`：合约方法签名（4 字节 selector，可选）
  - `transactions[].success`：交易是否成功
  - 返回字段 `most_similar_address`：计算得到的最相似地址
  - 返回字段 `most_similar_similarity`：最相似地址与目标地址的相似度（0~1）
  - 返回字段 `most_similar_transactions`：最相似地址相关交易详情（最多 3 笔，按 timestamp 倒序）
  - 返回字段 `similarity_method`：当前固定为 `weighted(prefix=0.4,suffix=0.4,levenshtein=0.2)`
- `POST /risk/contract`
  - `contract_address`：合约地址
  - `chain`：链标识，当前固定为 `monad`
  - `lang`：返回语言标识，支持 `zh` / `en`，默认 `zh`
  - `interaction_type`：交互类型，`approve` / `swap` / `mint` / `stake` / `contract_call`
  - `creator`：合约创建信息
  - `creator.creator_address`：创建者地址
  - `creator.creation_tx_hash`：创建交易哈希
  - `creator.creation_timestamp`：创建时间戳
  - `proxy`：代理与升级信息
  - `proxy.is_proxy`：是否为代理合约
  - `proxy.implementation_address`：实现合约地址
  - `proxy.admin_address`：代理管理员地址
  - `permissions`：权限与治理能力
  - `permissions.owner`：合约 owner
  - `permissions.admin`：合约 admin
  - `permissions.can_upgrade`：是否可升级
  - `permissions.can_pause`：是否可暂停
  - `permissions.can_blacklist`：是否可黑名单
  - `permissions.can_mint`：是否可增发
  - `permissions.can_burn`：是否可销毁
  - `token_flags`：代币行为特征
  - `token_flags.has_transfer_tax`：是否有转账税
  - `token_flags.tax_changeable`：税率是否可变
  - `token_flags.max_tx_limit`：是否有单笔上限
  - `token_flags.max_wallet_limit`：是否有钱包上限
  - `token_flags.trading_restrictions`：是否有限制交易
  - `code`：合约代码信息
  - `code.verified`：是否为已验证代码
  - `code.source_code`：源码内容（可选）
  - `code.bytecode`：字节码（可选）
  - `code.compiler_version`：编译器版本
  - `code.abi`：ABI（可选）
  - `tags`：第三方标签命中（用于合约风险辅助信号）
  - `extra_features`：预留扩展字段
- `POST /risk/slippage`
  - `pool_address`：池子地址（如 Uniswap pool）
  - `chain`：链标识，当前固定为 `monad`
  - `lang`：返回语言标识，支持 `zh` / `en`，默认 `zh`
  - `token_pay_amount`：输入金额（字符串表示）
  - `interaction_type`：交互类型，默认 `swap`
  - `pool`：池子统计信息
  - `pool.price_impact_pct`：价格冲击百分比
  - `pool.token_pay_amount`: 支付的Token在池子中的总量
  - `pool.token_get_amount`: 要兑换的Token在池子中的总量
  - `pool.type`: 交易池子的类型(默认AMM)
