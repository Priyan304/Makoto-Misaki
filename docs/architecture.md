# Architecture and implementation decisions

## ADR-001 — First text milestone

React + TypeScript render the browser and desktop UI. Electron now owns native window operations and reviewed desktop actions; the older Tauri source is retained but is not used by the desktop launcher. A separate FastAPI bridge owns persona composition, validation, cancellation and Ollama requests. This repository does not import, replace or alter a preexisting LocalMind backend. The API contract can be adapted to that system later.

The source-run Electron desktop builds the React UI before startup and serves those built assets through a supervised loopback HTTP server alongside Python, without a Rust dependency. Browser development retains Vite and live editing. Its resizable 1440 × 960 initial window preserves the wide avatar/right chat layout. See [Electron desktop](electron-desktop.md) for the current desktop contract and tests. A standalone installer remains future work.

## ADR-002 — Supplied Changli Live2D avatar with SVG fallback

The avatar loads the user-supplied `长离.model3.json`, `.moc3`, four textures and physics from `public/models/changli/`. PixiJS 6 and `pixi-live2d-display/cubism4` keep the original watermark visible. On wide screens, a separate right-hand conversation box leaves the large portrait unobstructed; framing depends on the viewport and stays constant as history grows. Narrow and compact screens use bottom dialogue with framing that fits her upper body above the panel. A resize observer watches both the canvas host and panel. Core is bundled under `public/vendor/` and loaded before the adapter; no runtime CDN is used. Original model assets are preserved and metadata is treated as data.

All seven supplied `.exp3.json` files are exposed as independent toggles through the Expressions menu, including the coat and eye-cover switches. The adapter composes their parameter values after physics using each file's Add/Multiply/Overwrite blend mode, then restores its base parameters for the next frame. Reset clears every selected expression. Expressions redraw immediately even under reduced motion; continuous physics and breathing stop while reduced motion is active. The browser test compares actual rendered pixels for each expression and its reset, and checks the catalog against the supplied folder.

The model's EyeBlink group is empty, so the adapter drives its actual eye parameter IDs and subtle head/body poses for idle, attention, thinking and error states. The supplied physics remains active. Rendering uses a private ticker capped at 30 FPS; document visibility pauses it, and either the OS or app reduced-motion preference stops continuous updates. Resize and settings changes redraw once. Unmount destroys the canvas, ticker, model and textures. Loading or WebGL context failure shows the original animated SVG fallback with a visible status. Chat remains usable.

Pixi's CSP-compatible shader implementation is installed explicitly. The desktop policy allows same-origin model fetches and WebAssembly compilation, without granting JavaScript eval. Browser validation also exercises this policy. Model redistribution permissions have not been supplied; native validation and rights review remain open. See `THIRD_PARTY_NOTICES.md`.

Canvas backing resolution follows the current display pixel ratio on every resize, zoom or density notification, with a minimum of one pixel per CSS pixel. A visible-tab density check covers changes without browser events, including reduced-motion mode; it redraws only if resolution changed and is cleared on unmount. The browser regression reproduces the former stale 0.625-DPR buffer after returning to 100% zoom (1.25 DPR), then verifies repeated zoom and density-only changes through 2.5 DPR without reloading.

## ADR-003 — Local by default with optional Gemini and Grok

Default: `qwen3:4b`, already installed on the development computer. Alternative free Qwen 3 sizes are shown, and other installed local chat models can be selected. Downloads are explicit terminal commands. Ollama is not automatically installed, started, terminated, upgraded or reconfigured by this app.

The bridge binds to 127.0.0.1, limits Ollama to loopback and cloud routes to fixed Gemini/Grok HTTPS endpoints, disables HTTP redirects and proxy environment variables, filters remote/embedding model entries, and checks `/api/show` before sending a prompt. Models that advertise a remote host/model are rejected. There is no automatic cloud fallback; cloud providers are explicitly selected. See [provider setup and privacy](providers.md). This trusts the local Ollama runtime and its metadata; it does not isolate against malware or a malicious runtime on the same account.

Context is up to the last 12 successful messages for the selected provider, with bounded content size. Persona comes from `config/persona.v1.json`; frontend history is not persistent semantic memory. Context windows and prediction lengths are capped in the Ollama request. No embeddings/RAG calls or fabricated retrieval are supplied. Electron conversations opt into a bounded JSON action-proposal contract; browser chat cannot execute these actions.

The installed Qwen 3 checkpoint has an early template that unconditionally opens a thinking block. For that template the bridge enables Ollama's thinking parser, allows a larger bounded generation budget, and forwards only the final content. The separate thinking field is discarded. Newer templates that honor the Think switch receive `think: false`. A final delimiter safeguard handles older responses that place a tagged reasoning block in content. This was added after a real-model integration test; merely passing `think: false` with the older template produced internal text in the content field. Local latency can be tens of seconds, especially when loading a model. The UI provides cancellation and a timeout; choose a smaller installed model when needed.

## Authentication and outbound connections

The launcher generates a random 256-bit session secret, passed through process environment to its children. Browser requests go to Vite's same-origin `/api` proxy, which injects the secret server-side. Electron requests use a sandboxed preload and validated main-frame IPC handler, which permits health, supported provider status/configuration/removal, chat and cancellation paths and methods, then authenticates over fixed loopback HTTP. The API rejects an incorrect secret or an unapproved browser Origin. The secret is never written to a frontend bundle, persisted in settings or printed.

Runtime connections:

| Source | Destination | Purpose |
| --- | --- | --- |
| Browser studio | 127.0.0.1:1420 | UI, HMR, same-origin API proxy |
| Vite/desktop UI proxy or Electron main | 127.0.0.1:8765 | Authenticated bridge |
| Python bridge | 127.0.0.1:11434 | Local model listing, metadata, chat |
| Python bridge | generativelanguage.googleapis.com:443 | Explicit Gemini discovery and chat |
| Python bridge | api.x.ai:443 | Explicit Grok discovery and chat |

User-initiated Ollama download links/commands contact external hosts. npm/Python dependency installation also uses external registries. No telemetry, update service, remote font, analytics, microphone, screenshot service or auto-download exists in the application.

## Cancellation and failure handling

The UI guards a send synchronously, assigns a UUID and permits one outstanding request. The bridge rejects repeated request IDs (bounded recent cache) and permits at most two concurrent generations. Cancel aborts the browser request and sends a separate cancellation command; native IPC uses the latter to cancel upstream inference. The bridge cancels its upstream task on client disconnect or cancellation, and clears its active registry in `finally`. Ollama may need a moment to reclaim resources after an HTTP disconnect; GPU reset timing is not asserted.

Typing cannot override thinking. Text replies transition to idle; there is no pretend speaking/lip sync. Backend errors transition to error, and typing, retry, cancellation or reset provide recovery. Input/request bytes are bounded, the API schema forbids extra fields and system-role history, and returned text is never interpreted as HTML. Desktop actions are parsed separately, validated again in Electron, and require an explicit action-button click in chat; empty paths additionally require native file selection. Cancelled and failed action cards remain retryable.

## Data retention

Settings and native window position use the webview/browser's local storage. Chat content is in memory unless the user enables history. Opt-in history keeps up to 100 completed messages in plaintext local storage; it is not encrypted. Switching history off deletes its saved copy. Clear removes both displayed and stored messages. Export creates a user-initiated local text download. The bridge has no persistent conversation store. Ollama itself may maintain its own operational logs, outside this application's control.

Packaged sidecar startup, credential lifecycle, configurable hotkeys, encrypted storage, log export, streaming and full native crash/shutdown behavior are later work. Browser refresh discards in-memory conversations when history is disabled. Do not treat a successful browser build as a release acceptance result.


Cloud keys may optionally come from the root `.env` file or process environment. Only the Python bridge reads those credentials; background startup discovery reports key presence/source/loading/error but never a value. UI-only key entry remains session-only. Session disconnect does not edit `.env`, and tests isolate their factories and launcher environments from real saved keys. See [provider setup](providers.md).
