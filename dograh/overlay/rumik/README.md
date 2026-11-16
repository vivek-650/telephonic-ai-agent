# Rumik Silk voice for Dograh

Dograh does not ship Rumik as a voice (TTS) provider. This overlay adds it to the Dograh API image, on top
of the VoiceLink image, so both stay available.

```
docker build -t local/dograh-api:voicelink-rumik dograh/overlay/rumik
# Dograh's docker-compose.override.yml: services.api.image: local/dograh-api:voicelink-rumik, pull_policy: never
docker compose --profile tunnel up -d api
npm run voice:setup -- --workflow=<test workflow id>    # then --default once it sounds right
```

## What it changes

`patch_rumik.py` inserts the Rumik lines into the files already in the image. It never copies whole files
from another Dograh version. Every anchor must match exactly once, so a Dograh update that moves the code
fails the build instead of producing a half-patched image.

| File | Change |
|---|---|
| `registry.py` | `rumik` provider, `RumikTTSConfiguration` (model, optional speaker, description, sampling), TTS union |
| `service_factory.py` | Builds `RumikTTSService`, with the same recording-text skip and silence settings as every other voice, and validates `gateway_url` |
| `check_validity.py` | Checks the key by minting a streaming session (401 or 403 means a bad key). No audio is generated |
| `pipecat_rumik/settings.py` | Compatibility fix: 0.1.4 imports a private `_NotGiven` that Dograh's pipecat fork does not have. Without it the API cannot start |

`pipecat-rumik==0.1.4` is installed with `--no-deps --require-hashes`. `--no-deps` stops it from pulling
upstream pipecat over Dograh's fork. The hash pins the wheel that was reviewed: it only talks to
`silk-api.rumik.ai`.

## Measured

- Streaming from India: first audio about 0.3 s after the text is sent, generation at 0.35x real time.
- Output is 24 kHz PCM, which Dograh resamples for the phone line.

## Roll back

Set the override image back to `local/dograh-api:voicelink` and run `docker compose up -d api`. Any agent
still pointing at the Rumik configuration then fails its calls, so first run
`npm run voice:setup -- --workflow=<id> --off`.
