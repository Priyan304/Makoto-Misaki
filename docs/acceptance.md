# Milestone acceptance record

Date: 28 October 2026. Development environment: Windows x64, 16 GB RAM, Node 26.3.1, Python 3.14.6, Ollama 0.40.12. Installed chat models: `qwen3:4b`, `qwen2.5:0.5b`. Installed embedding model: `nomic-embed-text:latest`. Rust/Cargo absent; Visual Studio Build Tools instance is incomplete and does not provide the required detected MSVC/SDK components.

| Gate | Status | Evidence or remaining work |
| --- | --- | --- |
| Strict TypeScript / production UI build | PASS | `npm run build` |
| State controller | PASS | 3 tests; focus/blur cannot override thinking; error/cancel recover |
| Bridge validation and security | PASS | 10 mocked-upstream tests; auth/origin, validation, duplicate IDs, remote route rejection, cancellation, offline/timeout, legacy thinking-template regression |
| Browser flows | PASS | 4 Edge tests; single send, context, safe text rendering, cancel/error, settings, history/export, compact/mobile |
| Browser visual QA | PASS | Inspected generated studio and compact screenshots |
| Dependency audit | PASS at initial verification | npm audit: zero reported advisories after Vitest 4.1.12 update |
| Actual Ollama health/model discovery | PASS | Local runtime responds; two local chat models detected |
| Actual local model response | PASS | Real `qwen3:4b` through the bridge: clean greeting, 37,827 ms end to end / 37,772 ms bridge latency; `docs/experiments/local-smoke.json` |
| Native compilation | BLOCKED ON PREREQUISITES | Install Rust and complete MSVC/Windows SDK setup, then run `npm run desktop` |
| Native transparency, tray, drag, monitor/DPI recovery | NOT RUN | Requires a native build and hands-on Windows checks |
| Supplied Live2D model | INTEGRATED; DISTRIBUTION RIGHTS UNVERIFIED | Changli model, original textures/watermark and physics loaded locally; enlarged hip-up framing and all seven supplied expression toggles with reset. Browser render/reload, each expression's visible effect/reset, reduced motion, compact layout and model-fetch failure covered. SVG retained for errors. Native validation and model permissions review remain open. |
| Voice / microphone | DEFERRED P2 | No microphone capture or voice UI is active |
| RAG / memory / action consent | DEFERRED P3 | Persona only; no RAG, persistent semantic memory or OS actions |
| Installer / sidecar / signing | DEFERRED P4 | Bundling disabled; clean-machine testing required |
| CPU/RAM/GPU/FPS baselines | NOT MEASURED | Collect on the native reference machine; CSS animations are not a measured 30 FPS guarantee |

Browser tests deliberately mock inference to make failure, cancellation and storage behavior deterministic. They do not validate inference latency or model quality. The separate live smoke test does confirm one real successful local exchange. Initial real integration uncovered a legacy Qwen template that always opened a thinking block even when parsing was disabled. The bridge now detects that template, enables Ollama's reasoning separation, and returns only final content; the regression is covered by a backend test. Warm/cold samples are not a benchmark, and responsiveness still needs tuning. The original P0/P1 exit criteria are not yet fully met because native behavior and licensed Live2D integration remain open.

Next development steps: finish the Windows toolchain; validate tray/quit/transparency/DPI and native Live2D; review supplied model distribution permissions; profile model latency on typical conversations; then freeze and demonstrate P1 before starting voice.
