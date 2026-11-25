"""Register Oogam (Naad TTS) as a Dograh TTS provider by patching the files already in the image.

Same approach as ../rumik/patch_rumik.py: only the Oogam lines are inserted, every anchor must match exactly once
(a Dograh update that moves code fails the build), and running it twice is a no-op. Built on top of the Rumik image,
so it anchors on the Rumik lines.
"""

import pathlib
import sys

API = pathlib.Path("/app/api/services")
MARK = "# oogam-overlay"


def patch(path: pathlib.Path, edits):
    src = path.read_text()
    if MARK in src:
        print(f"{path.name}: already patched")
        return
    for anchor, insert, where in edits:
        count = src.count(anchor)
        if count != 1:
            sys.exit(f"{path.name}: anchor found {count} times, expected 1:\n{anchor}")
        new = {"before": insert + anchor, "after": anchor + insert}[where]
        src = src.replace(anchor, new)
    path.write_text(src)
    print(f"{path.name}: patched")


OOGAM_CONFIG = f'''{MARK}
OOGAM_TTS_MODELS = ["naad-tts-v2"]
OOGAM_TTS_VOICES = ["aditi", "arjun", "kabir", "kavya"]
OOGAM_TTS_LANGUAGES = ["GUJ", "HIN", "ENG", "PUN", "MAR", "TAM", "TEL", "KAN", "MAL", "BEN"]


@register_tts(provider=OOGAM_PROVIDER)
class OogamTTSConfiguration(BaseTTSConfiguration):
    provider: Literal[ServiceProviders.OOGAM] = ServiceProviders.OOGAM
    model: str = Field(
        default="naad-tts-v2",
        description="Oogam Naad TTS model.",
        json_schema_extra={{"examples": OOGAM_TTS_MODELS}},
    )
    voice: str = Field(
        default="aditi",
        description="Oogam voice id (GET /v1/voices lists the live ones).",
        json_schema_extra={{"examples": OOGAM_TTS_VOICES, "allow_custom_input": True}},
    )
    language: str = Field(
        default="HIN",
        description="3-letter language the text is spoken in (GUJ, HIN, ENG...). Text in Roman letters is read in this language.",
        json_schema_extra={{"examples": OOGAM_TTS_LANGUAGES, "allow_custom_input": True}},
    )
    base_url: str = Field(default="https://platform.oogam.ai/v1", description="Oogam REST API base, ending in /v1.")


'''

OOGAM_FACTORY = f'''    elif user_config.tts.provider == ServiceProviders.OOGAM.value:  {MARK}
        base_url = getattr(user_config.tts, "base_url", None) or "https://platform.oogam.ai/v1"
        _validate_runtime_service_url(base_url, "base_url")
        return _OogamOwnedSessionTTSService(
            api_key=user_config.tts.api_key,
            aiohttp_session=aiohttp.ClientSession(),
            base_url=base_url,
            sample_rate=audio_config.transport_out_sample_rate,
            settings=OogamTTSSettings(
                model=getattr(user_config.tts, "model", None) or "naad-tts-v2",
                voice=(getattr(user_config.tts, "voice", None) or "").strip() or "aditi",
                language=(getattr(user_config.tts, "language", None) or "HIN").strip().upper(),
            ),
            skip_text_types=["recording_router", "recording"],
            silence_time_s=1.0,
        )
'''

OOGAM_SESSION = f'''from pipecat_oogam import OogamTTSService, OogamTTSSettings  {MARK}


class _OogamOwnedSessionTTSService(OogamTTSService):  {MARK}
    """OogamTTSService that closes the aiohttp session it was given (one per call)."""

    def __init__(self, *args, aiohttp_session: aiohttp.ClientSession, **kwargs):
        super().__init__(*args, aiohttp_session=aiohttp_session, **kwargs)
        self._owned_session = aiohttp_session

    async def cleanup(self):
        try:
            await super().cleanup()
        finally:
            if not self._owned_session.closed:
                await self._owned_session.close()
'''

OOGAM_CHECK = f'''    def _check_oogam_api_key(self, model: str, api_key: str) -> bool:  {MARK}
        # Listing voices authenticates the key without synthesising (or paying for) audio.
        try:
            r = httpx.get(
                "https://platform.oogam.ai/v1/voices",
                headers={{"Authorization": f"Bearer {{api_key}}"}},
                timeout=10,
            )
        except Exception:
            raise ValueError("Could not reach Oogam to check the API key. Try again.")
        if r.status_code in (401, 403):
            raise ValueError(
                f"Invalid Oogam API key (HTTP {{r.status_code}}), or the key does not have the Naad product. "
                "Check it at https://platform.oogam.ai/dashboard/api-keys."
            )
        return True

'''

patch(API / "configuration/registry.py", [
    ('    RUMIK = "rumik"  # rumik-overlay\n', f'    OOGAM = "oogam"  {MARK}\n', "after"),
    ("        ServiceProviders.RUMIK,  # rumik-overlay\n", f"        ServiceProviders.OOGAM,  {MARK}\n", "before"),
    ('provider_docs_url="https://docs.rumik.ai")  # rumik-overlay\n',
     f'OOGAM_PROVIDER = Provider("oogam", "Oogam", description="Oogam Naad Indian-language voices.", provider_docs_url="https://oogam.ai/docs/audio")  {MARK}\n', "after"),
    ("CAMB_TTS_MODELS = [", OOGAM_CONFIG, "before"),
    ("        RumikTTSConfiguration,  # rumik-overlay\n", f"        OogamTTSConfiguration,  {MARK}\n", "before"),
])

patch(API / "pipecat/service_factory.py", [
    ("from pipecat_rumik import RumikTTSService, RumikTTSSettings  # rumik-overlay\n", OOGAM_SESSION, "after"),
    ("    elif user_config.tts.provider == ServiceProviders.RUMIK.value:  # rumik-overlay\n", OOGAM_FACTORY, "before"),
])

patch(API / "configuration/check_validity.py", [
    ("            ServiceProviders.RUMIK.value: self._check_rumik_api_key,  # rumik-overlay\n",
     f"            ServiceProviders.OOGAM.value: self._check_oogam_api_key,  {MARK}\n", "after"),
    ("    def _check_rumik_api_key(self, model: str, api_key: str) -> bool:  # rumik-overlay\n", OOGAM_CHECK, "before"),
])
