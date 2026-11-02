MAKOTO MISAKI

Desktop AI Companion  
Product Requirements Document & Complete Implementation Guide

Version 1.0 • 28 October 2026 • Windows-first • Proposed specification

A practical, brick-by-brick blueprint for building an expressive Live2D desktop companion connected to LocalMind.

Decision: Build a working desktop avatar and text bridge first. Add voice, memory, privacy-aware extensions and distribution only after measurable acceptance gates.

# At-a-glance roadmap

| Stage | Product capability    | Exit criterion                               |
| ----- | --------------------- | -------------------------------------------- |
| P0    | Desktop avatar        | Visible, animated, movable, recoverable      |
| P1    | Local text companion  | Ollama response; robust offline handling     |
| P2    | Voice                 | Opt-in TTS/STT; interruptible lip sync       |
| P3    | Personal intelligence | Persona + privacy-aware RAG/memory           |
| P4    | Distribution          | Clean install and security/performance gates |

# 1. Document control and product summary

Product: Makoto Misaki (Misaki). Version: 1.0. Status: proposed requirements, not implemented. Primary platform: Windows 10/11. Product type: local-first desktop AI companion. Parent system: LocalMind. Working tagline: A companion with presence, powered by your own AI runtime. Owner: Priyadharshan.

Vision: a persistent, expressive Live2D character who responds to text and (later) voice, supports research and coding through LocalMind, and respects privacy and user control. Misaki is not the LLM itself: visual identity, personality, orchestration, memory, model execution and platform integration are distinct.

Document purpose: provide testable product requirements, architecture decisions, development phases, reference interfaces, validation gates and release criteria.

Source alignment: LocalMind PRD v3.0 prioritizes local inference, understanding through experiments, RAG before memory and agents, privacy-first routing, replaceable models, and delayed UI. This Misaki subproject may prototype UI independently but must not destabilize LocalMind RAG.

# 2. Users, jobs and product principles

Primary user: the project creator, developing locally on a Windows machine and frequently working in coding and productivity apps. Secondary users (future): hobbyists wanting an opt-in local companion.

Core jobs: (1) invoke LocalMind without switching apps, (2) receive useful answers in a readable popover, (3) see understandable busy/listening/speaking feedback, (4) interact with a recognizable consistent personality, (5) minimize or silence the companion instantly, (6) understand when data stays local or is routed externally.

Principles: exploration before abstraction; offline-capable core; explicit permission for data access; no unsolicited screen capture; user can stop audio, move window, hide avatar, disable always-on-top, and quit; graceful degradation when Ollama or audio services are unavailable; accessibility through text-only mode and keyboard control; model-agnostic identity.

# 3. Scope and releases

Prototype P0: transparent draggable app window with a licensed Live2D sample model, idle animation and a reliable exit/show control.

MVP P1: text input, LocalMind HTTP bridge, reply bubble, states idle/thinking/speaking/error, configurable always-on-top, position persistence, system tray and error handling.

Companion P2: local TTS, amplitude-driven lip-sync, push-to-talk speech recognition, voice enable/disable, multi-expression state controller, interruptions and explicit microphone permission.

Personal P3: configurable persona, preference memory via LocalMind, RAG citations/source display, model selection as provided by LocalMind, privacy indicators, tool confirmation UI.

Release P4: installable signed Windows app if possible, bundled or managed backend startup, upgrades, logs, recovery, resource tuning, licensing review and acceptance testing.

Out of scope for P0/P1: autonomous action, emotion inference from webcam, automatic screen capture, permanent microphone listening, unrestricted shell execution, user impersonation, custom fully rigged character before proof of renderer, multiplayer and mobile support.

# 4. Functional requirements (prioritized)

FR-01 P0: Launches a single visible, borderless, transparent window on Windows. Model appears within 5 seconds after shell ready (target; measure).

FR-02 P0: Character supports pointer drag through a designated handle, while chat controls remain clickable.

FR-03 P0: One licensed Cubism sample loads from local assets; idle loop and blink are perceptible. Missing asset displays a readable fallback, not a blank unclosable window.

FR-04 P1: Open/minimize/hide/show via tray and keyboard; exit always accessible even when click-through mode is enabled.

FR-05 P1: Text input sends exactly one chat request per submit; UI shows busy state, result or actionable failure and supports cancel/timeout.

FR-06 P1: Backend health status distinguishes offline, starting, ready and failed.

FR-07 P1: Settings persist character position, display scale, volume/mute, hotkey and always-on-top choice; restore position safely on monitor changes.

FR-08 P1: State controller is deterministic, guards invalid transitions and never leaves character stuck speaking.

FR-09 P2: TTS playback and avatar mouth motion are synchronized roughly to audio energy; playback interruption reliably stops motion/audio.

FR-10 P2: Push-to-talk microphone capture only when explicitly activated; recording status unmistakably visible; permission revocable.

FR-11 P3: Persona stored as versioned config; traits/prompt separate from memory.

FR-12 P3: RAG answers can show sources and identify when context is insufficient; do not fabricate citations.

FR-13 P3: Sensitive file/screen/tool operations ask for explicit consent and display what data is accessed.

FR-14 P4: Installer, uninstall flow, first-run setup and privacy disclosures work without preexisting developer tooling, if bundled distribution is selected.

# 5. Non-functional requirements and performance budgets

NFR-01 Privacy: no network use except explicitly configured model endpoints and update service; document every outbound connection. Loopback API is not automatically trusted: authenticate IPC or localhost requests before release.

NFR-02 Reliability: recover from missing Python/Ollama/LLM failures without desktop freeze, crashes or trapped window.

NFR-03 Responsiveness: animation target 30 FPS on the reference machine when visible; cap work or suspend rendering when hidden. Measure idle CPU/RAM/GPU before committing numeric production budgets.

NFR-04 Accessibility: all essential functions accessible without clicking the character; visible subtitles and mute; reduced-motion option.

NFR-05 Security: no arbitrary tool actions based solely on model text; no credentials in frontend; validate structured events; redact personal data from logs.

NFR-06 Observability: timestamped local application logs, per-stage latency (inference, retrieval, TTS, rendering), optional diagnostic export.

NFR-07 Maintainability: TypeScript strict typechecking, separate desktop/renderer/controller/API packages, Python tests, typed API schemas, reproducible builds and pinned dependencies.

NFR-08 Portability: Windows is supported first; macOS/Linux are research targets because transparency/tray/hotkeys vary by platform.

# 6. Experience specification and interaction details

Idle: breathing and blinking, no distracting automatic dialogue. Listening: attentive expression only when typing/holding push-to-talk. Thinking: subtle head tilt or icon while request pending. Speaking: lip sync during actual audio playback, otherwise a text-reply state with neutral idle. Happy/confused: sparse momentary overlays based on explicit semantic event mapping, not random hallucinated emotions. Error: distinguish backend unavailable, network timeout, failed audio and permission denied.

Window anatomy: avatar canvas; small hot-zone for dragging; show/hide chat bubble; optional input text field; settings via tray; unobtrusive microphone button; clear close/hide affordance.

Window defaults: 360 x 540 logical pixels, with user scale adjustable. Click-through is off initially; enabling requires visible recovery via tray/hotkey. Do not capture focus unexpectedly when the user is typing in another app.

Onboarding: ask whether to enable microphone (default no), choose voice/output device, select local model endpoint, and test backend health; no requirement to collect accounts.

Character content: design Makoto Misaki's visual brief, expressions, motion sheet, voice personality and name/pronunciation separately from software features. Establish asset rights before shipping.

# 7. Architecture and component ownership

Tauri 2 host: native window management, tray, hotkey, persistence hooks, OS integration, optional sidecar process supervision.

React/TypeScript UI: chat bubble, settings, permissions, subtitles, state display.

Cubism adapter: official SDK lifecycle, model asset loading, render loop, textures, motion groups, expression mapping, teardown and GPU recovery. Never expose raw model internals to the LLM.

Companion controller: finite state machine, input event routing, command queue, animation priority, audio sync and interruption.

LocalMind API client: health, chat, cancellation, streaming later; request IDs; transport errors; version negotiation.

LocalMind Python service: model integration via Ollama, RAG retrieval, persona/context, future MAG/CAG and privacy classification.

Audio module: TTS provider adapter, playback events and amplitude envelope; optional STT capture.

Settings and local data: config, consent decisions, logs and cached assets using appropriate platform data directories.

Trust boundaries: frontend->local service (authenticated), local service->Ollama, optional service->cloud (opt-in), tools->host OS (explicit approval).

# 8. Architecture data and event contracts

Use versioned JSON over loopback HTTP for the MVP. Suggested endpoints: GET /v1/health; POST /v1/chat; POST /v1/chat/{request_id}/cancel. Support an origin allowlist, short-lived session auth or local IPC; binding to 127.0.0.1 alone is not sufficient in a packaged app.

Request example: {"request_id":"uuid","message":"Explain this error","conversation_id":"uuid-or-null","mode":"local"}.

Response example: {"request_id":"uuid","reply":"...","citations":\[\],"model":"qwen...","route":"local","status":"ok"}. This is a target schema, not a claim about currently implemented LocalMind endpoints.

Later event stream: request.started, retrieval.started, inference.token, response.completed, tts.started, audio.level, audio.completed, error. Keep events separate from emotion hints.

Avatar commands: setState(id), playMotion(group,priority), setExpression(id), setMouthOpen(normalized_0_to_1), resetToIdle(). The concrete adapter must translate these into model-specific Cubism parameter IDs and respect missing parameters.

# 9. Character pipeline and asset deliverables

Design: establish licensed character art; layered PSD for head/body/hair/eyes/mouth and accessories; determine costume and silhouette; prepare export dimension targets based on quality/performance experiments.

Rigging: in Cubism Editor create deformation hierarchy, face angles, eye blinks, eye gaze, mouth open/smile, breathing and body sways; optional physics for hair/clothing.

Exports: .model3.json manifest, .moc3, textures, .motion3.json files, expressions (.exp3.json), physics and user data as required by the model. File naming and exports must match SDK requirements.

Motion manifest: Idle, Think, ReactHappy, ReactConfused, TalkGesture; model-specific fallback for absent motions.

Validation: neutral pose looks correct, no mesh gaps at extreme movement, texture transparency works, expressions don't conflict, texture size and memory are measured.

Licensing: official SDK proprietary Core is not simply an MIT dependency; verify editor, Core, samples and custom illustration redistribution/use before publishing.

# 10. Complete implementation sequence

Step 0 — Environment: Windows 10/11, current supported Node LTS, Rust stable, Visual Studio C++ Build Tools, WebView2 runtime, Python 3.11+ and Git; verify tool versions and machine baseline.

Step 1 — Tauri scaffold: npm create tauri-app@latest misaki; choose React/TypeScript; run npm install and npm run tauri dev; commit known-good shell.

Step 2 — Desktop behavior: configure decorations=false, transparent=true, alwaysOnTop as user setting, initial width/height, background transparency, window drag, tray show/quit, hotkey recovery. Grant only required Tauri v2 capabilities. Test DPI/monitor changes.

Step 3 — Web Cubism: obtain current official Cubism SDK and samples; build sample separately; integrate SDK Core and framework per current documentation; load licensed model via local assets; render WebGL canvas with alpha, resize and cleanup. Record load time/fps/RAM.

Step 4 — Renderer API: expose setState, setExpression, playMotion, setMouthOpen; create default/fallback mapping to model IDs. Implement animation frame lifecycle and pause when invisible.

Step 5 — Controller: create finite state graph and priorities. Mouse/keyboard events should not directly call SDK motions; route through controller. Unit-test transitions and interruptions.

Step 6 — Backend bridge: add GET /v1/health and POST /v1/chat to LocalMind FastAPI adapter, initially returning a fake response. Integrate with UI and verify offline/error states. Connect actual Ollama chat only after fake bridge works; never break RAG experiment path.

Step 7 — Chat UX: implement input, reply bubble, timestamp, cancel button, keyboard shortcuts, markdown sanitization and optional citations; preserve basic history locally only if enabled.

Step 8 — Audio: add a local TTS proof, audio output selection and stop/pause; use Web Audio analyser for mouth level, smooth amplitude and reset on completion; test muted output and long utterances.

Step 9 — Speech: add push-to-talk STT behind explicit mic permission; implement device loss/timeouts/no-speech handling; keep hot mic off by default.

Step 10 — Persona and future memory: versioned persona YAML/JSON; route memory and RAG through LocalMind core, not frontend; test unanswerable RAG queries.

Step 11 — Security/privacy: threat-model local HTTP, cloud routing and tools; add auth/IPC, content limits, sanitization, consent prompts, audit logs and data delete/export.

Step 12 — Distribution: determine how Ollama and model weights are installed, managed or detected; evaluate Python sidecar with Tauri externalBin and packaging; supervise process and shutdown; build installer, test clean Windows VM, document prerequisites, check licensing.

Step 13 — Release validation: complete acceptance matrix, performance test, regression suite, accessibility and privacy review. Ship v1.0 only when every required acceptance gate passes.

# 11. Recommended repository layout

localmind/

backend/ # Python FastAPI adapter and existing RAG code

misaki/

src/

app/ # App shell, routing and UI state

ui/ # Chat, settings and consent components

live2d/ # SDK adapter, model loader, motion mappings

companion/ # State machine and event orchestration

audio/ # TTS, playback level, future STT

api/ # Typed LocalMind transport

assets/models/ # Licensed source-independent sample model

config/ # Versioned persona and defaults

src-tauri/ # Rust host, capabilities, tray, packaging

tests/ # Unit, integration and UI smoke tests

docs/

decisions/ # ADRs and experiment outcomes

experiments/ # Latency, FPS and RAM benchmarks

Avoid introducing an abstract model-provider framework before two concrete providers exist, in line with LocalMind's PRD.

# 12. Minimal code and configuration references

Tauri window configuration (fragment under app.windows): {"label":"main","title":"Makoto Misaki","width":360,"height":540,"decorations":false,"transparent":true,"resizable":false,"alwaysOnTop":true,"skipTaskbar":true}. For Tauri v2, configure capabilities separately and implement tray/hotkey recovery.

FastAPI proof: from fastapi import FastAPI; from pydantic import BaseModel; app=FastAPI(); class ChatIn(BaseModel): message:str; @app.get('/v1/health') ...; @app.post('/v1/chat') ... . Implement real code from official docs, enforce input length and origin/auth before release.

Typed reply (illustrative): type ChatReply={request_id:string;reply:string;status:'ok'|'error';citations:Array&lt;{title:string;uri?:string}&gt;;route:'local'|'cloud'}.

State machine (illustrative): idle->listening->thinking->speaking->idle; error->idle; interrupt->idle. No animation request can bypass the controller.

TTS lip-sync formula for prototype: mouth = clamp(smoothedRMS \* gain, 0, 1), update via requestAnimationFrame while audio plays; reset mouth=0 on pause/end/error.

Use exact currently supported SDK APIs and Tauri plugin versions; these snippets are contracts/pseudocode, not copy-paste turnkey integration.

# 13. Testing plan and acceptance matrix

T01 Launch: open with backend off; avatar loads, failure visible for chat, exit accessible; PASS when no hang.

T02 Transparency: open above VS Code and desktop wallpaper; no opaque white rectangle; PASS across two monitor DPI settings.

T03 Input: type a question, submit once; exactly one request ID observed and answer shown.

T04 Offline: stop Ollama/LocalMind; UI shows retry action, returns to idle, no crash.

T05 Hide and click-through: enable pass-through, recover via tray/hotkey, quit reliably.

T06 Live2D fallback: remove a motion asset; display safe fallback rather than crash.

T07 Voice interrupt: start long TTS, stop mid-sentence; audio and mouth stop within a perceptible interaction cycle.

T08 Microphone: verify no recording occurs before push-to-talk; show recording indicator and revoke permission.

T09 Privacy: ask question containing private file data; cloud route blocked unless explicitly permitted and clearly disclosed.

T10 Prompt injection: malicious retrieved chunk cannot authorize shell command or exfiltration.

T11 Performance: collect idle CPU, working-set RAM, GPU, FPS, first-render time and inference latency on reference PC; compare to measured baseline targets.

T12 Install: clean Windows setup without developer environment; installer launches, detects missing dependencies, exits cleanly and uninstalls.

T13 Accessibility: keyboard-only controls, visible subtitles, mute, reduced motion and readable focus.

T14 Memory: saved preferences can be reviewed/deleted and do not leak into fixed identity prompt.

T15 Crash recovery: backend dies while speaking; animation resets and actionable error displayed.

# 14. Risks, dependencies and mitigations

SDK licensing and redistributable assets: review licenses before importing model binaries; keep ownership and attribution register.

Transparent window anomalies: WebView2, DPI scaling and always-on-top can behave unexpectedly; validate early on target hardware.

Click-through lockout: enforce tray/hotkey recovery and disable pass-through by default.

Performance contention: WebGL avatar, Ollama inference, TTS may compete for GPU and memory; profile each system separately and together.

Local API exposure: loopback access alone does not isolate from every local process or malicious web page; use authentication, origin checks and preferably native IPC where practical.

Backend packaging: bundling Python, Ollama and model weights can produce a very large distribution; decide between managed dependencies and optional bundled components based on installer tests.

LLM hallucinations: keep state semantics deterministic, prevent model-generated tool commands from executing automatically, cite RAG source documents when shown.

Scope creep: freeze P0/P1 milestone acceptance; do not require agents, memories or cloud before MVP.

# 15. Metrics and definition of done

Engineering metrics: first model render (ms), active/idle FPS, CPU/RAM/GPU at idle, API p50/p95 latency, TTS generation and startup time, crash-free sessions, offline recovery rate and installer success rate. Record environment specifications in each benchmark.

UX metrics: time to first answer, missed clicks, recovery from hidden/pass-through mode, successful microphone interrupt, perceived distraction in a typical coding session.

P0 done when desktop character loads, animates, can move, can be hidden and can quit safely.

P1 done when chat works with an actual local model, states are stable and offline failures are recoverable.

P2 done when local voice is opt-in and interruptible, sync is convincing, and microphone is never silently active.

P3 done when identity and data boundaries are explicit and retrieval/memory integrate without duplicating LocalMind.

P4 done when clean-install, performance, privacy, security, license and accessibility acceptance suites pass.

For every brick: record concept, experiment, observation, limits, measured results and reason for integration.

# 16. Suggested first ten development sessions

Session 1: initialize repository, toolchains, ADR-001 on host architecture; run Tauri sample.

Session 2: make transparent undecorated window with tray quit and move.

Session 3: build official Cubism sample outside Tauri and validate licensed sample.

Session 4: integrate sample in Tauri and record first-render and FPS.

Session 5: implement idle/motion/expression adapter with fallback.

Session 6: build controller and event/state tests.

Session 7: create stub FastAPI health/chat contract and UI text input.

Session 8: connect LocalMind/Ollama and implement timeouts/errors.

Session 9: add chat bubble, settings, persist position, monitor fallback.

Session 10: execute P1 acceptance tests, record measurements, produce a milestone demo and write lessons learned.

Only then schedule audio and persona work.

# 17. Research references and current verification

Live2D SDK Web download: <https://www.live2d.com/en/sdk/download/web/> (Cubism 5 SDK for Web R5 update listed 2026-04-02).

Live2D SDK Web manual: <https://docs.live2d.com/en/cubism-sdk-manual/cubism-sdk-for-web/>

Official samples: <https://github.com/Live2D/CubismWebSamples>

MotionSync plugin: <https://docs.live2d.com/en/cubism-sdk-manual/cubism-sdk-motionsync-plugin-for-web/>

Tauri v2 window customization: <https://v2.tauri.app/learn/window-customization/>

Tauri v2 sidecar guidance: <https://v2.tauri.app/develop/sidecar/>

React: <https://react.dev/> ; FastAPI: <https://fastapi.tiangolo.com/> ; Ollama: <https://docs.ollama.com/>

Treat these as references; verify latest APIs, security advisories and individual licenses at implementation time.