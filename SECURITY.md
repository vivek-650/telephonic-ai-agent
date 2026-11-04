# Security

## Reporting

Please report vulnerabilities privately to the maintainer, not as a public issue.

## Controls

| Area | Control |
|---|---|
| Authentication | An optional dashboard password. Sessions are HMAC-signed and expire after 7 days. Changing the password invalidates every session. Cookies are HttpOnly and SameSite=Lax, and Secure over HTTPS. |
| Brute force | Logins are limited to 5 attempts per minute per client. Public forms are limited to 30 per minute. |
| Secrets | API keys saved on the Settings page are encrypted in the database and shown masked (last 4 characters only). `.env` and the database are gitignored. Logs redact keys, tokens, emails and phone numbers. |
| Webhooks | An optional `WEBHOOK_SECRET` is checked in constant time. Redelivered webhooks are ignored. Each run is re-read from Dograh instead of trusting the posted payload. |
| Public tunnel | Over a tunnel, only the webhook and health endpoints are reachable until a password is set. The `/dograh` proxy allows only Dograh's public embed endpoints and never adds the API key. |
| Telephony safety | Calls only reach numbers on the allowlist until `IMPORT_CALL_ANY=1`. Phone screens need recorded consent, and the same number can't be called again within 10 minutes. |
| Input | Schema validation, size-capped bodies (1 MB JSON, 5 MB PDF), path-traversal-safe static files, parameterised SQL everywhere. |
| Browser | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` headers. |
| Privacy | Emails and phone numbers are removed from LLM prompts. Candidates can be deleted on request. |
| Fair hiring | Personal attributes are excluded from scoring, fairness tests run in CI, and every automated score is audited (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). |
