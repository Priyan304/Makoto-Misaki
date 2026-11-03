import base64
import json
import unittest
from uuid import uuid4

import httpx
from backend.app import create_app

TOKEN = 'screen-test-session-token-with-at-least-32-characters'
PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHioAAAAASUVORK5CYII='
IMAGE = {'mime_type': 'image/png', 'data': PNG, 'source': 'Test window', 'width': 1, 'height': 1}


class ScreenTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.calls = []
        self.local_vision = False
        async def upstream(request):
            self.calls.append(request)
            if request.url.path == '/v1beta/models':
                return httpx.Response(200, json={'models': [{'name': 'models/gemini-test', 'supportedGenerationMethods': ['generateContent']}]})
            if request.url.path == '/v1/language-models':
                return httpx.Response(200, json={'models': [{'id': 'grok-vision', 'input_modalities': ['text', 'image'], 'output_modalities': ['text']}, {'id': 'grok-text', 'input_modalities': ['text'], 'output_modalities': ['text']}]})
            if request.url.path == '/api/tags':
                return httpx.Response(200, json={'models': [{'name': 'local-test'}]})
            if request.url.path == '/api/show':
                return httpx.Response(200, json={'capabilities': ['completion', *(['vision'] if self.local_vision else [])]})
            reply = '{"reply":"I can see your test image.","actions":[]}'
            if request.url.host == 'generativelanguage.googleapis.com':
                return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': reply}]}}]})
            if request.url.host == 'api.x.ai':
                return httpx.Response(200, json={'output': [{'type': 'message', 'role': 'assistant', 'content': [{'type': 'output_text', 'text': reply}]}]})
            return httpx.Response(200, json={'message': {'content': reply}})
        self.app = create_app(TOKEN, httpx.MockTransport(upstream), httpx.MockTransport(upstream))
        self.lifespan = self.app.router.lifespan_context(self.app)
        await self.lifespan.__aenter__()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://test', headers={'Authorization': f'Bearer {TOKEN}'})
    async def asyncTearDown(self):
        await self.client.aclose()
        await self.lifespan.__aexit__(None, None, None)
    def payload(self, **changes):
        return {'request_id': str(uuid4()), 'message': 'What is on my screen?', 'model': 'gemini-test', 'mode': 'gemini', 'desktop': True, 'screen': IMAGE, **changes}
    async def connect(self, provider):
        result = await self.client.post(f'/v1/providers/{provider}', json={'api_key': 'fake-screen-test-key-not-real'})
        self.assertEqual(result.status_code, 200)
    async def test_gemini_image_is_inline_once_not_in_history_or_response(self):
        await self.connect('gemini')
        result = await self.client.post('/v1/chat', json=self.payload(desktop_context='{"playback":{"state":"paused"}}'))
        self.assertEqual(result.status_code, 200, result.text)
        outgoing = json.loads(self.calls[-1].content)
        self.assertEqual(outgoing['contents'][-1]['parts'][-1], {'inlineData': {'mimeType': 'image/png', 'data': PNG}})
        self.assertIn('untrusted data', outgoing['systemInstruction']['parts'][0]['text'])
        self.assertIn('paused', outgoing['contents'][-1]['parts'][0]['text'])
        self.assertNotIn(PNG, result.text)
        result = await self.client.post('/v1/chat', json=self.payload(screen=None, message='Thanks', history=[{'role': 'assistant', 'content': 'I saw your image.'}]))
        self.assertEqual(result.status_code, 200)
        self.assertNotIn(PNG, self.calls[-1].content.decode())
    async def test_grok_vision_payload_and_text_model_is_rejected_before_send(self):
        await self.connect('grok')
        result = await self.client.post('/v1/chat', json=self.payload(mode='grok', model='grok-vision'))
        self.assertEqual(result.status_code, 200, result.text)
        outgoing = json.loads(self.calls[-1].content)
        self.assertEqual(outgoing['input'][-1]['content'][-1]['image_url'], f'data:image/png;base64,{PNG}')
        self.assertFalse(outgoing['store'])
        count = len(self.calls)
        result = await self.client.post('/v1/chat', json=self.payload(mode='grok', model='grok-text'))
        self.assertEqual(result.status_code, 409)
        self.assertEqual(len(self.calls), count)
    async def test_local_vision_is_checked_and_uses_base64_images(self):
        result = await self.client.post('/v1/chat', json=self.payload(mode='local', model='local-test'))
        self.assertEqual(result.status_code, 409)
        self.assertFalse(any(call.url.path == '/api/chat' for call in self.calls))
        self.local_vision = True
        result = await self.client.post('/v1/chat', json=self.payload(mode='local', model='local-test'))
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(json.loads(self.calls[-1].content)['messages'][-1]['images'], [PNG])
    async def test_bad_images_browser_attachments_and_large_requests_never_reach_provider(self):
        for change in ({'desktop': False}, {'screen': {**IMAGE, 'data': 'secret-not-base64!'}}, {'screen': {**IMAGE, 'mime_type': 'image/svg+xml'}}, {'screen': {**IMAGE, 'data': base64.b64encode(b'not an image').decode()}}, {'screen': {**IMAGE, 'width': 100000}}, {'desktop_context': 'x' * 16001}):
            result = await self.client.post('/v1/chat', json=self.payload(**change))
            self.assertEqual(result.status_code, 422, result.text)
            self.assertNotIn('secret-not-base64!', result.text)
        self.assertEqual(self.calls, [])
        result = await self.client.post('/v1/providers/gemini', content=b'x' * 65537)
        self.assertEqual(result.status_code, 413)
    async def test_large_but_bounded_image_can_cross_bridge(self):
        await self.connect('gemini')
        large_image = {**IMAGE, 'data': base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'0' * 100000).decode()}
        result = await self.client.post('/v1/chat', json=self.payload(screen=large_image))
        self.assertEqual(result.status_code, 200, result.text)
