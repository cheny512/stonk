# Security

Report security issues privately to the repository owner rather than opening a public issue.

## Secret handling

- Keep provider credentials in `.env` or a deployment secret manager.
- Never place secrets in `VITE_*` variables; those are bundled into browser code.
- API errors must not include upstream URLs containing credentials.
- `.env`, local databases, downloaded datasets, coverage output, and generated eval reports are ignored by Git.

## Scope

The local development server is bound to loopback by default. Authentication is required before exposing it to a network or deploying a multi-user instance.
