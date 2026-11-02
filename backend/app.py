"""Authenticated local bridge with explicit local, Gemini and Grok routes."""
import asyncio
import hmac
import json
import logging
import os
import re
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse
from uuid import UUID

import httpx
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse
from .providers import CloudProviders, CloudProvider, PROVIDERS
from .desktop import DESKTOP_PROMPT, parse_desktop_reply
from .tls import cloud_ssl_context
from .saved_keys import read_saved_keys, KEY_NAMES

logger = logging.getLogger('misaki')
ALLOWED_ORIGINS = {'http://127.0.0.1:1420', 'http://localhost:1420', 'tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'}
if os.environ.get('MISAKI_UI_PORT', '').isdigit() and 1024 <= int(os.environ['MISAKI_UI_PORT']) <= 65535:
    ALLOWED_ORIGINS.add(f"http://127.0.0.1:{int(os.environ['MISAKI_UI_PORT'])}")
DEFAULT_MODEL = 'qwen3:4b'
PERSONA = json.loads((Path(__file__).resolve().parents[1] / 'config/persona.v1.json').read_text(encoding='utf-8'))


def final_reply(content, thinking_model: bool) -> str:
    """Some older model templates put thinking markup in content despite think=False."""
    if not isinstance(content, str):
        raise ValueError('Unreadable model reply')
    if thinking_model:
        if '</think>' in content:
            content = content.rsplit('</think>', 1)[1]
        elif '<think>' in content:
            raise ValueError('No final answer received')
    if not content.strip():
        raise ValueError('Empty model reply')
    return content.strip()


class Turn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=8000)


class ChatIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_id: UUID
    conversation_id: UUID | None = None
    message: str = Field(min_length=1, max_length=4000)
    model: str = Field(default=DEFAULT_MODEL, min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_.:/-]+$')
    mode: Literal['local', 'gemini', 'grok'] = 'local'
    history: list[Turn] = Field(default_factory=list, max_length=12)
    desktop: bool = False

    @model_validator(mode='after')
    def validate_content(self):
        if not self.message.strip():
            raise ValueError('Message cannot be blank')
        if sum(len(turn.content) for turn in self.history) > 24000:
            raise ValueError('Conversation context is too long')
        return self


class ProviderKey(BaseModel):
    model_config = ConfigDict(extra='forbid')
    api_key: SecretStr | None = Field(default=None, min_length=16, max_length=512)

    @model_validator(mode='after')
    def validate_key(self):
        if self.api_key is not None and not re.fullmatch(r'[!-~]{16,512}', self.api_key.get_secret_value()):
            raise ValueError('Invalid API key')
        return self


def create_app(token: str | None = None, transport: httpx.AsyncBaseTransport | None = None, cloud_transport: httpx.AsyncBaseTransport | None = None, *, env_file: Path | None = None, key_environment: dict[str, str] | None = None) -> FastAPI:
    session_token = token if token is not None else os.environ.get('MISAKI_SESSION_TOKEN', '')
    endpoint = os.environ.get('MISAKI_OLLAMA_URL', 'http://127.0.0.1:11434')
    parsed = urlparse(endpoint)
    if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost', '::1') or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
        raise ValueError('MISAKI_OLLAMA_URL must be a plain loopback HTTP origin')

    @asynccontextmanager
    async def lifespan(app):
        if len(session_token) < 32:
            raise RuntimeError('Missing session token: launch with npm run dev or npm run desktop')
        async with httpx.AsyncClient(base_url=endpoint, timeout=httpx.Timeout(120, connect=3), transport=transport, trust_env=False, follow_redirects=False) as client, httpx.AsyncClient(timeout=httpx.Timeout(120, connect=10), transport=cloud_transport, verify=cloud_ssl_context(), trust_env=False, follow_redirects=False) as cloud_client:
            app.state.ollama = client
            app.state.providers = CloudProviders(cloud_client)
            app.state.connection_meta = {provider: {'saved_key': False, 'source': None, 'loading': False, 'error': None, 'revision': 0} for provider in PROVIDERS}
            startup_tasks = []
            try:
                saved = saved_keys()
            except (OSError, UnicodeError):
                saved = {}
                for meta in app.state.connection_meta.values():
                    meta['error'] = 'Could not read .env. Check that the file is readable UTF-8 text.'
            for provider, key in saved.items():
                app.state.connection_meta[provider].update(saved_key=True, loading=True)
                startup_tasks.append(asyncio.create_task(restore_provider(provider, key, 0)))
            try:
                yield
            finally:
                for task in startup_tasks:
                    task.cancel()
                await asyncio.gather(*startup_tasks, return_exceptions=True)
                for task in list(active.values()):
                    task.cancel()
                if active:
                    await asyncio.gather(*list(active.values()), return_exceptions=True)
                app.state.providers.close()

    app = FastAPI(title='Misaki LocalMind Bridge', version='1.0.0', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    active: dict[str, asyncio.Task] = {}
    seen: OrderedDict[str, None] = OrderedDict()

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request, _error):
        # Validation errors must never echo credentials or request bodies.
        return JSONResponse({'detail': 'Invalid request. Check the fields and try again.'}, status_code=422)

    @app.middleware('http')
    async def boundary(request: Request, call_next):
        origin = request.headers.get('origin')
        if origin and origin not in ALLOWED_ORIGINS:
            return JSONResponse({'detail': 'Origin not allowed'}, status_code=403)
        expected = f'Bearer {session_token}'
        if len(session_token) < 32 or not hmac.compare_digest(request.headers.get('authorization', '').encode(), expected.encode()):
            return JSONResponse({'detail': 'Authenticated launcher session required'}, status_code=401)
        # Bound actual bytes, including chunked bodies; Content-Length alone is untrusted.
        if request.method == 'POST':
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 65536:
                    return JSONResponse({'detail': 'Request too large'}, status_code=413)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    async def models():
        response = await app.state.ollama.get('/api/tags', timeout=4)
        response.raise_for_status()
        data = response.json()
        names = [entry['name'] for entry in data.get('models', []) if isinstance(entry, dict) and isinstance(entry.get('name'), str)
                 and not entry.get('remote_host') and not entry.get('remote_model') and 'cloud' not in entry['name'].lower()
                 and ('capabilities' not in entry or 'completion' in entry['capabilities'])]
        return names

    def saved_keys():
        # Factory instances used by tests do not read a developer's real keys.
        if env_file is None and key_environment is None:
            return {}
        return read_saved_keys(env_file, os.environ if key_environment is None else key_environment)

    def status(provider):
        meta = app.state.connection_meta[provider]
        return {**app.state.providers.status(provider), **{name: meta[name] for name in ('saved_key', 'source', 'loading', 'error')}}

    async def configure(provider, key, source):
        meta = app.state.connection_meta[provider]
        revision = meta['revision'] + 1
        meta.update(revision=revision, loading=True, error=None)
        try:
            if not re.fullmatch(r'[!-~]{16,512}', key):
                raise HTTPException(422, f'Invalid saved {provider} key. Check {KEY_NAMES[provider]} in .env.')
            await app.state.providers.configure(provider, key)
            if meta['revision'] == revision:
                meta['source'] = source
        except HTTPException as error:
            if meta['revision'] == revision:
                meta['error'] = error.detail
            raise
        finally:
            if meta['revision'] == revision:
                meta['loading'] = False
        return status(provider)

    async def restore_provider(provider, key, revision):
        if app.state.connection_meta[provider]['revision'] != revision:
            return
        try:
            await configure(provider, key, 'saved')
        except HTTPException:
            pass  # Sanitized error is visible in provider status; startup continues.

    @app.get('/v1/providers')
    async def provider_status():
        return {'providers': [status(provider) for provider in PROVIDERS]}

    @app.post('/v1/providers/{provider}')
    async def configure_provider(provider: CloudProvider, data: ProviderKey):
        if data.api_key is not None:
            return await configure(provider, data.api_key.get_secret_value(), 'session')
        try:
            key = saved_keys().get(provider)
        except (OSError, UnicodeError):
            raise HTTPException(409, 'Could not read .env. Check the file and try again.') from None
        app.state.connection_meta[provider]['saved_key'] = bool(key)
        if not key:
            raise HTTPException(409, f'Add {KEY_NAMES[provider]} to .env, or paste a key to connect.')
        return await configure(provider, key, 'saved')

    @app.delete('/v1/providers/{provider}')
    async def forget_provider(provider: CloudProvider):
        meta = app.state.connection_meta[provider]
        meta.update(revision=meta['revision'] + 1, source=None, loading=False, error=None)
        app.state.providers.forget(provider)
        return status(provider)

    @app.get('/v1/health')
    async def health():
        try:
            installed = await models()
            return {'api_version': '1', 'status': 'ready' if installed else 'starting', 'models': installed, 'route': 'local', 'detail': 'Ollama connected' if installed else 'No local models found. Pull qwen3:4b with Ollama.'}
        except httpx.RequestError:
            return {'api_version': '1', 'status': 'offline', 'models': [], 'route': 'local', 'detail': 'Ollama is not running. Open Ollama, then reconnect.'}
        except (httpx.HTTPStatusError, ValueError, KeyError, TypeError):
            return {'api_version': '1', 'status': 'failed', 'models': [], 'route': 'local', 'detail': 'Ollama returned an invalid response. Check the local runtime.'}

    async def generate(data: ChatIn):
        system = PERSONA['system_prompt'] + (DESKTOP_PROMPT if data.desktop else ' No desktop tools are available in this browser conversation.')
        if data.mode != 'local':
            return await app.state.providers.generate(data.mode, data.model, data.message.strip(), [turn.model_dump() for turn in data.history], system + f' This conversation uses {data.mode} through a cloud API.')
        try:
            installed = await models()
            if data.model not in installed:
                raise HTTPException(409, f'Model is not installed locally. Run: ollama pull {data.model}')
            details_response = await app.state.ollama.post('/api/show', json={'model': data.model}, timeout=5)
            details_response.raise_for_status()
            details = details_response.json()
            if details.get('remote_host') or details.get('remote_model'):
                raise HTTPException(403, 'Cloud-backed models are disabled. Choose a locally installed model.')
            if 'completion' not in details.get('capabilities', []):
                raise HTTPException(409, 'This model does not support chat. Choose a completion model.')
            thinking_model = 'thinking' in details.get('capabilities', [])
            # Early Qwen templates unconditionally open <think>. Turning parsing off
            # exposes that internal text as content. Keep Ollama's parser enabled
            # for those templates; only message.content is returned to the UI.
            template = details.get('template', '')
            legacy_thinking = thinking_model and data.model.startswith('qwen3:') and '<think>' in template and not re.search(r'\.Think\b', template)
            payload = {
                'model': data.model,
                'messages': [{'role': 'system', 'content': system + ' This conversation runs locally through Ollama.'}, *[turn.model_dump() for turn in data.history], {'role': 'user', 'content': data.message.strip()}],
                'stream': False, 'keep_alive': '2m',
                'options': {'num_ctx': 4096, 'num_predict': 2048 if legacy_thinking else 512, 'temperature': 0.7},
            }
            if thinking_model:
                payload['think'] = bool(legacy_thinking)
            response = await app.state.ollama.post('/api/chat', json=payload)
            response.raise_for_status()
            payload = response.json()
            return final_reply(payload['message']['content'], thinking_model)
        except httpx.TimeoutException:
            raise HTTPException(504, 'The local model timed out. Try a smaller model or a shorter message.') from None
        except httpx.RequestError:
            raise HTTPException(503, 'Cannot reach Ollama. Open Ollama and reconnect.') from None
        except httpx.HTTPStatusError:
            raise HTTPException(502, 'Ollama could not generate a response. Check the model and available memory.') from None
        except (ValueError, KeyError, TypeError):
            raise HTTPException(502, 'Ollama returned an unreadable response. Retry or switch models.') from None

    @app.post('/v1/chat')
    async def chat(data: ChatIn, request: Request):
        request_id = str(data.request_id)
        if request_id in seen or request_id in active:
            raise HTTPException(409, 'This request ID has already been submitted')
        if len(active) >= 2:
            raise HTTPException(429, 'Misaki is busy. Cancel the current request first.')
        seen[request_id] = None
        while len(seen) > 256:
            seen.popitem(last=False)
        started = time.perf_counter()
        task = asyncio.create_task(generate(data))
        active[request_id] = task
        try:
            while not task.done():
                await asyncio.wait({task}, timeout=0.15)
                if await request.is_disconnected():
                    task.cancel()
            reply = await task
            actions = []
            if data.desktop:
                reply, actions = parse_desktop_reply(reply)
            elapsed = round((time.perf_counter() - started) * 1000)
            logger.info('chat.completed request=%s latency_ms=%s', request_id, elapsed)
            return {'request_id': request_id, 'reply': reply, 'actions': actions, 'citations': [], 'model': data.model, 'route': data.mode, 'status': 'ok', 'latency_ms': elapsed}
        except asyncio.CancelledError:
            raise HTTPException(499, 'Request cancelled') from None
        finally:
            active.pop(request_id, None)
            if not task.done():
                task.cancel()

    @app.post('/v1/chat/{request_id}/cancel')
    async def cancel(request_id: UUID):
        task = active.get(str(request_id))
        if task:
            task.cancel()
        return {'request_id': str(request_id), 'status': 'cancelled' if task else 'not_running'}

    return app


app = create_app(env_file=Path(__file__).resolve().parents[1] / '.env')
