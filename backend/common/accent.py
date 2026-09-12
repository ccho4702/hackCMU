"""User-selected English accent shared by delivery analysis and TTS."""
import os
from typing import Literal

Accent = Literal['original', 'american', 'british', 'indian', 'australian']
ACCENT_NAMES = {'american':'American English', 'british':'British English',
                'indian':'Indian English', 'australian':'Australian English'}
ACCENT_TAGS = {'american':'[American accent]', 'british':'[British accent]',
               'indian':'[Indian English]', 'australian':'[Australian accent]'}


def validate_accent(accent='original', language=None):
    if accent not in ('original', *ACCENT_NAMES):
        raise ValueError('Unsupported English accent')
    if accent != 'original' and language != 'en':
        raise ValueError('An English accent requires language=en')
    return accent


def speech_options(script, accent='original', language=None):
    validate_accent(accent, language)
    tag = ACCENT_TAGS.get(accent)
    model = 'eleven_v3' if tag else os.getenv('ELEVENLABS_TTS_MODEL', 'eleven_multilingual_v2')
    text = f'{tag} {script}' if tag else script
    if model == 'eleven_v3' and len(text) > 5000:
        raise ValueError('Accent-guided speech supports up to 5,000 characters including the accent cue')
    return model, text, tag
