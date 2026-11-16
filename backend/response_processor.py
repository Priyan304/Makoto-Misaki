"""Separate dialogue from bounded cosmetic metadata. Never execute directions."""
import json
import math
import re
from typing import get_args
from .emotions import Emotion, valid_emotion, unfence
from .desktop import DesktopAction

EXPRESSIONS = ('neutral', 'smile', 'sad', 'blush', 'angry', 'surprised', 'thinking', 'relaxed', 'sleepy', 'heart-eyes')
# Verified against Changli's rig. These are procedural poses, not motion files.
# No hand-wave: this model has no authored wave clip or verified waving rig.
MOTIONS = ('idle', 'nod', 'shake-head', 'look-around', 'yawn', 'laugh', 'thinking')
EMOTION_EXPRESSION = {'happy': 'smile', 'amused': 'smile', 'affectionate': 'heart-eyes', 'embarrassed': 'blush', 'sad': 'sad', 'concerned': 'sad', 'angry': 'angry', 'surprised': 'surprised', 'curious': 'thinking', 'thinking': 'thinking', 'relieved': 'relaxed', 'sleepy': 'sleepy'}
OUTPUT_PROMPT = '''
# Dialogue and avatar output
Keep the persona's conversational style inside the message field. Return ONLY
JSON with message, emotion, expression, motion, intensity, and actions.
message is spoken dialogue, without roleplay stage directions. Translate the
persona's occasional gestures into cosmetic metadata instead of printing them.
expression: neutral, smile, sad, blush, angry, surprised, thinking, relaxed,
sleepy, heart-eyes. motion: idle, nod, shake-head, look-around, yawn, laugh,
thinking. intensity: a number from 0 to 1, normally 0.5 to 0.8.
Use idle for most replies. There is no supported wave or arm-crossing animation.
Do not invent motion IDs, rig parameters, costume changes or desktop actions.
Example: {"message":"Hehe, you finally came back!", "emotion":"embarrassed",
"expression":"blush", "motion":"idle", "intensity":0.7, "actions":[]}.
actions must be empty unless desktop tools were explicitly enabled for this turn.
'''
IDLE_PROMPT = '''
# Optional conversation starter
The user opted into occasional conversation starters. Write at most two short,
natural sentences in the established persona, informed only by supplied history.
Choose a fresh topic or a gentle check-in; do not repeat recent starters. Do not
claim to see the user's work or know why they are quiet. No guilt, possessiveness,
pressure to respond, or invented memories. Do not announce an inactivity timer.
No tools, computer actions, screen access or task execution are available on this
turn. Return an empty actions array. It is fine to keep the message low-key.
'''


def response_schema(desktop=False):
    properties = {
        'message': {'type': 'string'},
        'emotion': {'type': 'string', 'enum': list(get_args(Emotion))},
        'expression': {'type': 'string', 'enum': list(EXPRESSIONS)},
        'motion': {'type': 'string', 'enum': list(MOTIONS)},
        'intensity': {'type': 'number', 'minimum': 0, 'maximum': 1},
        'actions': {'type': 'array', 'maxItems': 3 if desktop else 0, 'items': {
            'type': 'object', 'properties': {'type': {'type': 'string', 'enum': list(get_args(DesktopAction.model_fields['type'].annotation))}, 'target': {'type': 'string'}},
            'required': ['type', 'target'], 'additionalProperties': False,
        }},
    }
    return {'type': 'object', 'properties': properties, 'required': list(properties), 'additionalProperties': False}


def direction_cue(text):
    text = text.lower().strip()
    if not re.match(r'^(?:(?:she|misaki)\s+)?(?:smil\w*|blush\w*|look\w*|nod\w*|shak\w*|laugh\w*|giggl\w*|yawn\w*|sigh\w*|pout\w*|frown\w*|cross\w*|wave\w*|tilt\w*|lets out|think\w*|relax\w*)\b', text):
        return None
    emotion = None
    motion = None
    if re.search(r'blush|embarrass|shy', text): emotion = 'embarrassed'
    elif re.search(r'laugh|giggl', text): emotion, motion = 'amused', 'laugh'
    elif re.search(r'yawn|sleep', text): emotion, motion = 'sleepy', 'yawn'
    elif re.search(r'frown|pout', text): emotion = 'concerned'
    elif re.search(r'sigh|relax', text): emotion = 'relieved'
    elif re.search(r'smil', text): emotion = 'happy'
    if re.search(r'shak\w* (?:her |my |the )?head', text): motion = 'shake-head'
    elif re.search(r'\bnod', text): motion = 'nod'
    elif re.search(r'look\w* (?:away|around|aside)', text): motion = 'look-around'
    elif re.search(r'think', text): emotion, motion = 'thinking', 'thinking'
    return emotion, motion


def strip_directions(message):
    cues = []
    def replace(match):
        cue = direction_cue(match.group(1) or match.group(2))
        if cue is None: return match.group(0)
        cues.append(cue)
        return ''
    # Preserve code, quoted examples and bold emphasis. Don't erase arbitrary
    # asterisk text, mathematical multiplication or ordinary parentheticals.
    parts = re.split(r'(```[\s\S]*?```|`[^`\n]*`|"(?:\\.|[^"\\])*"|\*\*[^*\n]+\*\*)', message)
    for index in range(0, len(parts), 2):
        parts[index] = re.sub(r'(?<!\*)\*([^*\n]{1,140})\*(?!\*)|\(([^()\n]{1,140})\)', replace, parts[index])
    return ''.join(parts).strip(), cues


def process_response(text, desktop=False):
    value = unfence(text)
    data = {}
    try:
        parsed = json.loads(value)
        if not isinstance(parsed, dict): raise ValueError()
        message = parsed.get('message', parsed.get('reply'))
        if not isinstance(message, str) or len(message) > 16000: raise ValueError()
        data = parsed
    except (ValueError, TypeError):
        message = 'I lost the thread of that reply. Could you try again?' if value.startswith(('{', '[')) else text
    message, cues = strip_directions(message)
    # A directions-only reply still has a useful visible, non-invented fallback.
    if not message: message = '…'
    emotion = valid_emotion(data.get('emotion'))
    cue_emotion = next((cue[0] for cue in reversed(cues) if cue[0]), None)
    if cue_emotion and emotion in (None, 'neutral'): emotion = cue_emotion
    expression = data.get('expression')
    if not isinstance(expression, str) or expression not in EXPRESSIONS or (expression == 'neutral' and cue_emotion):
        expression = EMOTION_EXPRESSION.get(cue_emotion or emotion, 'neutral' if emotion else None)
    motion = data.get('motion')
    cue_motion = next((cue[1] for cue in reversed(cues) if cue[1]), 'idle')
    if not isinstance(motion, str) or motion not in MOTIONS or (motion == 'idle' and cues): motion = cue_motion
    intensity = data.get('intensity', .7)
    if isinstance(intensity, bool) or not isinstance(intensity, (int, float)) or not math.isfinite(intensity): intensity = .7
    actions = []
    if desktop and isinstance(data.get('actions'), list) and len(data['actions']) <= 3:
        try: actions = [DesktopAction.model_validate(action).model_dump() for action in data['actions']]
        except ValueError: actions = []
    return {'message': message, 'reply': message, 'emotion': emotion, 'expression': expression, 'motion': motion, 'intensity': max(0, min(1, intensity)), 'actions': actions}
