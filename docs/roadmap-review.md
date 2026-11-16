# Roadmap review — 16 November 2026

Reviewed the supplied `waifu-ai-development-roadmap.md` against the current
Electron/React/Python implementation. The user selected **avatar and idle
behavior first**; this change implements phases 1 and 2. The later automation,
file search, tool-calling and release work is not represented as complete.

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
| Media playback | Already implemented: selected-folder indexing, mpv JSON IPC, playback controls and the translucent playlist. Album art/artist metadata and provider-native function calling remain later work. |
| Desktop awareness | Already implemented: explicit screen/window selection, preview, one-shot vision attachments, revocation and scoped window focusing. No continuous capture. |
| Broader automation/files/release | Application launch/close, controlled mouse/keyboard interaction, approved-directory document search, generalized tool calling and packaging remain outside this selected change. |

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
No provider migration, extra emotion-classification call or silent cloud fallback
was introduced. Live cloud generation was not used for validation; provider
tests inspect requests and return clearly isolated fixtures.

See [avatar behavior](avatar-behavior.md) for controls, timing, pause semantics
and the limits of model-generated reactions. Backend/unit checks cover metadata,
stage directions, schemas, permission separation, timing and settings migration;
browser checks exercise the real model, requested gestures, persisted controls,
idle delivery, cancellation, music, visibility and provider changes. Electron
checks also exercise startup and the existing tool flows with an isolated profile.
