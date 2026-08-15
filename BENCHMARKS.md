# Verification record

This file records reproducible engineering measurements, not investment performance claims.

## 2026-08-14 local verification

- Backend: 58 tests passed.
- Backend statement coverage: 62%; enforced floor is 50%.
- Grounding evals: 3/3 fixtures passed deterministic schema, citation, range, and secret-leak checks.
- Frontend TypeScript: passed with `tsc --noEmit`.
- Frontend production build: passed.
- Main application chunk: reduced from approximately 515 KB to 197 KB minified by splitting the UI framework bundle.
- Stock view lazy chunk: approximately 34 KB minified.

Environment: macOS, Python 3.13.2, Node 20.15.0. Node emitted a compatibility warning; `.nvmrc` and CI use Node 22.12.

## Model-performance publication rule

No headline accuracy or return is published until the run identifies:

- immutable dataset hash and provider;
- historical universe membership policy;
- feature and model version;
- prediction horizon and purge gap;
- costs, slippage, and overlap policy;
- benchmark and evaluation dates;
- signal count and 95% confidence interval.

Run the API's `/api/research/walk-forward/{ticker}` endpoint against a pinned dataset to produce candidate results. Historical results must not be described as expected future returns.
