import asyncio
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import httpx
from backend.app import create_app
from backend.saved_keys import read_saved_keys

TOKEN = 'saved-key-tests-session-token-not-a-real-credential'
KEY = 'test-gemini-saved-key-not-a-real-credential'


class SavedKeyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = TemporaryDirectory()
        self.file = Path(self.temp.name) / '.env'
        self.file.write_text(f'GEMINI_API_KEY="{KEY}"\n', encoding='utf-8')
        self.calls = []
        self.mode = 'ok'
        self.entered = asyncio.Event()
        self.release = asyncio.Event()

    async def asyncTearDown(self):
        self.temp.cleanup()

    def app(self, environment=None):
        async def cloud(request):
            self.calls.append(request)
            if self.mode == 'slow':
                self.entered.set()
                await self.release.wait()
            if self.mode == 'auth':
                return httpx.Response(403, json={'error': KEY})
            return httpx.Response(200, json={'models': [{'name': 'models/gemini-saved-test', 'supportedGenerationMethods': ['generateContent']}]})

        async def local(_request):
            raise httpx.ConnectError('Ollama offline fixture')
        return create_app(TOKEN, httpx.MockTransport(local), httpx.MockTransport(cloud), env_file=self.file, key_environment=environment or {})

    async def settled(self, client):
        for _ in range(200):
            response = await client.get('/v1/providers')
            self.assertNotIn(KEY, response.text)
            status = response.json()['providers'][0]
            if not status['loading']:
                return status
            await asyncio.sleep(.005)
        self.fail('Saved provider did not finish connecting')

    def client(self, app):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test', headers={'Authorization': f'Bearer {TOKEN}'})

    async def test_key_loads_on_each_restart_without_appearing_in_status(self):
        for _ in range(2):
            app = self.app()
            async with app.router.lifespan_context(app), self.client(app) as client:
                status = await self.settled(client)
                self.assertTrue(status['configured'])
                self.assertTrue(status['saved_key'])
                self.assertEqual(status['source'], 'saved')
                self.assertEqual(status['models'], ['gemini-saved-test'])
            self.assertFalse(app.state.providers._keys)
        self.assertEqual(len(self.calls), 2)
        self.assertTrue(all(call.headers['x-goog-api-key'] == KEY for call in self.calls))

    async def test_bad_saved_key_has_readable_error_and_can_retry_after_file_edit(self):
        self.mode = 'auth'
        app = self.app()
        async with app.router.lifespan_context(app), self.client(app) as client:
            status = await self.settled(client)
            self.assertFalse(status['configured'])
            self.assertTrue(status['saved_key'])
            self.assertIn('rejected', status['error'])
            self.mode = 'ok'
            replacement = 'test-replacement-saved-credential'
            self.file.write_text(f'GEMINI_API_KEY={replacement}\n', encoding='utf-8')
            response = await client.post('/v1/providers/gemini', json={})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()['configured'])
            self.assertNotIn(replacement, response.text)
            self.assertEqual(self.calls[-1].headers['x-goog-api-key'], replacement)

    async def test_startup_does_not_wait_for_cloud_and_disconnect_cannot_be_undone(self):
        self.mode = 'slow'
        app = self.app()
        async with app.router.lifespan_context(app), self.client(app) as client:
            await asyncio.wait_for(self.entered.wait(), 1)
            response = await client.get('/v1/health')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['status'], 'offline')
            self.assertTrue((await client.get('/v1/providers')).json()['providers'][0]['loading'])
            response = await client.delete('/v1/providers/gemini')
            self.assertFalse(response.json()['configured'])
            self.assertTrue(response.json()['saved_key'])
            self.release.set()
            await asyncio.sleep(.025)
            self.assertFalse((await client.get('/v1/providers')).json()['providers'][0]['configured'])
            self.assertIn(KEY, self.file.read_text())

    async def test_invalid_saved_key_never_reaches_provider(self):
        self.file.write_text('GEMINI_API_KEY=tiny\n', encoding='utf-8')
        app = self.app()
        async with app.router.lifespan_context(app), self.client(app) as client:
            status = await self.settled(client)
            self.assertFalse(status['configured'])
            self.assertIn('Invalid saved', status['error'])
            self.assertFalse(self.calls)

    async def test_environment_takes_precedence(self):
        override = 'test-process-environment-credential'
        app = self.app({'GEMINI_API_KEY': override})
        async with app.router.lifespan_context(app), self.client(app) as client:
            self.assertTrue((await self.settled(client))['configured'])
            self.assertEqual(self.calls[-1].headers['x-goog-api-key'], override)

    def test_dotenv_quotes_comments_bom_and_no_interpolation_or_global_injection(self):
        self.file.write_text('\ufeff# Comment\nGEMINI_API_KEY="test-${MISAKI_NOT_A_REAL_VARIABLE}-key" # note\nGROK_API_KEY=\nUNRELATED_KEY=never-import-this\n', encoding='utf-8')
        result = read_saved_keys(self.file, {})
        self.assertEqual(result, {'gemini': 'test-${MISAKI_NOT_A_REAL_VARIABLE}-key'})
        self.assertNotEqual(os.environ.get('UNRELATED_KEY'), 'never-import-this')
        self.assertEqual(read_saved_keys(self.file, {'GEMINI_API_KEY': ''}), {})
