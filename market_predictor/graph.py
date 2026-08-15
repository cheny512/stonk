"""Compatibility entry point for the grounded synthesis pipeline.

The original implementation described two sequential functions as a multi-agent
hedge-fund workflow. This module keeps the public function used by tests and
callers while exposing the simpler, accurate boundary: one deterministic
research packet followed by one optional structured explanation call.
"""

from __future__ import annotations

import json
import os
from typing import Any

from langchain_openai import ChatOpenAI

from market_predictor.logging_config import get_logger
from market_predictor.research_packet import (
    GroundingError,
    InvestmentThesis,
    build_research_packet,
    deterministic_thesis,
    validate_thesis_grounding,
)

logger = get_logger(__name__)


def configured_provider() -> str:
    requested = os.environ.get("STONK_LLM_PROVIDER", "disabled").strip().lower()
    return requested if requested in {"disabled", "local", "openai"} else "disabled"


def build_configured_llm() -> Any | None:
    provider = configured_provider()
    if provider == "disabled":
        return None
    if provider == "local":
        base_url = os.environ.get("STONK_LOCAL_LLM_BASE_URL", "http://127.0.0.1:11434/v1")
        model = os.environ.get("STONK_LOCAL_LLM_MODEL", "gpt-oss:20b")
        return ChatOpenAI(model=model, temperature=0, api_key="local", base_url=base_url)
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    model = os.environ.get("STONK_OPENAI_MODEL", "gpt-5.6-luna")
    return ChatOpenAI(model=model, temperature=0, api_key=api_key)


def _invoke_structured(llm: Any, packet_json: str) -> InvestmentThesis:
    structured = llm.with_structured_output(InvestmentThesis)
    result = structured.invoke(
        [
            {
                "role": "system",
                "content": (
                    "You are a careful stock-research explainer. Use only the supplied ResearchPacket. "
                    "Every factual conclusion must cite one or more exact evidence IDs from the packet. "
                    "Distinguish observation from inference, surface uncertainty, and never provide a "
                    "guaranteed outcome or personalized instruction."
                ),
            },
            {
                "role": "user",
                "content": f"Explain and challenge this research packet:\n{packet_json}",
            },
        ]
    )
    if isinstance(result, InvestmentThesis):
        return result
    return InvestmentThesis.model_validate(result)


def synthesize_research_graph(
    ticker: str,
    news_data: dict[str, Any],
    technical_data: dict[str, Any],
    prediction_data: dict[str, Any],
    llm: Any | None = None,
) -> dict[str, Any]:
    packet = build_research_packet(ticker, news_data, technical_data, prediction_data)
    selected_llm = llm or build_configured_llm()
    if selected_llm is None:
        return deterministic_thesis(packet).model_dump(by_alias=True, mode="json")

    try:
        thesis = _invoke_structured(
            selected_llm,
            json.dumps(packet.model_dump(by_alias=True, mode="json"), separators=(",", ":")),
        )
        provider = "injected" if llm is not None else configured_provider()
        thesis = thesis.model_copy(update={"provider": provider})
        validated = validate_thesis_grounding(thesis, packet, require_citations=True)
        return validated.model_dump(by_alias=True, mode="json")
    except GroundingError as exc:
        logger.warning("ai_grounding_rejected", ticker=ticker, reason=str(exc))
        fallback = deterministic_thesis(packet, reason=f"AI output rejected: {exc}")
        return fallback.model_copy(update={"grounding_status": "rejected"}).model_dump(by_alias=True, mode="json")
    except Exception as exc:
        logger.exception("ai_synthesis_failed", ticker=ticker)
        return deterministic_thesis(packet, reason=f"AI provider unavailable: {type(exc).__name__}").model_dump(
            by_alias=True, mode="json"
        )
