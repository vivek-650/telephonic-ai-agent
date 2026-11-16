"""Register Rumik Silk as a Dograh TTS provider by patching the files already in the image.

Only the Rumik lines are inserted; nothing else in Dograh changes. Every anchor must match
exactly once, so a Dograh update that moves code fails the build instead of producing a
half-patched image. Running it twice is a no-op.
"""

import pathlib
import sys

API = pathlib.Path("/app/api/services")
MARK = "# rumik-overlay"


def patch(path: pathlib.Path, edits):
    src = path.read_text()
    if MARK in src:
        print(f"{path.name}: already patched")
        return
    for anchor, insert, where in edits:
        count = src.count(anchor)
        if count != 1:
            sys.exit(f"{path.name}: anchor found {count} times, expected 1:\n{anchor}")
        new = {"before": insert + anchor, "after": anchor + insert, "replace": insert}[where]
        src = src.replace(anchor, new)
    path.write_text(src)
    print(f"{path.name}: patched")


RUMIK_CONFIG = f'''{MARK}
RUMIK_TTS_MODELS = ["mulberry", "muga"]


@register_tts(provider=RUMIK_PROVIDER)
class RumikTTSConfiguration(BaseTTSConfiguration):
    provider: Literal[ServiceProviders.RUMIK] = ServiceProviders.RUMIK
    model: str = Field(
        default="mulberry",
        description="Rumik Silk model. mulberry is the fast, description-driven model for calls.",
        json_schema_extra={{"examples": RUMIK_TTS_MODELS}},
    )
    voice: str = Field(
        default="",
        description="Optional Rumik speaker preset. Leave blank to use the description alone.",
        json_schema_extra={{"examples": ["speaker_1", "speaker_2", "speaker_3", "speaker_4"], "allow_custom_input": True}},
    )
    description: str = Field(
        default=(
            "a warm, clear young Indian woman's voice, friendly and professional, "
            "natural conversational pace, speaking Indian English and Hinglish"
        ),
        description="Free-text voice direction (mulberry).",
    )
    gateway_url: str = Field(default="https://silk-api.rumik.ai", description="Rumik Silk gateway URL.")
    temperature: float = Field(default=0.6, ge=0.0, le=2.0)
    top_p: float = Field(default=0.95, ge=0.0, le=1.0)
    top_k: int = Field(default=50, ge=1, le=200)
    full_response_aggregation: bool = Field(
        default=True,
        description="Send each full reply as one request, avoiding gaps between sentences.",
    )


'''

RUMIK_FACTORY = f'''    elif user_config.tts.provider == ServiceProviders.RUMIK.value:  {MARK}
        gateway_url = getattr(user_config.tts, "gateway_url", None) or "https://silk-api.rumik.ai"
        _validate_runtime_service_url(gateway_url, "gateway_url")
        return RumikTTSService(
            api_key=user_config.tts.api_key,
            gateway_url=gateway_url,
            settings=RumikTTSSettings(
                model=getattr(user_config.tts, "model", None) or "mulberry",
                voice=(getattr(user_config.tts, "voice", None) or "").strip() or None,
                description=getattr(user_config.tts, "description", None) or None,
                temperature=getattr(user_config.tts, "temperature", 0.6),
                top_p=getattr(user_config.tts, "top_p", 0.95),
                top_k=getattr(user_config.tts, "top_k", 50),
            ),
            full_response_aggregation=getattr(user_config.tts, "full_response_aggregation", True),
            skip_text_types=["recording_router", "recording"],
            silence_time_s=1.0,
        )
'''

RUMIK_CHECK = f'''    def _check_rumik_api_key(self, model: str, api_key: str) -> bool:  {MARK}
        # Minting a streaming session authenticates the key without synthesising audio.
        try:
            r = httpx.post(
                "https://silk-api.rumik.ai/v1/tts/ws-connect",
                headers={{"Authorization": f"Bearer {{api_key}}"}},
                json={{"text": "init", "model": "mulberry"}},
                timeout=10,
            )
        except Exception:
            raise ValueError("Could not reach Rumik to check the API key. Try again.")
        if r.status_code in (401, 403):
            raise ValueError(
                f"Invalid Rumik API key (HTTP {{r.status_code}}). Check it at https://rumik.ai."
            )
        return True

'''

# pipecat-rumik 0.1.4 imports the private `_NotGiven` from pipecat.services.settings; Dograh's pipecat
# fork only exposes the public `NotGiven` from pipecat.utils.types. Same sentinel class, new home.
import importlib.util  # noqa: E402

RUMIK_PKG = pathlib.Path(importlib.util.find_spec("pipecat_rumik").origin).parent  # locate without importing
OLD_IMPORT = "from pipecat.services.settings import NOT_GIVEN, TTSSettings, _NotGiven\n"
patch(RUMIK_PKG / "settings.py", [
    (OLD_IMPORT, f"from pipecat.utils.types import NotGiven as _NotGiven  {MARK}\n", "after"),
])
settings_py = RUMIK_PKG / "settings.py"
settings_py.write_text(settings_py.read_text().replace(OLD_IMPORT, "from pipecat.services.settings import NOT_GIVEN, TTSSettings\n"))

patch(API / "configuration/registry.py", [
    ('    SARVAM = "sarvam"\n', f'    RUMIK = "rumik"  {MARK}\n', "after"),
    ("        ServiceProviders.SARVAM,\n        ServiceProviders.SMALLEST,\n", f"        ServiceProviders.RUMIK,  {MARK}\n", "before"),
    ('SARVAM_PROVIDER = Provider("sarvam", "Sarvam")\n',
     f'RUMIK_PROVIDER = Provider("rumik", "Rumik", description="Rumik Silk Indian voices.", provider_docs_url="https://docs.rumik.ai")  {MARK}\n', "after"),
    ("CAMB_TTS_MODELS = [", RUMIK_CONFIG, "before"),
    ("        SarvamTTSConfiguration,\n        CambTTSConfiguration,\n", f"        RumikTTSConfiguration,  {MARK}\n", "before"),
])

patch(API / "pipecat/service_factory.py", [
    ("from pipecat.services.deepgram.tts import DeepgramTTSService, DeepgramTTSSettings\n",
     f"from pipecat_rumik import RumikTTSService, RumikTTSSettings  {MARK}\n", "after"),
    ("    elif user_config.tts.provider == ServiceProviders.SARVAM.value:\n        # Map Sarvam language code to pipecat Language enum for TTS\n",
     RUMIK_FACTORY, "before"),
    # Groq gpt-oss models reason before answering, and those tokens count towards the free tier's 8,000 tokens a
    # minute. Low effort keeps replies fast and cheap; other Groq models are unchanged.
    ("            settings=GroqLLMSettings(model=model, **sampling_settings),\n",
     "            settings=GroqLLMSettings(\n"
     "                model=model,\n"
     "                **sampling_settings,\n"
     f"                **({{\"extra\": {{\"reasoning_effort\": \"low\"}}}} if \"gpt-oss\" in model else {{}}),  {MARK}\n"
     "            ),\n", "replace"),
])

patch(API / "configuration/check_validity.py", [
    ("            ServiceProviders.SARVAM.value: self._check_sarvam_api_key,\n",
     f"            ServiceProviders.RUMIK.value: self._check_rumik_api_key,  {MARK}\n", "after"),
    ("    def _check_sarvam_api_key(self, model: str, api_key: str) -> bool:\n", RUMIK_CHECK, "before"),
])
