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
    lifecycle: Optional[LifecycleInfo] = None
    tx_stats: Optional[TxStats] = None
    graph: Optional[GraphSignals] = None
    tags: Optional[List[TagInfo]] = None
    evidence: Optional[List[str]] = None
    extra_features: Optional[Dict[str, Any]] = None


class ContractCodeInfo(BaseModel):
    verified: bool
    source_code: Optional[str] = None
    bytecode: Optional[str] = None
    compiler_version: Optional[str] = None
    abi: Optional[str] = None


class ContractRiskRequest(BaseModel):
    contract_address: str
    chain: str = "monad"
    interaction_type: Optional[str] = Field(
        default=None, description="approve | swap | mint | stake | contract_call"
    )
    code: Optional[ContractCodeInfo] = None
    tags: Optional[List[TagInfo]] = None
    evidence: Optional[List[str]] = None
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
    evidence: Optional[List[str]] = None
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
