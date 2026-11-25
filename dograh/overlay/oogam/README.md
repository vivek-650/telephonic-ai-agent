# Oogam (Naad TTS) voice for Dograh

Dograh does not ship Oogam as a voice (TTS) provider. This overlay adds it to the Dograh API image, on top of the
Rumik image, so VoiceLink, Rumik and Oogam all stay available.

```
docker build -t local/dograh-api:voicelink-rumik-oogam dograh/overlay/oogam
# Dograh's docker-compose.override.yml: services.api.image: local/dograh-api:voicelink-rumik-oogam, pull_policy: never
docker compose --profile tunnel up -d api
npm run voice:setup -- --llm=dograh --mouth=oogam --workflow=<id>   # Deepgram + Dograh AI + Oogam
```

`.env`: `OOGAM_API_KEY` (an `sk-setu-…` key with the Naad product, from platform.oogam.ai → API keys),
`OOGAM_VOICE` (default `aditi`), `OOGAM_LANGUAGE` (default `GUJ`).

## What it changes

`patch_oogam.py` inserts the Oogam lines into the files already in the image, anchored on the Rumik overlay's
lines. Every anchor must match exactly once, so a Dograh update that moves the code fails the build.

| File | Change |
|---|---|
| `registry.py` | `oogam` provider, `OogamTTSConfiguration` (model, voice, 3-letter language, base URL), TTS union |
| `service_factory.py` | Builds `OogamTTSService` with its own aiohttp session (closed at the end of the call), the same recording-text skip and silence settings as every other voice, and validates `base_url` |
| `check_validity.py` | Checks the key by listing voices (401 or 403 means a bad key or no Naad product). No audio is generated |

`pipecat-oogam==0.2.1` is installed with `--no-deps --require-hashes`. `--no-deps` stops it from pulling upstream
pipecat over Dograh's fork. The hash pins the wheel that was reviewed: its TTS only talks to
`platform.oogam.ai/v1/audio/speech` (streaming, `response_format: pcm`, 24 kHz mono).

## Measured (25 Nov 2026)

- Price: `naad-tts-v2` is 300 paise per 1,000 characters (₹3.00), from `GET /v1/voices`; a 63-character line was
  billed 19 paise (`X-Naad-Cost-Paise`). That is 6x Rumik mulberry (₹0.50).
- Voices available on the account: `aditi` (female, Hindi), `arjun` (male, Hindi), `kabir` (male, Gujarati),
  `kavya` (female, Tamil). The language is set separately, so `aditi` can speak `GUJ`.
- Roman-letter text is accepted and read in the configured language.

## Roll back

Set the override image back to `local/dograh-api:voicelink-rumik` and run `docker compose up -d api`. First move any
agent on an Oogam configuration back: `npm run voice:setup -- --llm=dograh --workflow=<id>` (Rumik).
