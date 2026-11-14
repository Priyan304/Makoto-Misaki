"""Cosmetic avatar metadata; never a tool or parameter supplied by the model."""
import json
from typing import Literal, get_args

Emotion = Literal['neutral', 'happy', 'affectionate', 'amused', 'curious', 'concerned', 'sad', 'surprised', 'angry']

EMOTION_PROMPT = '''
Choose an avatar reaction suited to the user's latest message and the conversation.
Include an "emotion" field in your reply JSON, choosing exactly one of:
neutral, happy, affectionate, amused, curious, concerned, sad, surprised, angry.
This is your character's expression, not a diagnosis of the user's emotions.
Use concerned for distress or frustration, happy for good news or thanks,
affectionate for affection directed at you, curious for a question, amused for
shared humor. Be sensitive to negation, sarcasm, quoted text and context. Do not
mirror anger at a distressed user. Angry is for an explicitly requested angry
expression or appropriate playful roleplay. Neutral is fine for routine tasks.
No clothing changes, arbitrary rig parameters or extra actions are permitted.
'''
BROWSER_REPLY_PROMPT = '''
Return ONLY a JSON object with "reply" (your natural conversational response)
and "emotion" (the avatar reaction). Example: {"reply":"Hello!","emotion":"happy"}.
No desktop tools are available in this browser conversation.
'''


def valid_emotion(value):
    return value if isinstance(value, str) and value in get_args(Emotion) else None


def unfence(text: str):
    value = text.strip()
    if value.startswith('```') and value.endswith('```'):
        value = value.split('\n', 1)[-1].rsplit('```', 1)[0].strip()
    return value


def parse_avatar_reply(text: str):
    try:
        value = json.loads(unfence(text))
        if isinstance(value, dict) and set(value) <= {'reply', 'emotion'} and isinstance(value.get('reply'), str) and value['reply'].strip():
            return value['reply'], valid_emotion(value.get('emotion'))
    except (ValueError, TypeError):
        pass
    # Older/local models may still return ordinary text. Keep chat usable.
    return text, None
