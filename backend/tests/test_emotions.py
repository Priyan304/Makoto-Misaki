import json
import unittest
from backend.emotions import parse_avatar_reply
from backend.desktop import parse_desktop_response


class EmotionTests(unittest.TestCase):
    def test_cosmetic_metadata_is_separate_from_reply_and_never_a_tool(self):
        for emotion in ('happy', 'concerned', 'affectionate', 'neutral'):
            payload = json.dumps({'reply': 'A reply.', 'emotion': emotion})
            self.assertEqual(parse_avatar_reply(f'```json\n{payload}\n```'), ('A reply.', emotion))
        self.assertEqual(parse_avatar_reply('Plain text.'), ('Plain text.', None))
        for value in ('exec', {'command': 'bad'}, ['angry'], None):
            self.assertEqual(parse_avatar_reply(json.dumps({'reply': 'A reply.', 'emotion': value})), ('A reply.', None))
            reply, actions, emotion = parse_desktop_response(json.dumps({'reply': 'A reply.', 'emotion': value, 'actions': [{'type': 'play_media', 'target': ''}]}))
            self.assertEqual((reply, emotion), ('A reply.', None))
            self.assertEqual(actions, [{'type': 'play_media', 'target': ''}])

    def test_valid_emotion_does_not_weaken_desktop_action_validation(self):
        for actions in ([{'type': 'exec', 'target': 'cmd'}], [{'type': 'open_file', 'target': '', 'command': 'bad'}]):
            reply, parsed, emotion = parse_desktop_response(json.dumps({'reply': 'Run.', 'actions': actions, 'emotion': 'happy'}))
            self.assertEqual(parsed, [])
            self.assertIsNone(emotion)
            self.assertNotEqual(reply, 'Run.')
