import json
import unittest
from backend.desktop import parse_desktop_reply


class DesktopTests(unittest.TestCase):
    def test_valid_actions_and_fenced_json(self):
        text = json.dumps({'reply': 'Choose music to play.', 'actions': [{'type': 'play_music', 'target': ''}]})
        for value in (text, f'```json\n{text}\n```'):
            reply, actions = parse_desktop_reply(value)
            self.assertEqual(reply, 'Choose music to play.')
            self.assertEqual(actions, [{'type': 'play_music', 'target': ''}])

    def test_rejects_commands_extra_fields_control_chars_and_excess_actions(self):
        for actions in ([{'type': 'exec', 'target': 'cmd.exe'}], [{'type': 'open_file', 'target': '', 'command': 'bad'}], [{'type': 'open_file', 'target': 'x\n.exe'}], [{'type': 'open_folder', 'target': 'downloads'}] * 4):
            _, result = parse_desktop_reply(json.dumps({'reply': 'Open', 'actions': actions}))
            self.assertEqual(result, [])
        self.assertEqual(parse_desktop_reply('{bad json')[1], [])
        self.assertEqual(parse_desktop_reply('Hello!'), ('Hello!', []))
