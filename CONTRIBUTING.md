# Contributing

## Setup

Use Python 3.12 and Node 22.12 or newer. Copy `.env.example` to `.env`; tests must pass without provider credentials.

## Pull requests

- Keep numerical calculations outside language-model prompts.
- Add a test for every failure mode or bug fix.
- Do not use live network calls in the default test suite.
- Document the observation time and source for new data fields.
- Add or update an eval when changing the research-packet or thesis schema.
- Run `python -m pytest` and `npm run check` before requesting review.

## Backtest changes

State the training window, purge/embargo behavior, holding period, cost model, benchmark, and whether positions overlap. A higher historical return is not sufficient evidence to merge a change if it weakens leakage controls or reproducibility.

## AI changes

AI output must remain optional, structured, source-cited, and replaceable by a deterministic fallback. A model-judge score may supplement but never replace deterministic schema, citation, privacy, and numerical-fidelity checks.
