"""Opt-in, single-request Gemini smoke test.

This test never runs as part of the normal regression suite.  To run it once
with the local backend/.env configuration, set CHILL_RUN_LIVE_GEMINI=1.
The fixture is a generated 1x1 image and contains no user data.
"""

import asyncio
import base64
import os

import pytest

from app.config import Settings
from app.providers.food_vision import GeminiFoodVisionProvider


pytestmark = pytest.mark.live

_TRANSPARENT_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def test_gemini_38_live_smoke_is_opt_in_and_shape_safe() -> None:
    if os.environ.get("CHILL_RUN_LIVE_GEMINI") != "1":
        pytest.skip("Set CHILL_RUN_LIVE_GEMINI=1 for the single live request")

    settings = Settings()
    if not settings.gemini_api_key.strip():
        pytest.skip("GEMINI_API_KEY is not configured in the local environment")

    provider = GeminiFoodVisionProvider(
        settings.gemini_api_key,
        "gemini-3.8-flash",
        timeout=settings.vision_timeout_seconds,
        max_output_tokens=settings.vision_max_output_tokens,
    )
    result = asyncio.run(provider.identify(_TRANSPARENT_PNG, "image/png"))

    assert result.provider == "gemini"
    assert isinstance(result.uncertain, bool)
    assert len(result.suggestions) <= 3
    normalized_names = {suggestion.name.casefold().strip() for suggestion in result.suggestions}
    assert len(normalized_names) == len(result.suggestions)
