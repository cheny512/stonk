from __future__ import annotations

import pytest
import json
from evals.run_evals import run_evals
from market_predictor.graph import InvestmentThesis

def test_eval_run_mocked(fake_llm):
    # run_evals now accepts an llm parameter
    # We can inject fake_llm into it.
    # judge_llm also needs to be mocked to return EvalScore
    from evals.run_evals import EvalScore
    
    judge_output = EvalScore(
        factual_consistency=5,
        conviction_logic=5,
        hallucination_check=5,
        reasoning="Perfect score for mocked test."
    )
    
    class FakeJudge:
        def invoke(self, messages):
            return judge_output

    # We need to make sure test_cases.jsonl exists in the expected location or mock it.
    # For now, let's assume it exists as I created it in a previous turn (or I'll create a temp one).
    run_evals(llm=fake_llm, judge_llm=FakeJudge())
    
    # Assert report.md was created
    import os
    assert os.path.exists("evals/report.md")
