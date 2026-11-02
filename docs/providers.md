# Local, Gemini and Grok

Restart Misaki after updating: stop the running `npm run dev` process with Ctrl+C, then run it again. The new connection endpoints require the updated Python bridge.

## Using a provider

1. Open the model selector below the chat input and choose Local · Ollama, Gemini or Grok. The Connection page has the same choices.
2. Local uses Ollama and needs no cloud API key. Cloud chat works without Ollama.
3. Add `GEMINI_API_KEY` or `GROK_API_KEY` to the root `.env` file once for automatic connection on every startup. Alternatively paste a key in Connection and click **Connect & load models** for this session. The bridge retrieves currently available text model IDs using that key.
4. Choose a model, click **Use Gemini** or **Use Grok**, then chat. Cloud usage is marked in the header, input footer and reply metadata. Provider charges and quotas may apply.
5. Use **Remove key** for a UI-only key or **Disconnect for this session** for a saved key. A pending connection cannot restore a disconnected key. Remove the entry from `.env` to stop automatic connection on future launches.

There is no automatic provider fallback. Switching providers keeps the visible transcript, but only turns tagged with the selected provider enter its outgoing context. Older, untagged history belongs to Local. Models within the same provider share that provider's recent context.

## Credentials and network requests

Keys entered in Connection pass through the authenticated bridge and remain in Python memory for that session. Optional `.env` credentials are plaintext in the user's local project file and load automatically on startup. They are never returned through provider status, saved in browser storage or chat history, included in model prompt text, or printed in application logs. The key input clears after connection. `.env` and `.env.*` are ignored by version control; `.env.example` contains only empty placeholders.

The Python bridge reads only `GEMINI_API_KEY` and `GROK_API_KEY` from the root `.env`, using quoted-value/comment support without interpolation or global environment mutation. Process environment values take precedence, including an explicitly empty value. Do not prefix secrets with `VITE_`. The file is outside the frontend's served directory and no credential value is embedded in the UI bundle.

Saved-key discovery runs in the background, so a slow or invalid key does not delay opening the app or local chat. Connection shows automatic loading and sanitized errors. **Retry saved key** rereads the file and retries without typing it into the UI. UI key replacements do not modify `.env`; a session disconnect does not erase the saved entry. Saved model choices are reused when available, with the first discovered text model selected if no valid model was saved. Provider choice itself remains explicit.

Example `C:\learn\Misaki\.env`:

```dotenv
GEMINI_API_KEY=your_key_here
GROK_API_KEY=
```

After adding your key, close the desktop window completely and run `npm run desktop` once. Later launches reconnect from `.env`. Dependencies are installed in this workspace; a fresh checkout needs the updated `backend/requirements.lock.txt`.

Cloud destinations are fixed: `generativelanguage.googleapis.com` and `api.x.ai`. Custom base URLs are not accepted. Redirects and environment proxies are disabled. Keys use authentication headers, not URL query strings. Validation and provider errors never echo keys or upstream response bodies. Launcher authentication, origin checks, bounded requests and cancellation also apply to cloud operations.

Native IPC permits only provider status, configuration/removal for the two supported providers, health, chat and cancellation. Python performs cloud networking; the renderer's CSP needs no external access. Electron transport is verified with fixture provider responses.

Gemini uses generateContent with a system instruction and user/model history; thought-tagged response parts are excluded. Grok uses Responses with `store: false`, bounded explicit history and no server-side tools; only assistant output text is returned. Provider retention and account policies still apply. Cloud inference sends content off this computer.

## Protocol references

- [Gemini model discovery](https://ai.google.dev/api/models)
- [Gemini text generation](https://ai.google.dev/gemini-api/docs/generate-content/text-generation)
- [Grok language model discovery](https://docs.x.ai/developers/rest-api-reference/inference/models)
- [Grok Responses API and storage controls](https://docs.x.ai/developers/model-capabilities/text/generate-text)

## Validation

Tests use fake keys and mocked upstream responses. They cover provider discovery, routing, payloads, key removal and shutdown clearing, removal during connection, sanitized errors, quota/auth/network failures, redirects, cancellation, UI switching, history isolation, legacy settings and browser key non-persistence. Saved-key tests also cover loading across bridge restarts, quoted .env values, process-environment precedence, disabled interpolation, startup discovery without delaying health, retry after editing the file, and disconnect during startup. Browser checks verify automatic model selection and retrying a saved key without submitting its value from the UI. They do not establish real account access or billable live inference. No user key was available for a live Gemini or Grok request.
# HTTPS certificate trust

Cloud requests use an explicit Truststore SSL context, which uses Windows' native certificate store on Windows. Certificate and hostname verification remain enabled. This supports locally trusted enterprise/security roots without disabling HTTPS checks or globally patching Python SSL. See the [HTTPX SSL documentation](https://www.python-httpx.org/advanced/ssl/) and [Truststore documentation](https://truststore.readthedocs.io/en/latest/).

After updating this code, install `backend/requirements.lock.txt` in the selected Python environment and restart Misaki (`npm run desktop` for Electron, `npm run dev` for browser). A TLS verification failure now has a specific, sanitized provider message, distinct from an unavailable local bridge. UI-only keys need re-entry after restart; `.env` keys reconnect automatically.

