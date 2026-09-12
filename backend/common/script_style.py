"""Scenario presets for script revision; never alter the source transcript."""
from typing import Literal

ScriptStyle = Literal['presentation', 'interview', 'formal', 'informal', 'friend', 'pitch']
STYLE_INSTRUCTIONS = {
    'presentation': 'Use a clear spoken presentation style with a logical flow, concise sentences, and natural transitions.',
    'interview': 'Use a professional but conversational interview-answer style. Lead with a direct answer and organize supporting examples already present in the source. Do not invent an interview question, work experience, achievements, examples, or results.',
    'formal': 'Use polished, respectful, formal language appropriate for a professional audience. Prefer complete sentences and precise wording. Avoid casual slang and excessive contractions while keeping the speech natural aloud.',
    'informal': 'Use relaxed, natural everyday language and short spoken sentences. Use contractions where natural in English and keep politeness appropriate to the source language. Do not add slang, jokes, or details that change the meaning.',
    'friend': 'Use warm, personal language as if speaking to a friend. Keep it direct, relaxed, and easy to say; in Korean, a natural familiar register is appropriate. Do not invent shared memories, relationships, nicknames, or new personal details.',
    'pitch': 'Use a concise, persuasive pitch style. Bring the main idea and its value forward. Only use problems, solutions, benefits, evidence, and calls to action actually supported by the source. Never fabricate metrics, customers, traction, or promises.',
}


def validate_script_style(value='presentation'):
    if value not in STYLE_INSTRUCTIONS:
        raise ValueError('Unsupported script_style')
    return value
