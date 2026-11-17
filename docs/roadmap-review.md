# Roadmap review — 17 November 2026

Reviewed the supplied `waifu-ai-development-roadmap.md` against the existing
Electron/React/Python implementation before extending it. Phases 1 and 2 were
completed first. On 17 November the user requested the remaining work, with an
explicit distinction between already complete, partial and new capabilities.

## Remaining-work audit and implementation

| Requirement | Status before this change | Result now |
| --- | --- | --- |
| mpv installation, named-pipe IPC, directory scanner, search, playback controls, left playlist | Complete | Preserved and regression-tested. `search_music` added as a registry alias. |
| Artist, album and available cover art | Partial: filenames only | Current-track metadata and bounded embedded PNG/JPEG artwork, cached locally; independent of model inference. |
| Audio format testing | Partial: WAV tested | Real mpv playback tested with generated WAV, FLAC and MP3, plus MP3 tags/art. |
| Screen/display/window selection, one-shot preview, cloud/local vision, stop sharing | Complete | Preserved. A `take_screenshot` tool opens the existing selection/preview flow; it never silently uploads. |
| Shared-window focus | Complete | Preserved, with expiring/revocable window grants. |
| Approved-folder filename search and file information | New | Bounded recursive name search and metadata tools; canonical paths checked against grants, with junction/traversal rejection. |
| Existing file/folder opening | Partial: path validation, no folder grants | Preserved with picker access and approved-root enforcement for supplied paths. No file contents are uploaded. |
| Application launch and close | New | Picker-approved executable IDs, no generated arguments; graceful close of an explicitly shared window after native confirmation, never force-kill. |
| Mouse, keyboard and scrolling | New | Validated single actions in shared Notepad/Calculator/Paint windows, with native previews, focus/occlusion guards and revocation checks. Literal typing is limited to Notepad. |
| System and active-window information | New | Separate permission, bounded OS/memory/CPU and active title/app results; no network/user identity inventory. |
| Common registry and native tool calling | Partial: JSON action proposals | Shared `config/tools.json`, Gemini function declarations, Grok Responses functions and Ollama tools when advertised. Models without native tools retain validated JSON proposals. |
| Execution results returned to AI | Partial: results added to chat history | Explicit Send results to Misaki continues the native tool turn, preserving provider signatures/call IDs; maximum four rounds, ten-minute expiry, single-use tokens and conversation/provider binding. |
| Task/avatar coordination | Complete | Existing executing/success/error reactions now cover new native tools as well. |
| Desktop permissions and grants | Partial: screen picker and media folder | Persistent independent toggles for files, media, screen, applications, input and system; folder/app selection and revocation in Preferences. |
| Model selection and hybrid inference | Complete | Preserved local, Gemini and Grok routing; local inference and idle animation remain usable offline. |
| Generation/fallback settings | New | Response variety and output limit; opt-in offer to switch to the selected local model on cloud failure. No silent cloud escalation or automatic replay of tools/images. |
| Resource/lifecycle handling | Partial | Bounded file scans, metadata cache, hidden-window pauses, capped agent turns, isolated profile tests, supervised packaged helpers and shutdown checks. |
| Desktop release preparation | New | Repeatable portable Windows build with Electron, Python bridge and mpv. Fresh/warm packaged startup verified. No development toolchain is needed to run it. |

All six roadmap phases now have implementations within their stated controlled
scope. This is an **unsigned local preview**, not a public signed installer.
Signing, publication, automatic updates and redistribution permission for the
supplied avatar remain owner-controlled release steps, not claimed as completed.
Live Gemini/Grok tool accuracy remains an account-level acceptance check; tests
use mock provider responses and do not spend user API credits.

## Previously completed avatar and idle behavior

| Roadmap area | Finding and result |
| --- | --- |
| Persona and stage directions | The persona already loads for every provider. New response processing separates dialogue from behavior, translates recognized directions, validates metadata and preserves quoted/code examples. |
| Structured avatar output | Added message/emotion/expression/motion/intensity, retaining the old reply field. Gemini gets a bounded JSON schema. Old/plain model responses remain usable. |
| Actual model capabilities | Inspected Changli's model, display-info parameters and seven expression files. There are no authored motion clips. Supported gestures use the verified head, eye, mouth and body rig; no wave or arm-crossing animation is advertised. |
| Expression mapping | Blush, heart eyes and anger use supplied expression IDs. Smile, sadness, surprise, thinking, relief and sleepy eyes use bounded existing facial parameters. Outfit and eye-cover remain manual. |
| Autonomous idle animation | Independent weighted controller, randomized intervals, repeat avoidance, per-gesture cooldowns and seven presence states. Ambient animation works offline. |
| Optional conversation starters | Selected-model generation with persona/history, opt-in settings, random delay, cooldown, interruption/cancellation checks and one attempt per quiet stretch. No fixed dialogue bank. |
| Behavior settings | Random gestures, sleepy behavior, starter enablement, starter frequency/cooldown, sleepy delay and intensity persist. Existing reduced motion remains authoritative. |
| Desktop-task reactions | Existing UI-approved tasks emit cosmetic lifecycle events; executing/success/error affect the avatar and suppress idle requests. Tool execution permissions are unchanged. |
| Media playback | Selected-folder indexing, mpv JSON IPC, playback controls, metadata/artwork and the translucent playlist are implemented. |
| Desktop awareness | Already implemented: explicit screen/window selection, preview, one-shot vision attachments, revocation and scoped window focusing. No continuous capture. |
| Broader automation/files/release | Implemented in the follow-up work audited above; see the [portable release guide](desktop-release.md). |

## Contract and capability details

`backend/response_processor.py` owns cosmetic parsing/schema construction. The
existing desktop action validator still owns tool validation. Cosmetic strings
never become shell commands or arbitrary Live2D parameter IDs. Idle requests
cannot enable desktop tools or attach screen images/desktop context, and actions
are removed on both backend and frontend.

The supplied model's expression assets are `爱心眼` (heart eyes), `脸红` (blush),
`生气` (anger), `白眼` (white eyes), `黑脸` (dark face), `眼罩` (eye cover), and
`外套穿脱` (coat toggle). All seven manual controls are preserved. The logical
output labels `smile`, `sad`, `surprised`, `thinking`, `relaxed`, and `sleepy`
are renderer presets, not invented `.exp3.json` filenames. Similarly, nod,
head shake, look-around, yawn, laugh and thinking are procedural motions using
existing rig parameters, not claims that motion files were supplied.

Gemini's REST adapter uses `generationConfig.responseMimeType` and
`responseJsonSchema` on the existing `generateContent` endpoint; see the
[official GenerationConfig reference](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig)
and [structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output).
Native tool turns omit the response schema until a final dialogue response, keeping
compatibility with models that cannot combine tools and schema output. No provider
migration, extra emotion-classification call or silent cloud fallback was introduced.
Live cloud generation was not used for validation; provider
tests inspect requests and return clearly isolated fixtures.

See [avatar behavior](avatar-behavior.md) for controls, timing, pause semantics
and the limits of model-generated reactions. Backend/unit checks cover metadata,
stage directions, schemas, permission separation, timing and settings migration;
browser checks exercise the real model, requested gestures, persisted controls,
idle delivery, cancellation, music, visibility and provider changes. Electron
checks also exercise startup and the existing tool flows with an isolated profile.

Provider integration follows the official [Gemini function calling reference](https://ai.google.dev/gemini-api/docs/generate-content/function-calling),
[Ollama tool calling reference](https://docs.ollama.com/capabilities/tool-calling)
and [Grok function calling reference](https://docs.x.ai/developers/tools/function-calling).
Windows input uses fixed native calls, not model-generated PowerShell; see
[Microsoft's SendInput reference](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput).
