from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class TagInfo(BaseModel):
    source: str
    label: str
    confidence: Optional[float] = None
    url: Optional[str] = None


class LifecycleInfo(BaseModel):
    first_seen_timestamp: Optional[int] = None
    last_seen_timestamp: Optional[int] = None
    active_days: Optional[int] = None
    account_age_days: Optional[int] = None
    gas_funder: Optional[str] = None


# NOTE: TxStats requires aggregation; enable when frontend can provide stats.
# class TxStats(BaseModel):
#     window: Optional[str] = None
#     tx_count: Optional[int] = None
#     in_count: Optional[int] = None
#     out_count: Optional[int] = None
#     in_out_ratio: Optional[float] = None
#     fast_outflow_pct: Optional[float] = None
#     median_hold_time_sec: Optional[int] = None
#     approve_count: Optional[int] = None
#     contract_interactions: Optional[int] = None


class AccountTransaction(BaseModel):
    tx_hash: str
    timestamp: int
    from_address: str
    to_address: Optional[str] = None
    value: Optional[str] = None
    token_address: Optional[str] = None
    token_decimals: Optional[int] = None
    tx_type: Optional[str] = Field(
        default=None, description="transfer | approve | contract_call | swap | mint | stake"
    )
    contract_address: Optional[str] = None
    method_sig: Optional[str] = None
    success: Optional[bool] = None


# NOTE: Graph signals require address graph indexing; enable when available.
# class GraphSignals(BaseModel):
#     cluster_score: Optional[float] = None
#     hops_to_tagged: Optional[int] = None
#     similar_addresses: Optional[List[str]] = None


class PhishingRiskRequest(BaseModel):
    address: str
    chain: str = "monad"
    lang: Optional[str] = Field(default="zh", description="Response language: zh | en")
    interaction_type: Optional[str] = Field(
        default=None, description="transfer | approve | contract_call"
    )
    transactions: Optional[List[AccountTransaction]] = Field(
        default=None, description="Most recent up to 100 transactions"
    )
    lifecycle: Optional[LifecycleInfo] = None
    # tx_stats: Optional[TxStats] = None
    # graph: Optional[GraphSignals] = None
    tags: Optional[List[TagInfo]] = None
    extra_features: Optional[Dict[str, Any]] = None


class ContractCodeInfo(BaseModel):
    verified: bool
    source_code: Optional[str] = None
    bytecode: Optional[str] = None
    compiler_version: Optional[str] = None
    abi: Optional[str] = None


class ContractPermissions(BaseModel):
    owner: Optional[str] = None
    admin: Optional[str] = None
    can_upgrade: Optional[bool] = None
    can_pause: Optional[bool] = None
    can_blacklist: Optional[bool] = None
    can_mint: Optional[bool] = None
    can_burn: Optional[bool] = None


class ContractProxyInfo(BaseModel):
    is_proxy: Optional[bool] = None
    implementation_address: Optional[str] = None
    admin_address: Optional[str] = None


class ContractCreatorInfo(BaseModel):
    creator_address: Optional[str] = None
    creation_tx_hash: Optional[str] = None
    creation_timestamp: Optional[int] = None


class TokenBehaviorFlags(BaseModel):
    has_transfer_tax: Optional[bool] = None
    tax_changeable: Optional[bool] = None
    max_tx_limit: Optional[bool] = None
    max_wallet_limit: Optional[bool] = None
    trading_restrictions: Optional[bool] = None


# NOTE: Runtime signal extraction requires log indexing and method decoding.
# Uncomment when data pipeline is ready.
# class ContractRuntimeSignals(BaseModel):
#     suspicious_events: Optional[List[str]] = None
#     recent_admin_actions: Optional[List[str]] = None
#     interaction_counterparties: Optional[List[str]] = None


class ContractRiskRequest(BaseModel):
    contract_address: str
    chain: str = "monad"
    lang: Optional[str] = Field(default="zh", description="Response language: zh | en")
    interaction_type: Optional[str] = Field(
        default=None, description="approve | swap | mint | stake | contract_call"
    )
    creator: Optional[ContractCreatorInfo] = None
    proxy: Optional[ContractProxyInfo] = None
    permissions: Optional[ContractPermissions] = None
    token_flags: Optional[TokenBehaviorFlags] = None
    # runtime: Optional[ContractRuntimeSignals] = None
    code: Optional[ContractCodeInfo] = None
    tags: Optional[List[TagInfo]] = None
    extra_features: Optional[Dict[str, Any]] = None


class OrderBookLevel(BaseModel):
    price: str
    amount: str


class OrderBookStats(BaseModel):
    bids: Optional[List[OrderBookLevel]] = None
    asks: Optional[List[OrderBookLevel]] = None
    spread_bps: Optional[float] = None


class PoolStats(BaseModel):
    liquidity: Optional[float] = None
    volume_5m: Optional[float] = None
    volume_1h: Optional[float] = None
    price_impact_pct: Optional[float] = None


class SlippageRiskRequest(BaseModel):
    pool_address: str
    chain: str = "monad"
    lang: Optional[str] = Field(default="zh", description="Response language: zh | en")
    token_in: str
    token_out: str
    amount_in: str
    time_window: Optional[str] = "5m"
    trade_type: Optional[str] = "exact_in"
    interaction_type: Optional[str] = Field(
        default=None, description="swap"
    )
    orderbook: Optional[OrderBookStats] = None
    pool: Optional[PoolStats] = None
    extra_features: Optional[Dict[str, Any]] = None


class RiskReason(BaseModel):
    reason: str = Field(description="主要风险原因的简短标题（中文或英文，取决于请求语言）")
    explanation: str = Field(description="对该风险原因的具体解释说明")


class SecurityRiskResponse(BaseModel):
    risk_level: Literal["high", "medium", "low", "unknown", "高", "中", "低", "未知"] = Field(
        description=(
            "总体风险等级。英文可用 high/medium/low/unknown，中文可用 高/中/低/未知。"
        )
    )
    summary: str = Field(description="总体风险结论摘要，1~2 句即可")
    confidence: float = Field(
        ge=0,
        le=1,
        description="模型对本次风险判断的置信度，取值范围 0~1，越大代表越确定",
    )
    top_reasons: List[RiskReason] = Field(
        default_factory=list,
        min_length=3,
        max_length=3,
        description="最关键的 3 条风险原因及解释，按重要性排序",
    )


class SlippageFactor(BaseModel):
    factor: str = Field(description="导致滑点的关键因素名称")
    explanation: str = Field(description="该因素如何影响滑点与执行结果的解释")


class SlippageRiskResponse(BaseModel):
    expected_slippage_pct: float = Field(
        ge=0,
        description="预期滑点百分比（数值）。例如 1.35 表示约 1.35% 的预期滑点",
    )
    exceed_slippage_probability_label: Literal["high", "medium", "low", "unknown", "高", "中", "低", "未知"] = Field(
        description=(
            "超过预期滑点概率的标签化结果。"
            "英文可用 high/medium/low/unknown，中文可用 高/中/低/未知。"
        )
    )
    summary: str = Field(description="对本次交易滑点风险的总结性结论")
    key_factors: List[SlippageFactor] = Field(
        default_factory=list,
        min_length=2,
        description="关键影响因素列表，至少 2 条",
    )
    market_context: Dict[str, Any] = Field(
        default_factory=dict,
        description="用于支撑判断的市场上下文数据，例如流动性、价差、订单数量等",
    )
