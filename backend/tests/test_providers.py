import asyncio
import json
import unittest
from uuid import uuid4

import httpx
from backend.app import create_app

TOKEN = 'provider-test-session-token-with-at-least-32-characters'
KEY = 'test-api-key-not-a-real-credential'


class ProviderTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.calls = []
        self.failure = None
        self.entered = asyncio.Event()
        self.cancelled = asyncio.Event()
        self.configuration_release = asyncio.Event()

        async def upstream(request):
            self.calls.append(request)
            if self.failure == 'configure-slow':
                self.entered.set()
                await self.configuration_release.wait()
            if self.failure == 'auth':
                return httpx.Response(401, json={'error': {'message': KEY}})
            if self.failure == 'redirect':
                return httpx.Response(307, headers={'location': 'https://other.example/steal'})
            if self.failure == 'quota':
                return httpx.Response(429, json={'error': KEY})
            if self.failure == 'timeout':
                raise httpx.ReadTimeout(KEY)
            if self.failure == 'offline':
                raise httpx.ConnectError(KEY)
            if request.url.path == '/v1beta/models':
                if request.url.params.get('pageToken'):
                    return httpx.Response(200, json={'models': [{'name': 'models/gemini-test-pro', 'supportedGenerationMethods': ['generateContent']}]})
                return httpx.Response(200, json={'models': [
                    {'name': 'models/gemini-test-flash', 'supportedGenerationMethods': ['generateContent']},
                    {'name': 'models/text-embedding', 'supportedGenerationMethods': ['embedContent']},
                    {'name': 'models/gemini-test-image', 'supportedGenerationMethods': ['generateContent']},
                ], 'nextPageToken': 'page-two'})
            if request.url.path == '/v1/language-models':
                return httpx.Response(200, json={'models': [
                    {'id': 'grok-test', 'input_modalities': ['text'], 'output_modalities': ['text']},
                    {'id': 'grok-image', 'input_modalities': ['text'], 'output_modalities': ['image']},
                ]})
            if self.failure == 'slow':
                self.entered.set()
                try:
                    await asyncio.sleep(20)
                except asyncio.CancelledError:
                    self.cancelled.set()
                    raise
            if self.failure == 'malformed':
                return httpx.Response(200, json={'unexpected': KEY})
            desktop_text = '{"reply":"Choose music to play.","actions":[{"type":"play_music","target":""}]}'
            if request.url.host == 'generativelanguage.googleapis.com':
                return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': 'hidden thought', 'thought': True}, {'text': desktop_text if self.failure == 'desktop' else 'Hello from Gemini.'}]}}]})
            return httpx.Response(200, json={'output': [
                {'type': 'reasoning', 'summary': [{'text': 'hidden thought'}]},
                {'type': 'message', 'role': 'assistant', 'content': [{'type': 'output_text', 'text': desktop_text if self.failure == 'desktop' else 'Hello from Grok.'}]},
            ]})

        async def no_local(_request):
            raise AssertionError('Cloud requests must not depend on Ollama')

        self.app = create_app(TOKEN, httpx.MockTransport(no_local), httpx.MockTransport(upstream))
        self.lifespan = self.app.router.lifespan_context(self.app)
        await self.lifespan.__aenter__()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://test', headers={'Authorization': f'Bearer {TOKEN}'})

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.lifespan.__aexit__(None, None, None)
        self.assertFalse(self.app.state.providers._keys)

    def payload(self, provider='gemini', **changes):
        return {'request_id': str(uuid4()), 'message': 'Hello', 'model': 'gemini-test-flash' if provider == 'gemini' else 'grok-test', 'mode': provider, **changes}

    async def test_cloud_desktop_proposals(self):
        for provider in ['gemini', 'grok']:
            configured = await self.client.post(f'/v1/providers/{provider}', json={'api_key': KEY})
            self.assertEqual(configured.status_code, 200)
            self.failure = 'desktop'
            response = await self.client.post('/v1/chat', json=self.payload(provider, desktop=True))
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['reply'], 'Choose music to play.')
            self.assertEqual(response.json()['actions'], [{'type': 'play_music', 'target': ''}])

    async def connect(self, provider='gemini'):
        response = await self.client.post(f'/v1/providers/{provider}', json={'api_key': KEY})
        self.assertEqual(response.status_code, 200, response.text)
        return response

    async def test_gemini_models_auth_payload_and_final_text(self):
        response = await self.connect()
        self.assertEqual(response.json()['models'], ['gemini-test-flash', 'gemini-test-pro'])
        response = await self.client.post('/v1/chat', json=self.payload(history=[{'role': 'user', 'content': 'First'}, {'role': 'assistant', 'content': 'Previous reply'}]))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['route'], 'gemini')
        self.assertEqual(response.json()['reply'], 'Hello from Gemini.')
        for request in self.calls:
            self.assertEqual(request.url.host, 'generativelanguage.googleapis.com')
            self.assertEqual(request.headers['x-goog-api-key'], KEY)
            self.assertNotIn(KEY, str(request.url))
        payload = json.loads(self.calls[-1].content)
        self.assertEqual([turn['role'] for turn in payload['contents']], ['user', 'model', 'user'])
        self.assertIn('cloud API', payload['systemInstruction']['parts'][0]['text'])
        self.assertNotIn('All inference runs locally', payload['systemInstruction']['parts'][0]['text'])
        self.assertNotIn(KEY, self.calls[-1].content.decode())
        self.assertNotIn(KEY, response.text)

    async def test_grok_language_models_and_stateless_response(self):
        response = await self.connect('grok')
        self.assertEqual(response.json()['models'], ['grok-test'])
        response = await self.client.post('/v1/chat', json=self.payload('grok'))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['route'], 'grok')
        self.assertEqual(response.json()['reply'], 'Hello from Grok.')
        generation = self.calls[-1]
        self.assertEqual(str(generation.url), 'https://api.x.ai/v1/responses')
        self.assertEqual(generation.headers['authorization'], f'Bearer {KEY}')
        payload = json.loads(generation.content)
        self.assertFalse(payload['store'])
        self.assertEqual(payload['input'][0]['role'], 'system')
        self.assertNotIn('tools', payload)

    async def test_missing_key_and_unlisted_model_never_generate(self):
        response = await self.client.post('/v1/chat', json=self.payload())
        self.assertEqual(response.status_code, 409)
        self.assertFalse(self.calls)
        await self.connect()
        before = len(self.calls)
        response = await self.client.post('/v1/chat', json=self.payload(model='gemini-not-listed'))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(len(self.calls), before)

    async def test_forget_key_status_and_shutdown_do_not_expose_secrets(self):
        await self.connect()
        response = await self.client.get('/v1/providers')
        self.assertNotIn(KEY, response.text)
        self.assertNotIn('api_key', response.text)
        self.assertTrue(response.json()['providers'][0]['configured'])
        response = await self.client.delete('/v1/providers/gemini')
        self.assertFalse(response.json()['configured'])
        response = await self.client.post('/v1/chat', json=self.payload())
        self.assertEqual(response.status_code, 409)

    async def test_config_boundary_and_validation_never_echo_key(self):
        response = await self.client.post('/v1/providers/gemini', json={'api_key': KEY}, headers={'Authorization': ''})
        self.assertEqual(response.status_code, 401)
        response = await self.client.post('/v1/providers/gemini', json={'api_key': KEY}, headers={'Origin': 'https://other.example'})
        self.assertEqual(response.status_code, 403)
        for path, payload in [('/v1/providers/gemini', {'api_key': KEY, 'url': 'https://other.example'}), ('/v1/providers/other', {'api_key': KEY}), ('/v1/providers/gemini', {'api_key': f'{KEY}\n'})]:
            response = await self.client.post(path, json=payload)
            self.assertEqual(response.status_code, 422)
            self.assertNotIn(KEY, response.text)
        self.assertFalse(self.calls)

    async def test_errors_and_redirects_are_sanitized(self):
        await self.connect()
        for failure, status in [('auth', 403), ('quota', 429), ('timeout', 504), ('offline', 503), ('malformed', 502), ('redirect', 502)]:
            self.failure = failure
            response = await self.client.post('/v1/chat', json=self.payload())
            self.assertEqual(response.status_code, status, response.text)
            self.assertNotIn(KEY, response.text)
            self.assertNotIn('other.example', response.text)
        self.assertTrue(all(request.url.host == 'generativelanguage.googleapis.com' for request in self.calls))

    async def test_failed_replacement_keeps_working_key(self):
        await self.connect()
        self.failure = 'auth'
        response = await self.client.post('/v1/providers/gemini', json={'api_key': 'replacement-key-that-is-invalid'})
        self.assertEqual(response.status_code, 403)
        self.failure = None
        response = await self.client.post('/v1/chat', json=self.payload())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.calls[-1].headers['x-goog-api-key'], KEY)

    async def test_cloud_cancel_stops_upstream(self):
        await self.connect()
        self.failure = 'slow'
        data = self.payload()
        pending = asyncio.create_task(self.client.post('/v1/chat', json=data))
        await asyncio.wait_for(self.entered.wait(), 2)
        response = await self.client.post(f"/v1/chat/{data['request_id']}/cancel", json={})
        self.assertEqual(response.json()['status'], 'cancelled')
        self.assertEqual((await asyncio.wait_for(pending, 2)).status_code, 499)
        self.assertTrue(self.cancelled.is_set())

    async def test_removing_key_invalidates_inflight_connection(self):
        self.failure = 'configure-slow'
        pending = asyncio.create_task(self.client.post('/v1/providers/gemini', json={'api_key': KEY}))
        await asyncio.wait_for(self.entered.wait(), 2)
        await self.client.delete('/v1/providers/gemini')
        self.failure = None
        self.configuration_release.set()
        response = await asyncio.wait_for(pending, 2)
        self.assertEqual(response.status_code, 409)
        self.assertFalse(self.app.state.providers.status('gemini')['configured'])
