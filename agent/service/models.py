from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class TagInfo(BaseModel):
    source: str
    label: str
    confidence: Optional[float] = None
    url: Optional[str] = None


class AccountTransaction(BaseModel):
    tx_hash: str
    timestamp: int
    from_address: str = Field(description="Historical counterparty candidate address source")
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


class PhishingRiskRequest(BaseModel):
    address: str
    chain: str = "monad"
    lang: Optional[str] = Field(default="zh", description="Response language: zh | en")
    transactions: Optional[List[AccountTransaction]] = Field(
        default=None,
        description="Locally stored historical transactions used for address similarity comparison",
    )


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


class SlippagePoolStats(BaseModel):
    price_impact_pct: Optional[float] = None
    token_pay_amount: Optional[str] = None
    token_get_amount: Optional[str] = None
    type: Optional[str] = "AMM"


class SlippageRiskRequest(BaseModel):
    pool_address: str
    chain: str = "monad"
    lang: Optional[str] = Field(default="zh", description="Response language: zh | en")
    token_pay_amount: str
    interaction_type: Optional[str] = Field(
        default="swap", description="swap"
    )
    pool: Optional[SlippagePoolStats] = None


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


class PhishingRiskResponse(BaseModel):
    risk_level: Literal["high", "medium", "low", "unknown", "高", "中", "低", "未知"] = Field(
        description="钓鱼风险等级。英文可用 high/medium/low/unknown，中文可用 高/中/低/未知。"
    )
    summary: str = Field(description="钓鱼风险总结,一句话总结清楚，主要聚焦在地址差异。不要列出地址，简短高效即可。")
    confidence: float = Field(ge=0, le=1, description="模型对钓鱼风险判断的置信度")
    most_similar_address: Optional[str] = Field(
        default=None,
        description="本地交易记录中与目标地址最相似的地址",
    )
    most_similar_similarity: float = Field(
        ge=0,
        le=1,
        description="最相似地址与目标地址的加权相似度（0~1）",
    )
    most_similar_transactions: List[AccountTransaction] = Field(
        default_factory=list,
        description="与最相似地址相关的最近交易详情，按 timestamp 倒序，最多 3 笔",
    )
    similarity_method: str = Field(
        default="max(prefix,suffix,levenshtein,head_bag_6)",
        description="相似度计算方法说明",
    )


class SlippageRiskResponse(BaseModel):
    slippage_level: Literal["high", "medium", "low", "unknown", "高", "中", "低", "未知"] = Field(
        description="滑点大小的定性等级。英文可用 high/medium/low/unknown，中文可用 高/中/低/未知。"
    )
    summary: str = Field(description="一句通俗解释为什么会发生这种滑点")
