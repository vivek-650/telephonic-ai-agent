# Oogam (Naad TTS) for Dograh, layered on the Rumik image so VoiceLink, Rumik and Oogam all stay available.
#   docker build -t local/dograh-api:voicelink-rumik-oogam dograh/overlay/oogam
# Then point the Dograh compose override at that tag (pull_policy: never).
ARG BASE=local/dograh-api:voicelink-rumik
FROM ${BASE}

USER root
# --no-deps: Dograh vendors its own pipecat fork (reports 0.0.0.dev0); a normal install would pull upstream pipecat
# over it. Its other deps (aiohttp, numpy, websockets) are already in the image. The hash pins the reviewed wheel.
RUN printf 'pipecat-oogam==0.2.1 --hash=sha256:654c9bd93cbd79bb6e321ab94d469d3a223459152714c9d53485d3cfc110a98f\n' > /tmp/oogam.txt \
 && pip install --no-cache-dir --no-deps --require-hashes -r /tmp/oogam.txt \
 && rm /tmp/oogam.txt

COPY patch_oogam.py /tmp/patch_oogam.py
RUN python /tmp/patch_oogam.py && rm /tmp/patch_oogam.py \
 && python -m py_compile /app/api/services/configuration/registry.py \
      /app/api/services/pipecat/service_factory.py /app/api/services/configuration/check_validity.py \
 && cd /app && python -c "from pipecat_oogam import OogamTTSService, OogamTTSSettings; print('pipecat-oogam ok')"

USER dograh
