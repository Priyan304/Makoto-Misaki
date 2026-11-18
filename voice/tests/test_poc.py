import os
from pathlib import Path
import socket
import tempfile
import unittest

from voice.poc import SpeechRequest, check_model, offline


class VoiceContractTests(unittest.TestCase):
    def test_languages_are_explicit_and_never_substituted(self):
        SpeechRequest('Hello.', 'en').validate()
        SpeechRequest('こんにちは。', 'ja').validate()
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            SpeechRequest('வணக்கம்', 'ta').validate()

    def test_bounds_and_reference_validation(self):
        for request in [SpeechRequest(' '), SpeechRequest('x' * 501),
                        SpeechRequest('Hi', exaggeration=2),
                        SpeechRequest('Hi', reference=Path('missing.wav'))]:
            with self.assertRaises(ValueError):
                request.validate()

    def test_missing_assets_give_setup_action(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(FileNotFoundError, 'setup:voice'):
                check_model(Path(folder))

    def test_offline_blocks_connections_and_restores_state_on_error(self):
        original = socket.socket.connect
        environment = os.environ.get('HF_HUB_OFFLINE')
        with self.assertRaisesRegex(RuntimeError, 'Network access is disabled'):
            with offline():
                self.assertEqual(os.environ['HF_HUB_OFFLINE'], '1')
                socket.create_connection(('example.com', 443))
        self.assertIs(socket.socket.connect, original)
        self.assertEqual(os.environ.get('HF_HUB_OFFLINE'), environment)


if __name__ == '__main__':
    unittest.main()
