# Rumik Silk TTS for Dograh, layered on the VoiceLink image so both stay available.
#   docker build -t local/dograh-api:voicelink-rumik dograh/overlay/rumik
# Then point the Dograh compose override at that tag (pull_policy: never).
ARG BASE=local/dograh-api:voicelink
FROM ${BASE}

USER root
# --no-deps is required: Dograh vendors its own pipecat fork (reports 0.0.0.dev0), and a normal
# install would pull upstream pipecat over it. The other deps (aiohttp, certifi, websockets) are
# already in the image. The hash pins the exact wheel that was reviewed.
RUN printf 'pipecat-rumik==0.1.4 --hash=sha256:0c1f7e51dab77152016fa78d0af678e99081db5fe6ac874f97b331d96f2f7cc3\n' > /tmp/rumik.txt \
 && pip install --no-cache-dir --no-deps --require-hashes -r /tmp/rumik.txt \
 && rm /tmp/rumik.txt

COPY patch_rumik.py /tmp/patch_rumik.py
RUN python /tmp/patch_rumik.py && rm /tmp/patch_rumik.py \
 && python -m py_compile /app/api/services/configuration/registry.py \
      /app/api/services/pipecat/service_factory.py /app/api/services/configuration/check_validity.py \
 && cd /app && python -c "from pipecat_rumik import RumikTTSService, RumikTTSSettings; print('pipecat-rumik ok')"

USER dograh
