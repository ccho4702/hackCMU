"""Turn ElevenLabs character timestamps into validated word intervals."""
import math
import re


def validate_words(words):
    previous = -1
    for word in words:
        start, end = word['t0'], word['t1']
        if not word['text'].strip() or not all(isinstance(t,(int,float)) and math.isfinite(t) for t in (start,end)):
            raise ValueError('Invalid word alignment')
        if not 0 <= start <= end or start < previous:
            raise ValueError('Word times must be ordered and nonnegative')
        previous = start
    if not words:
        raise ValueError('No word timestamps returned')
    return words


def character_to_words(alignment):
    chars = alignment.get('characters', [])
    starts = alignment.get('character_start_times_seconds', [])
    ends = alignment.get('character_end_times_seconds', [])
    if not chars or not len(chars) == len(starts) == len(ends) or any(not isinstance(c,str) or len(c)!=1 for c in chars):
        raise ValueError('Character alignment arrays are inconsistent')
    text = ''.join(chars)
    words = [{'text':m.group(), 't0':starts[m.start()], 't1':ends[m.end()-1]} for m in re.finditer(r'\S+', text)]
    return {'text':text, 'words':validate_words(words)}


def remove_injected_accent_tag(alignment, tag):
    """Remove only our leading unspoken control tag; preserve actual audio offsets."""
    if not tag:
        return alignment
    chars = alignment.get('characters', [])
    text = ''.join(chars)
    if not text.lstrip().startswith(tag):
        return alignment  # Some model responses already omit control tags.
    end = len(text) - len(text.lstrip()) + len(tag)
    while end < len(text) and text[end].isspace():
        end += 1
    keys = ('characters', 'character_start_times_seconds', 'character_end_times_seconds')
    if any(len(alignment.get(key, [])) != len(chars) for key in keys):
        raise ValueError('Character alignment arrays are inconsistent')
    return {**alignment, **{key: alignment[key][end:] for key in keys}}
