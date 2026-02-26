try:
    from service.handlers import RiskService
    from service.models import ContractRiskRequest, PhishingRiskRequest, SlippageRiskRequest
except ModuleNotFoundError:
    from agent.service.handlers import RiskService
    from agent.service.models import ContractRiskRequest, PhishingRiskRequest, SlippageRiskRequest


def _fallback_service() -> RiskService:
    service = RiskService()
    service._phishing_agent = None
    service._contract_agent = None
    service._slippage_agent = None
    return service


def test_phishing_fallback_default_zh() -> None:
    service = _fallback_service()
    resp = service.phishing(PhishingRiskRequest(address="0xabc"))

    assert resp.risk_level == "未知"
    assert "风险评估" in resp.summary
    assert len(resp.top_reasons) == 3


def test_contract_fallback_en() -> None:
    service = _fallback_service()
    resp = service.contract(ContractRiskRequest(contract_address="0xdef", lang="en"))

    assert resp.risk_level == "unknown"
    assert "Unable to assess contract risk" in resp.summary
    assert len(resp.top_reasons) == 3


def test_slippage_fallback_lang_switch() -> None:
    service = _fallback_service()

    zh_resp = service.slippage(
        SlippageRiskRequest(pool_address="0xpool", token_in="0x1", token_out="0x2", amount_in="10")
    )
    en_resp = service.slippage(
        SlippageRiskRequest(pool_address="0xpool", token_in="0x1", token_out="0x2", amount_in="10", lang="en")
    )

    assert "滑点评估" in zh_resp.summary
    assert "Unable to assess slippage risk" in en_resp.summary
