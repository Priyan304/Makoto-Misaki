"""Explicit cloud adapters. Credentials live only in this bridge's memory."""
import re
import ssl
from typing import Literal

import httpx
from fastapi import HTTPException

CloudProvider = Literal['gemini', 'grok']
PROVIDERS = ('gemini', 'grok')
NAMES = {'gemini': 'Gemini', 'grok': 'Grok'}
MODEL_ID = re.compile(r'^[a-zA-Z0-9_.-]{1,100}$')


def provider_error(provider: CloudProvider, error: Exception) -> HTTPException:
    name = NAMES[provider]
    if isinstance(error, httpx.TimeoutException):
        return HTTPException(504, f'{name} timed out. Try again or choose another model.')
    if isinstance(error, httpx.HTTPStatusError):
        status = error.response.status_code
        if status in (401, 403):
            return HTTPException(403, f'{name} rejected this API key or model access. Check your key and account permissions.')
        if status == 429:
            return HTTPException(429, f'{name} rate limit or quota reached. Check your account usage and billing, then retry.')
        if status == 404:
            return HTTPException(404, f'{name} model is unavailable. Reconnect to refresh the model list.')
        return HTTPException(502, f'{name} could not complete this request. Check model availability and your provider account.')
    if isinstance(error, httpx.RequestError):
        cause = error
        for _ in range(8):
            if isinstance(cause, ssl.SSLCertVerificationError):
                return HTTPException(503, f'{name} HTTPS certificate verification failed. Check the system certificate store and restart Misaki.')
            cause = cause.__cause__
            if cause is None:
                break
        return HTTPException(503, f'Cannot reach {name}. Check your internet connection and retry.')
    return HTTPException(502, f'{name} returned an unreadable or empty response. Retry or choose another model.')


class CloudProviders:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client
        self._keys: dict[str, str] = {}
        self._models: dict[str, list[str]] = {}
        self._vision: dict[str, list[str]] = {}
        self._revisions: dict[str, int] = {}

    def status(self, provider: CloudProvider):
        return {'provider': provider, 'configured': provider in self._keys, 'models': self._models.get(provider, []), 'vision_models': self._vision.get(provider, [])}

    def forget(self, provider: CloudProvider):
        self._revisions[provider] = self._revisions.get(provider, 0) + 1
        self._keys.pop(provider, None)
        self._models.pop(provider, None)
        self._vision.pop(provider, None)
        return self.status(provider)

    def close(self):
        self._keys.clear()
        self._models.clear()
        self._vision.clear()
        self._revisions.clear()

    async def configure(self, provider: CloudProvider, key: str):
        revision = self._revisions.get(provider, 0) + 1
        self._revisions[provider] = revision
        try:
            if provider == 'gemini':
                names = []
                page_token = None
                for _ in range(10):
                    params = {'pageSize': 1000}
                    if page_token:
                        params['pageToken'] = page_token
                    response = await self.client.get('https://generativelanguage.googleapis.com/v1beta/models', headers={'x-goog-api-key': key}, params=params, timeout=15)
                    response.raise_for_status()
                    payload = response.json()
                    for entry in payload.get('models', []):
                        name = entry.get('name', '').removeprefix('models/')
                        if 'generateContent' in entry.get('supportedGenerationMethods', []) and name.startswith('gemini-') and MODEL_ID.fullmatch(name) and not any(word in name for word in ('image', 'audio', 'tts', 'robotics', 'computer-use')):
                            names.append(name)
                    page_token = payload.get('nextPageToken')
                    if not page_token:
                        break
                vision = list(names)
            else:
                response = await self.client.get('https://api.x.ai/v1/language-models', headers={'Authorization': f'Bearer {key}'}, timeout=15)
                response.raise_for_status()
                entries = response.json().get('models', [])
                names = [entry['id'] for entry in entries
                         if isinstance(entry, dict) and isinstance(entry.get('id'), str) and MODEL_ID.fullmatch(entry['id'])
                         and 'text' in entry.get('input_modalities', []) and 'text' in entry.get('output_modalities', [])]
                vision = [entry['id'] for entry in entries if isinstance(entry, dict) and entry.get('id') in names and 'image' in entry.get('input_modalities', [])]
            names = sorted(set(names))
            if not names:
                raise HTTPException(409, f'No supported text models were returned by {NAMES[provider]}. Check your account access.')
            # Never replace a working key until the new one has been validated.
            if self._revisions.get(provider) != revision:
                raise HTTPException(409, 'This connection changed while loading models. Connect again if needed.')
            self._keys[provider] = key
            self._models[provider] = names
            self._vision[provider] = sorted(set(vision))
            return self.status(provider)
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as error:
            raise provider_error(provider, error) from None

    async def generate(self, provider: CloudProvider, model: str, message: str, history: list[dict], system_prompt: str, *, image: dict | None = None):
        key = self._keys.get(provider)
        if not key:
            raise HTTPException(409, f'Add your {NAMES[provider]} API key in Connection before chatting.')
        if model not in self._models.get(provider, []):
            raise HTTPException(409, f'Select a model from your connected {NAMES[provider]} model list.')
        if image and model not in self._vision.get(provider, []):
            raise HTTPException(409, f'This {NAMES[provider]} model does not advertise image support. Choose a vision model or remove the screenshot.')
        try:
            if provider == 'gemini':
                contents = [{'role': 'model' if turn['role'] == 'assistant' else 'user', 'parts': [{'text': turn['content']}]} for turn in history]
                contents.append({'role': 'user', 'parts': [{'text': message}, *([{'inlineData': {'mimeType': image['mime_type'], 'data': image['data']}}] if image else [])]})
                response = await self.client.post(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent', headers={'x-goog-api-key': key}, json={
                    'systemInstruction': {'parts': [{'text': system_prompt}]}, 'contents': contents,
                    'generationConfig': {'maxOutputTokens': 4096},
                })
                response.raise_for_status()
                payload = response.json()
                parts = payload['candidates'][0]['content']['parts']
                text = '\n'.join(part['text'] for part in parts if isinstance(part.get('text'), str) and not part.get('thought'))
            else:
                response = await self.client.post('https://api.x.ai/v1/responses', headers={'Authorization': f'Bearer {key}'}, json={
                    'model': model, 'input': [{'role': 'system', 'content': system_prompt}, *history, {'role': 'user', 'content': [{'type': 'input_text', 'text': message}, {'type': 'input_image', 'image_url': f"data:{image['mime_type']};base64,{image['data']}"}] if image else message}],
                    'stream': False, 'max_output_tokens': 4096, 'store': False,
                })
                response.raise_for_status()
                text = '\n'.join(part['text'] for item in response.json()['output'] if item.get('type') == 'message' and item.get('role') == 'assistant'
                                 for part in item.get('content', []) if part.get('type') == 'output_text' and isinstance(part.get('text'), str))
            if not isinstance(text, str) or not text.strip():
                raise ValueError('Empty reply')
            return text.strip()
        except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError, AttributeError) as error:
            raise provider_error(provider, error) from None
