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

**请求概述**
- `POST /risk/phishing`
  - 用于钓鱼地址风险分析
  - 主要输入：`address`，`interaction_type`，`transactions`（最近最多 100 笔），`lifecycle`，`tags`
- `POST /risk/contract`
  - 用于合约风险分析
  - 主要输入：`contract_address`，`interaction_type`，`code`，`creator`，`proxy`，`permissions`，`token_flags`，`tags`
- `POST /risk/slippage`
  - 用于滑点分析
  - 主要输入：`pool_address`，`token_in`，`token_out`，`amount_in`，`time_window`，`trade_type`，`orderbook`，`pool`

**字段说明**
- `POST /risk/phishing`
  - `address`：目标地址（对方地址）
  - `chain`：链标识，当前固定为 `monad`
  - `interaction_type`：交互类型，`transfer` / `approve` / `contract_call`
  - `transactions`：最近交易记录（最多 100 笔）
  - `transactions[].tx_hash`：交易哈希
  - `transactions[].timestamp`：交易时间戳（秒）
  - `transactions[].from_address`：交易发起地址
  - `transactions[].to_address`：交易接收地址
  - `transactions[].value`：交易金额（字符串表示）
  - `transactions[].token_address`：代币合约地址（原生币可为空）
  - `transactions[].token_decimals`：代币精度
  - `transactions[].tx_type`：交易类型（`transfer` / `approve` / `contract_call` / `swap` / `mint` / `stake`）
  - `transactions[].contract_address`：交互合约地址（若为合约交互）
  - `transactions[].method_sig`：合约方法签名（4 字节 selector，可选）
  - `transactions[].success`：交易是否成功
  - `lifecycle`：地址生命周期信息
  - `lifecycle.first_seen_timestamp`：首次出现时间戳
  - `lifecycle.last_seen_timestamp`：最近出现时间戳
  - `lifecycle.active_days`：活跃天数
  - `lifecycle.account_age_days`：账户年龄（天）
  - `lifecycle.gas_funder`：初始 Gas 资助地址
  - `tags`：第三方标签命中
  - `tags[].source`：标签来源
  - `tags[].label`：标签名称
  - `tags[].confidence`：标签置信度
  - `tags[].url`：标签来源链接
  - `extra_features`：预留扩展字段
- `POST /risk/contract`
  - `contract_address`：合约地址
  - `chain`：链标识，当前固定为 `monad`
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
  - `tags`：第三方标签命中（与钓鱼接口相同）
  - `extra_features`：预留扩展字段
- `POST /risk/slippage`
  - `pool_address`：池子地址（如 Uniswap pool）
  - `chain`：链标识，当前固定为 `monad`
  - `token_in`：输入代币地址
  - `token_out`：输出代币地址
  - `amount_in`：输入金额（字符串表示）
  - `time_window`：统计窗口，默认 `5m`
  - `trade_type`：`exact_in` / `exact_out`
  - `interaction_type`：交互类型，默认 `swap`
  - `orderbook`：订单簿信息
  - `orderbook.bids`：买单档位列表
  - `orderbook.asks`：卖单档位列表
  - `orderbook.bids[].price`：买单价格
  - `orderbook.bids[].amount`：买单数量
  - `orderbook.asks[].price`：卖单价格
  - `orderbook.asks[].amount`：卖单数量
  - `orderbook.spread_bps`：价差（bps，可选）
  - `pool`：池子统计信息
  - `pool.liquidity`：流动性
  - `pool.volume_5m`：5 分钟成交量
  - `pool.volume_1h`：1 小时成交量
  - `pool.price_impact_pct`：价格冲击百分比
  - `extra_features`：预留扩展字段
