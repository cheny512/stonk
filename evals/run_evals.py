import json
import os
import sys
from pathlib import Path
from typing import Any
from pydantic import BaseModel, Field
from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_predictor.graph import synthesize_research_graph

class EvalScore(BaseModel):
    factual_consistency: int = Field(description="Score 1-5: Does the thesis contradict the provided raw data? (5 = perfect consistency)")
    conviction_logic: int = Field(description="Score 1-5: Is the sentiment score mathematically/logically justified by the bull/bear case?")
    hallucination_check: int = Field(description="Score 1-5: Did the model invent metrics or news not present in the prompt? (5 = no hallucinations)")
    reasoning: str = Field(description="Brief explanation of the scores.")

def run_evals(llm: Any | None = None, judge_llm: Any | None = None):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key and not llm:
        print("Skipping evals: OPENAI_API_KEY not found.")
        return

    test_cases_path = ROOT / "evals" / "test_cases.jsonl"
    report_path = ROOT / "evals" / "report.md"
    
    with open(test_cases_path, "r") as f:
        cases = [json.loads(line) for line in f]

    results = []
    print(f"Running evals on {len(cases)} test cases...")

    for i, case in enumerate(cases):
        print(f"Evaluating Case {i+1}: {case['ticker']}")
        
        # 1. Run the Multi-Agent Graph
        thesis = synthesize_research_graph(
            ticker=case["ticker"],
            news_data=case["news_data"],
            technical_data=case["technical_data"],
            prediction_data=case["prediction_data"],
            llm=llm
        )

        # 2. Use LLM-as-a-Judge to evaluate the output
        if judge_llm:
            completion = judge_llm.invoke([
                {"role": "system", "content": "You are a strict quantitative evaluation judge. Score the AI output."},
                {"role": "user", "content": f"Evaluate the following AI-generated investment thesis based on the raw data provided.\n\nRAW DATA PROVIDED TO AI:\nTicker: {case['ticker']}\nNews: {json.dumps(case['news_data'])}\nTechnicals: {json.dumps(case['technical_data'])}\nPrediction: {json.dumps(case['prediction_data'])}\n\nAI THESIS GENERATED:\n{json.dumps(thesis, indent=2)}"}
            ])
            score = completion # Assume judge_llm returns the parsed object if injected
        else:
            client = OpenAI(api_key=api_key)
            prompt = f"""
            Evaluate the following AI-generated investment thesis based on the raw data provided.
            
            RAW DATA PROVIDED TO AI:
            Ticker: {case['ticker']}
            News: {json.dumps(case['news_data'])}
            Technicals: {json.dumps(case['technical_data'])}
            Prediction: {json.dumps(case['prediction_data'])}
            
            AI THESIS GENERATED:
            {json.dumps(thesis, indent=2)}
            """

            try:
                resp = client.beta.chat.completions.parse(
                    model="gpt-4o", # Use a smarter model as the judge
                    messages=[
                        {"role": "system", "content": "You are a strict quantitative evaluation judge. Score the AI output."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format=EvalScore,
                )
                score = resp.choices[0].message.parsed
            except Exception as e:
                print(f"Eval failed for {case['ticker']}: {e}")
                continue

        if score:
            results.append({
                "ticker": case["ticker"],
                "thesis": thesis,
                "scores": score.model_dump()
            })

    # 3. Generate Markdown Report
    with open(report_path, "w") as f:
        f.write("# Automated Eval Report\n\n")
        total_factual = 0
        total_conviction = 0
        total_hallucination = 0
        
        for res in results:
            scores = res['scores']
            f.write(f"## {res['ticker']}\n")
            f.write(f"**Factual Consistency:** {scores['factual_consistency']}/5\n")
            f.write(f"**Conviction Logic:** {scores['conviction_logic']}/5\n")
            f.write(f"**No-Hallucination:** {scores['hallucination_check']}/5\n")
            f.write(f"**Judge Reasoning:** {scores['reasoning']}\n\n")
            
            total_factual += scores['factual_consistency']
            total_conviction += scores['conviction_logic']
            total_hallucination += scores['hallucination_check']
            
        n = len(results) or 1
        f.write(f"## Overall Averages\n")
        f.write(f"- Factual Consistency: {total_factual/n:.1f}/5\n")
        f.write(f"- Conviction Logic: {total_conviction/n:.1f}/5\n")
        f.write(f"- No-Hallucination: {total_hallucination/n:.1f}/5\n")

    print(f"Evals complete. Report written to {report_path}")

if __name__ == "__main__":
    run_evals()
