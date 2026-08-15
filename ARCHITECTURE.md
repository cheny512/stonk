# Architecture and trust model

## Product boundary

Stonk helps a user investigate a security. It does not place trades, manage money, optimize a personal portfolio, or claim that a historical relationship will persist.

The core invariant is: **language models explain evidence; deterministic code owns numbers**.

## Components

1. Provider adapters normalize equity bars and option quotes.
2. Ingestion validates and stores timestamped observations.
3. Feature code derives signals using only information available at the observation date.
4. Backtests evaluate predictions after a purged chronological split or across walk-forward folds.
5. A `ResearchPacket` assigns stable IDs to quantitative and current-event evidence.
6. An optional model generates structured prose whose citations must resolve to packet evidence.
7. FastAPI serves synchronous reads and persistent asynchronous job status.
8. React presents source, freshness, methodology, uncertainty, and limitations next to conclusions.

## Important decisions

### No model-generated prices

Price levels, probabilities, return statistics, Greeks, and options liquidity fields come from deterministic code or a named provider. Generated prose cannot overwrite those fields.

### Point-in-time validation

The walk-forward runner uses expanding training windows. A purge gap at least as large as the prediction horizon prevents a training label from extending into the test period. By default, evaluated positions do not overlap.

### Provider-neutral AI

The AI boundary accepts a research packet and returns a Pydantic schema. Provider selection is configuration, not business logic. The application works with AI disabled and can use a local OpenAI-compatible endpoint without a hosted key.

### Durable status, bounded local execution

Long tasks have persisted status and idempotency keys. The included executor is intentionally local: it records interrupted jobs after a restart but does not claim distributed exactly-once execution. A production deployment should replace it with a durable queue and worker lease/heartbeat protocol.

## Failure modes surfaced to users

- Delayed or stale data
- Missing provider permissions
- Insufficient samples or signals
- Unsupported AI citations
- Interrupted background jobs
- A backtest that does not beat its benchmark
- Wide confidence intervals despite a favorable point estimate

## Known limitations

- Free data sources can be delayed, revised, incomplete, or unsuitable for execution.
- Current fundamentals are not yet a licensed point-in-time fundamentals archive.
- S&P 500 constituent files can introduce survivorship bias unless membership is reconstructed historically.
- Options recommendations are educational filters, not personalized suitability decisions.
- The local job runner is single-host and does not resume function execution after process failure.
- Historical performance is not evidence of future profitability.

## Production evolution

- Replace local job execution with a queue that supports leases, retries, and dead-letter handling.
- Store immutable provider payload hashes and point-in-time fundamentals/filings.
- Add authentication, per-user quotas, and encrypted secret management.
- Add continuous data-quality checks and provider reconciliation.
- Run model and prompt versions against a fixed regression suite before promotion.
