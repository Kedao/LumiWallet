import os
import sys

from fastapi import FastAPI
import uvicorn

if __package__ is None or __package__ == "":
    # Support running as a script: `uv run service/main.py`
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from service.handlers import RiskService
    from service.models import (
        ContractRiskRequest,
        PhishingRiskResponse,
        PhishingRiskRequest,
        SecurityRiskResponse,
        SlippageRiskRequest,
        SlippageRiskResponse,
    )
else:
    from .handlers import RiskService
    from .models import (
        ContractRiskRequest,
        PhishingRiskResponse,
        PhishingRiskRequest,
        SecurityRiskResponse,
        SlippageRiskRequest,
        SlippageRiskResponse,
    )

app = FastAPI(title="LumiWallet Risk Service", version="0.1.0")
service = RiskService()


@app.post("/risk/phishing", response_model=PhishingRiskResponse)
def phishing_risk(req: PhishingRiskRequest) -> PhishingRiskResponse:
    return service.phishing(req)


@app.post("/risk/contract", response_model=SecurityRiskResponse)
def contract_risk(req: ContractRiskRequest) -> SecurityRiskResponse:
    return service.contract(req)


@app.post("/risk/slippage", response_model=SlippageRiskResponse)
def slippage_risk(req: SlippageRiskRequest) -> SlippageRiskResponse:
    return service.slippage(req)


def run_http_server() -> None:
    uvicorn.run("service.main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    run_http_server()
