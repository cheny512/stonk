from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def _camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.title() for part in tail)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True, extra="forbid")


class EvidenceItem(ApiModel):
    id: str
    category: Literal["price", "technical", "fundamental", "model", "event", "options"]
    label: str
    value: Any
    source: str
    observed_at: str
    url: str | None = None


class ResearchPacket(ApiModel):
    schema_version: str = "1.0"
    packet_id: str
    ticker: str
    as_of: str
    generated_at: str
    evidence: list[EvidenceItem]
    limitations: list[str] = Field(default_factory=list)


class InvestmentThesis(ApiModel):
    executive_summary: str
    bull_case: str
    bear_case: str
    sentiment_score: int = Field(ge=1, le=10)
    uncertainties: list[str] = Field(default_factory=list)
    what_would_change_my_mind: list[str] = Field(default_factory=list)
    evidence_citations: list[str] = Field(default_factory=list)
    provider: str = "deterministic"
    grounding_status: Literal["grounded", "deterministic", "rejected"] = "deterministic"


class GroundingError(ValueError):
    pass


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _add(
    evidence: list[EvidenceItem],
    *,
    item_id: str,
    category: EvidenceItem.__annotations__["category"],
    label: str,
    value: Any,
    source: str,
    observed_at: str,
    url: str | None = None,
) -> None:
    if value in (None, {}, []):
        return
    evidence.append(
        EvidenceItem(
            id=item_id,
            category=category,
            label=label,
            value=value,
            source=source,
            observed_at=observed_at,
            url=url,
        )
    )


def build_research_packet(
    ticker: str,
    news_data: dict[str, Any],
    technical_data: dict[str, Any],
    prediction_data: dict[str, Any],
) -> ResearchPacket:
    symbol = ticker.strip().upper()
    generated_at = _timestamp()
    history = technical_data.get("history") or {}
    as_of = str(history.get("end") or prediction_data.get("as_of") or generated_at[:10])
    evidence: list[EvidenceItem] = []

    _add(
        evidence,
        item_id="price-history",
        category="price",
        label="Observed price history summary",
        value=history,
        source=str(technical_data.get("priceProvider") or "stored adjusted OHLCV"),
        observed_at=as_of,
    )
    _add(
        evidence,
        item_id="technical-indicators",
        category="technical",
        label="Deterministic technical indicators",
        value=technical_data.get("indicators"),
        source="stonk deterministic calculations",
        observed_at=as_of,
    )
    fundamentals = technical_data.get("fundamentals") or {}
    if fundamentals.get("available"):
        _add(
            evidence,
            item_id="fundamentals-current",
            category="fundamental",
            label="Current fundamentals snapshot",
            value=fundamentals,
            source=str(fundamentals.get("provider") or "unknown provider"),
            observed_at=str(fundamentals.get("retrievedAt") or generated_at),
        )
    _add(
        evidence,
        item_id="model-prediction",
        category="model",
        label="Deterministic model output",
        value=prediction_data,
        source="stonk model",
        observed_at=as_of,
    )

    for index, item in enumerate(news_data.get("items") or [], start=1):
        title = item.get("title")
        if not title:
            continue
        _add(
            evidence,
            item_id=f"event-{index}",
            category="event",
            label=str(title),
            value={"title": title, "summary": item.get("summary")},
            source=str(item.get("publisher") or news_data.get("provider") or "unknown publisher"),
            observed_at=str(item.get("published") or news_data.get("retrievedAt") or generated_at),
            url=item.get("url"),
        )

    canonical = json.dumps(
        [item.model_dump(mode="json", by_alias=True) for item in evidence],
        sort_keys=True,
        separators=(",", ":"),
    )
    packet_id = hashlib.sha256(f"{symbol}|{as_of}|{canonical}".encode()).hexdigest()[:16]
    limitations = [
        "Generated explanations are research aids, not personalized financial advice.",
        "Current fundamentals may not be point-in-time historical fundamentals.",
    ]
    if news_data.get("provider") == "yfinance":
        limitations.append("News is an aggregator feed; verify material claims against primary filings.")
    return ResearchPacket(
        packet_id=packet_id,
        ticker=symbol,
        as_of=as_of,
        generated_at=generated_at,
        evidence=evidence,
        limitations=limitations,
    )


def validate_thesis_grounding(
    thesis: InvestmentThesis,
    packet: ResearchPacket,
    *,
    require_citations: bool,
) -> InvestmentThesis:
    valid_ids = {item.id for item in packet.evidence}
    unsupported = sorted(set(thesis.evidence_citations) - valid_ids)
    if unsupported:
        raise GroundingError(f"Unsupported evidence IDs: {', '.join(unsupported)}")
    if require_citations and not thesis.evidence_citations:
        raise GroundingError("Generated thesis did not cite any packet evidence")
    return thesis.model_copy(update={"grounding_status": "grounded" if require_citations else "deterministic"})


def deterministic_thesis(packet: ResearchPacket, *, reason: str | None = None) -> InvestmentThesis:
    by_id = {item.id: item for item in packet.evidence}
    prediction = by_id.get("model-prediction")
    indicators = by_id.get("technical-indicators")
    pred = prediction.value if prediction and isinstance(prediction.value, dict) else {}
    tech = indicators.value if indicators and isinstance(indicators.value, dict) else {}
    probability = pred.get("probability_up", pred.get("probabilityUp"))
    trend = str(tech.get("trend") or "mixed")
    citations = [key for key in ("model-prediction", "technical-indicators", "price-history") if key in by_id]

    if probability is None:
        summary = f"There is not enough validated model evidence to assign {packet.ticker} a directional view."
        score = 5
        bull = "A bull case requires improving measured trend, fundamentals, or a sourced catalyst."
        bear = "A bear case requires deteriorating measured trend, fundamentals, or a sourced adverse event."
    else:
        probability_value = max(0.0, min(1.0, float(probability)))
        score = max(1, min(10, round(1 + probability_value * 8)))
        summary = (
            f"The deterministic model assigns {probability_value:.1%} probability of an upward move; "
            f"the measured technical regime is {trend}."
        )
        bull = "The positive scenario requires the measured trend and model probability to remain supportive."
        bear = "The negative scenario is a model-regime change or price invalidation unsupported by recent history."

    uncertainties = list(packet.limitations)
    if reason:
        uncertainties.insert(0, reason)
    return InvestmentThesis(
        executive_summary=summary,
        bull_case=bull,
        bear_case=bear,
        sentiment_score=score,
        uncertainties=uncertainties,
        what_would_change_my_mind=[
            "A material filing or earnings update that changes the fundamental evidence.",
            "A break of the deterministic invalidation level or a material loss of model calibration.",
        ],
        evidence_citations=citations,
        provider="deterministic",
        grounding_status="deterministic",
    )
