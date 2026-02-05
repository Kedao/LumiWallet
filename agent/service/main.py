from fastapi import FastAPI

from .handlers import RiskService
from .models import ContractRiskRequest, PhishingRiskRequest, RiskResponse, SlippageRiskRequest

app = FastAPI(title="LumiWallet Risk Service", version="0.1.0")
service = RiskService()


@app.post("/risk/phishing", response_model=RiskResponse)
def phishing_risk(req: PhishingRiskRequest) -> RiskResponse:
    return service.phishing(req)


@app.post("/risk/contract", response_model=RiskResponse)
def contract_risk(req: ContractRiskRequest) -> RiskResponse:
    return service.contract(req)


@app.post("/risk/slippage", response_model=RiskResponse)
def slippage_risk(req: SlippageRiskRequest) -> RiskResponse:
    return service.slippage(req)
