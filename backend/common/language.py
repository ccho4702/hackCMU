"""Optional presentation language; omitted values preserve the legacy behavior."""
from typing import Literal

Language = Literal['en', 'ko']
NAMES = {'en': 'English', 'ko': 'Korean'}


def resolve_language(language: Language | None = None) -> Language | None:
    value = language
    if value is not None and value not in NAMES:
        raise ValueError('language must be en or ko')
    return value


def provider_language(language: Language | None):
    value = resolve_language(language)
    return {'en': 'eng', 'ko': 'kor'}.get(value)
