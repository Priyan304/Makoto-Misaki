# Makoto Misaki

A personal, local-first AI companion for Priyadharshan. This repository implements the first text-companion milestone of the supplied PRD, with a React studio, the supplied Changli Live2D avatar, an authenticated Python bridge to Ollama, and an Electron desktop shell with reviewed computer actions.

The companion opens into a lantern-lit Japanese garden with a large portrait matching the supplied screenshot reference and a separate translucent conversation box on the right on wide screens. The portrait stays the same size as conversation history grows. Mobile and compact layouts use bottom dialogue. The generated backdrop is served locally; its creation prompt is recorded in [the backdrop notes](docs/design/scene-backdrop.md).

Garden redesign, 2 November 2026: the production build and seven browser checks pass, including portrait centering, transparent input, bottom conversation placement, backdrop loading, all expression toggles, and existing chat flows. Desktop, mobile, compact and preferences screenshots were visually inspected.

Provider update: build, six unit checks, nineteen backend checks and nine browser checks pass. Provider tests use mocked APIs and fake keys; live Gemini/Grok generation has not been exercised without an account key. **Restart the running Misaki launcher** after this update, then open the model selector to add a provider key. UI-only keys must be entered again after a bridge restart; `.env` keys now reconnect automatically.

**Local chat requires no paid API or account.** Ollama remains the default, with `qwen3:4b` selected and `qwen3:1.7b` as a smaller option. You can also select **Gemini** or **Grok** with your own API key. Cloud chat sends messages to that provider and may be billed. Keys entered in the UI last for the bridge session. Add `GEMINI_API_KEY=your_key` to the root `.env` once for automatic connection after restart. See [provider setup and privacy](docs/providers.md). Qwen 3 weights are available under Apache 2.0. See the [official model card](https://ollama.com/library/qwen3:4b) and [Qwen repository](https://github.com/QwenLM/Qwen3).

## Run the working browser studio

Requirements: Node 22.12+ (or a newer supported version) and Python 3.11+. Local chat also needs Ollama; cloud chat needs a Gemini or Grok API key. Dependencies have already been installed in this workspace. For local chat, open Ollama, then run:

```powershell
cd C:\learn\Misaki
npm run dev
```

Open **http://127.0.0.1:1420**. Stop both the bridge and UI with Ctrl+C. The connection screen lists installed chat models and offers copyable download commands. This computer already has `qwen3:4b` and `qwen2.5:0.5b`; no model download is needed to try them. An embedding-only model is deliberately omitted from the chat selector.

For a fresh checkout:

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
npm run dev
```

If Node reports a corporate/local certificate error, use its system trust store, rather than disabling certificate verification:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
npm ci
```

The launcher automatically creates a random session token and starts the bridge. Do not run the Python service unauthenticated or expose either development port to your network. `npm run dev:ui` is the UI-only browser command and does not start the bridge.

## Electron desktop

Stop any browser-only `npm run dev` session with Ctrl+C, then run:

```powershell
npm run desktop
```

Electron opens the same Japanese garden, avatar, model selector and chat in a resizable desktop window. No Rust or C++ build tools are needed. Each new desktop launch builds the interface, then supervises the Python bridge, a loopback server for the built UI, and Electron together; closing the desktop window stops its servers. Ctrl+Shift+M restores/focuses the window. Always-on-top is available in Preferences.

Running `npm run desktop` again brings the existing desktop window forward and preserves its provider connections and conversation. The desktop uses the built UI; `npm run dev` retains Vite live editing. A loading screen and Reload interface recovery replace unexplained blank startup screens.

Ask any selected Local, Gemini or Grok model:

- “Open my Downloads folder.”
- “Open a file.” (native file picker)
- “Play music.” (audio picker; opens your default music player)
- “Open C:\Users\YourName\Documents\notes.pdf.”
- “Show C:\Users\YourName\Documents\notes.pdf in Explorer.”
- “Open https://www.youtube.com.”

Click **Open**, **Play** or **Show in Explorer** beside the proposed target to approve and run it. Requests without a path use **Choose file/folder/music** and a native picker. Cancelled or failed actions offer **Try again**. The result is returned to the conversation. File contents are never read or uploaded. Paths typed in chat are sent to the selected model provider. Pending action cards are session-only and do not replay after reload.

Documents, images, videos and audio can open in their Windows default applications. Programs, scripts, network paths and custom URI handlers cannot be launched. This version does not automate arbitrary mouse/keyboard input or read the screen. See [desktop implementation](docs/electron-desktop.md).

`npm run dev` remains the browser mode. Computer actions require Electron. The older `src-tauri/` source is retained as legacy code; the desktop command now uses Electron. This is a source-run desktop app; a standalone Windows installer with a bundled Python runtime is not included.

## What works in this milestone

- Supplied Changli Live2D character raised and framed from head to knees above the dialogue panel, with physics, breathing, blink, attention and thinking states; original watermark preserved. The Expressions menu offers all seven supplied expressions: heart eyes, blush, angry, white eyes, dark face, eye cover and coat on/off. Toggle several together or use Reset to return to neutral. Assets and runtime are served locally, with reduced-motion support and an SVG fallback if rendering fails.
- Chat through Ollama, Gemini or Grok, with per-request IDs, provider-specific context, cancellation, timeout, readable errors and retry.
- Local model selection, cloud model discovery with your own session keys or automatically loaded `.env` keys, key removal, and connection guidance. Ollama cloud aliases remain blocked; cloud inference uses an explicitly selected provider.
- Settings, compact preview, history disabled by default, opt-in device history, clear and text export.
- Text rendered as plain text, with separately validated desktop action proposals and explicit native target review.
- Independently testable bridge; LocalMind-compatible `/v1` contract without modifying existing LocalMind code.

**Still to build:** local voice and push-to-talk; LocalMind RAG/citations and memory; sidecar supervision and installer; native performance/DPI/monitor validation. The supplied Live2D model is integrated for this local project; distribution rights still need review. No fake model replies are used in the application.

## Tests and validation

Electron update, 2 November 2026: production build, six unit tests, 23 backend tests, ten browser tests, native action checks, the real Electron integration flow, and launcher cleanup checks passed. Electron action tests stub OS launches and provider responses; they do not open personal files or use cloud credits.

```powershell
npm run build          # Strict TypeScript check + production UI bundle
npm test               # Companion state-machine tests
npm run test:backend   # Python authentication, origin, cancellation and model tests
npm run test:launcher  # Port conflicts and server cleanup after launcher termination
npm run test:e2e       # Browser flows using installed Microsoft Edge
npm run test:desktop   # Native action boundaries + real Electron window with stubbed OS launches
```

Verification: build passed, 3 controller tests, 10 backend tests and 4 browser tests passed; npm audit reported zero known vulnerabilities after updating Vitest. Browser tests use explicitly intercepted responses and do not establish inference quality or speed. A separate real `qwen3:4b` test through the running bridge passed and returned a clean greeting in 37.8 seconds with the model warm. This is one observation, not a latency guarantee; an earlier load took about 96 seconds. `npm run smoke:local` repeats that test and records results under `docs/experiments/`; run it with the development server running. Hardware-dependent checks are tracked in [the acceptance notes](docs/acceptance.md).

Avatar update, 30 October 2026: production build, 3 controller tests and 6 browser tests passed. The browser suite loads the real supplied model, checks hide/show recovery under the desktop CSP, verifies reduced motion and exercises the fallback for failed model requests. Every supplied expression is checked against rendered pixels, including reset to neutral and combining toggles. The enlarged hip-up framing and expression menu were visually inspected in studio and compact screenshots. npm reported zero known vulnerabilities after patching the renderer's transitive publishing dependency. Native rendering has not yet been exercised.

## Project layout

```text
src/app/           React studio, compact layout, persistence and desktop hooks
src/api/           Typed LocalMind transport; browser proxy and native IPC
src/companion/     Deterministic controller (text replies return to idle)
src/live2d/        Live2D renderer, local Core loader and original SVG fallback
public/models/     Supplied Changli model, textures and physics
public/vendor/     Official Live2D Cubism Core, served locally
backend/           Authenticated FastAPI bridge and tests
config/            Versioned persona, independent of conversation history
electron/          Electron window, sandboxed preload, IPC and native actions
src-tauri/         Legacy Tauri implementation (not used by npm run desktop)
scripts/           Development supervision and test entry points
tests/             Controller and browser acceptance tests
docs/              Architecture, privacy and acceptance notes
```

`MISAKI_OLLAMA_URL` can select another **loopback HTTP origin**; remote endpoints are rejected. `MISAKI_PYTHON` can select another Python executable. Ports 1420, 8765 and Ollama's 11434 are the development defaults.

See [architecture and privacy](docs/architecture.md) before extending this project, and the [original supplied PRD](docs/reference/product-requirements.md) for the full roadmap. Assets and dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md) for the model and Cubism Core provenance. Generate and commit a Cargo lockfile when the native toolchain is installed; native transitive dependency resolution has not yet been verified.
