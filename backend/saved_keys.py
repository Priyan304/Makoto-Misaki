"""Read only supported provider credentials; never inject .env into process globals."""
from collections.abc import Mapping
from pathlib import Path
from dotenv import dotenv_values

KEY_NAMES = {'gemini': 'GEMINI_API_KEY', 'grok': 'GROK_API_KEY'}


def read_saved_keys(env_file: Path | None, environment: Mapping[str, str]) -> dict[str, str]:
    values = {}
    if env_file and env_file.exists():
        if env_file.stat().st_size > 65536:
            raise OSError('Environment file is too large')
        values = dotenv_values(env_file, interpolate=False, encoding='utf-8-sig')
    result = {}
    for provider, name in KEY_NAMES.items():
        value = environment.get(name, values.get(name))
        if isinstance(value, str) and value.strip():
            result[provider] = value.strip()
    return result
