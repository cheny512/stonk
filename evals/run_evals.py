from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_predictor.graph import synthesize_research_graph
from market_predictor.research_packet import InvestmentThesis, build_research_packet


class EvalScore(BaseModel):
    factual_consistency: int = Field(ge=1, le=5)
    conviction_logic: int = Field(ge=1, le=5)
    hallucination_check: int = Field(ge=1, le=5)
    reasoning: str


def deterministic_checks(case: dict[str, Any], thesis: dict[str, Any]) -> dict[str, Any]:
    packet = build_research_packet(
        case["ticker"], case["news_data"], case["technical_data"], case["prediction_data"]
    )
    valid_ids = {item.id for item in packet.evidence}
    citations = set(thesis.get("evidenceCitations") or thesis.get("evidence_citations") or [])
    unsupported = sorted(citations - valid_ids)
    score = thesis.get("sentimentScore", thesis.get("sentiment_score"))
    schema_valid = True
    try:
        InvestmentThesis.model_validate(thesis)
    except Exception:
        schema_valid = False
    leaked_secret = bool(re.search(r"(?:api[_-]?key|bearer)\s*[=:]\s*\S+", json.dumps(thesis), re.I))
    return {
        "schemaValid": schema_valid,
        "citationCoverage": bool(citations),
        "unsupportedCitations": unsupported,
        "sentimentInRange": isinstance(score, int) and 1 <= score <= 10,
        "secretLeak": leaked_secret,
        "pass": schema_valid and bool(citations) and not unsupported and not leaked_secret,
    }


def run_evals(llm: Any | None = None, judge_llm: Any | None = None) -> dict[str, Any]:
    """Run deterministic grounding checks everywhere; an LLM judge is optional and additive."""
    test_cases_path = ROOT / "evals" / "test_cases.jsonl"
    report_path = ROOT / "evals" / "report.md"
    cases = [json.loads(line) for line in test_cases_path.read_text().splitlines() if line.strip()]
    results: list[dict[str, Any]] = []

    for case in cases:
        thesis = synthesize_research_graph(
            ticker=case["ticker"],
            news_data=case["news_data"],
            technical_data=case["technical_data"],
            prediction_data=case["prediction_data"],
            llm=llm,
        )
        checks = deterministic_checks(case, thesis)
        judge_score = None
        if judge_llm is not None:
            judge_score = judge_llm.invoke(
                [
                    {"role": "system", "content": "Score factual consistency using only the supplied evidence."},
                    {"role": "user", "content": json.dumps({"case": case, "thesis": thesis})},
                ]
            )
        results.append(
            {
                "ticker": case["ticker"],
                "thesis": thesis,
                "checks": checks,
                "scores": judge_score.model_dump() if judge_score is not None else None,
            }
        )

    passed = sum(int(item["checks"]["pass"]) for item in results)
    lines = [
        "# Automated Eval Report",
        "",
        "Deterministic grounding checks run without an API key. Optional model-judge scores never replace them.",
        "",
        f"- Cases: {len(results)}",
        f"- Passed: {passed}",
        f"- Pass rate: {passed / len(results):.1%}" if results else "- Pass rate: 0.0%",
        "",
    ]
    for item in results:
        lines.extend(
            [
                f"## {item['ticker']}",
                "",
                f"- Deterministic checks: {'PASS' if item['checks']['pass'] else 'FAIL'}",
                f"- Citation coverage: {item['checks']['citationCoverage']}",
                f"- Unsupported citations: {item['checks']['unsupportedCitations']}",
                f"- Schema valid: {item['checks']['schemaValid']}",
                f"- Secret leak: {item['checks']['secretLeak']}",
                "",
            ]
        )
    report_path.write_text("\n".join(lines))
    return {"cases": len(results), "passed": passed, "results": results, "report": str(report_path)}


if __name__ == "__main__":
    outcome = run_evals()
    print(f"Evals complete: {outcome['passed']}/{outcome['cases']} passed")
    raise SystemExit(0 if outcome["passed"] == outcome["cases"] else 1)
