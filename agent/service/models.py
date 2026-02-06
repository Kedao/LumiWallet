from typing import Any, Dict, List, Optional
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


class TxStats(BaseModel):
    window: Optional[str] = None
    tx_count: Optional[int] = None
    in_count: Optional[int] = None
    out_count: Optional[int] = None
    in_out_ratio: Optional[float] = None
    fast_outflow_pct: Optional[float] = None
    median_hold_time_sec: Optional[int] = None
    approve_count: Optional[int] = None
    contract_interactions: Optional[int] = None


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


class GraphSignals(BaseModel):
    cluster_score: Optional[float] = None
    hops_to_tagged: Optional[int] = None
    similar_addresses: Optional[List[str]] = None


class PhishingRiskRequest(BaseModel):
    address: str
    chain: str = "monad"
    interaction_type: Optional[str] = Field(
        default=None, description="transfer | approve | contract_call"
    )
    transactions: Optional[List[AccountTransaction]] = Field(
        default=None, description="Most recent up to 100 transactions"
    )
    lifecycle: Optional[LifecycleInfo] = None
    tx_stats: Optional[TxStats] = None
    graph: Optional[GraphSignals] = None
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


class OrderBookStats(BaseModel):
    bids: Optional[float] = None
    asks: Optional[float] = None
    spread_bps: Optional[float] = None


class PoolStats(BaseModel):
    liquidity: Optional[float] = None
    volume_5m: Optional[float] = None
    volume_1h: Optional[float] = None
    price_impact_pct: Optional[float] = None


class SlippageRiskRequest(BaseModel):
    pool_address: str
    chain: str = "monad"
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


class RiskDetails(BaseModel):
    reasons: List[str] = Field(default_factory=list)
    evidence: List[str] = Field(default_factory=list)
    data_gaps: List[str] = Field(default_factory=list)
    extra: Dict[str, Any] = Field(default_factory=dict)


class RiskResponse(BaseModel):
    risk_level: str
    summary: str
    confidence: float
    details: RiskDetails
