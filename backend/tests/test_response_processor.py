import json
import unittest
from backend.response_processor import process_response, response_schema


class ResponseProcessorTests(unittest.TestCase):
    def test_directions_become_metadata_without_losing_dialogue(self):
        result = process_response('*smiles and blushes*\n\nHehe, you finally came back!')
        self.assertEqual(result['message'], 'Hehe, you finally came back!')
        self.assertEqual(result['emotion'], 'embarrassed')
        self.assertEqual(result['expression'], 'blush')
        self.assertEqual(result['actions'], [])
        result = process_response(json.dumps({'reply': '*nods* Sure!', 'emotion': 'happy', 'actions': []}), True)
        self.assertEqual(result['reply'], 'Sure!')
        self.assertEqual(result['motion'], 'nod')

    def test_code_quotes_emphasis_and_parentheses_survive(self):
        text = 'Use `*smiles*` or "*nods*". **Important**: 2 * 3 * 4 (for example).\n```python\n*smiles*\n```'
        self.assertEqual(process_response(text)['reply'], text)
        self.assertEqual(process_response('*important* detail')['reply'], '*important* detail')

    def test_invalid_metadata_never_becomes_a_rig_or_desktop_command(self):
        result = process_response(json.dumps({'message': '*waves* Hello.', 'emotion': 'unknown', 'expression': 'coat', 'motion': 'wave', 'intensity': 999, 'actions': [{'type': 'exec', 'target': 'bad'}]}), True)
        self.assertEqual(result['message'], 'Hello.')
        self.assertEqual(result['motion'], 'idle')
        self.assertIsNone(result['expression'])
        self.assertEqual(result['intensity'], 1)
        self.assertEqual(result['actions'], [])
        for value in ({}, [], True, float('nan'), float('inf')):
            self.assertEqual(process_response(json.dumps({'message': 'Hi', 'intensity': value}))['intensity'], .7)
        self.assertNotIn('{', process_response('{bad JSON')['message'])
        self.assertEqual(process_response('*looks away*')['motion'], 'look-around')

    def test_actions_are_independent_and_absent_from_idle_schema(self):
        action = {'type': 'play_media', 'target': ''}
        text = json.dumps({'message': 'Choose a song.', 'emotion': 'happy', 'expression': 'smile', 'motion': 'nod', 'intensity': .6, 'actions': [action]})
        self.assertEqual(process_response(text, True)['actions'], [action])
        self.assertEqual(process_response(text, False)['actions'], [])
        self.assertEqual(response_schema(False)['properties']['actions']['maxItems'], 0)
        self.assertNotIn('wave', response_schema()['properties']['motion']['enum'])
