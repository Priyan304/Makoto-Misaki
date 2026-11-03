# Electron desktop actions

Run `npm run desktop`. If that desktop profile is already running, the launcher brings its window forward and exits successfully, retaining the existing bridge, provider keys and conversation. Otherwise it builds the interface, creates a session secret, starts the authenticated Python bridge and a static loopback UI server, waits for that server, then launches Electron 45. A browser-only session or another service occupying ports 1420/8765 still produces a port conflict; stop that session before starting a new desktop. Closing the window or launcher stops the owned servers. Electron watches the launcher's PID rather than stdin: Windows GUI processes can receive immediate stdin EOF while their launcher is still alive. Python and the UI servers retain their stdin EOF cleanup. Browser development remains `npm run dev`. Installation downloads Electron via the npm postinstall script; if Windows certificate validation requires the system store, use `NODE_USE_SYSTEM_CA=1` rather than disabling verification.

The desktop is a source-run development application. Python and backend requirements are still needed; it does not include an installer, packaged sidecar or automatic updates. Legacy Tauri files remain available but are not called by the Electron launcher.

`MISAKI_UI_PORT` and `MISAKI_BRIDGE_PORT` can select distinct non-privileged loopback ports. The launcher suite uses isolated 11420/18765 ports so it can test Electron startup and abrupt parent shutdown without stopping an existing user session on the defaults.

The launcher regression waits for the rendered interface to report ready, validates the built script delivery and HTTP boundary, and verifies the window remains alive for five more seconds, launches the same profile again and confirms it reuses the original desktop and healthy bridge. It then terminates the original launcher and verifies both servers and the Electron PID exit. This catches the former immediate Windows shutdown that a short port-only check missed. Optional `MISAKI_DESKTOP_TRACE=1` writes credential-free lifecycle events to `.cache/desktop-startup-<launcher-pid>.log`. `--user-data-dir=<path>` can isolate a test profile without touching the user's normal settings.

The Electron GUI is spawned with `windowsHide: false`; console helpers and the headless focus probe remain hidden. Node's Windows launcher implements the hide option with `SW_HIDE`, which can override a GUI application's first `ShowWindow` call. See [libuv's Windows process implementation](https://github.com/libuv/libuv/blob/v1.x/src/win/process.c) and [Microsoft's ShowWindow documentation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-showwindow). The window now starts visible with the loading background and is explicitly shown, focused and invalidated when React reports ready. Windows launcher tests additionally check a nonzero native main-window handle; DOM readiness and captured offscreen pixels alone do not establish that a user can see the window.

## Actions and model contract

All three existing providers use the same bounded response contract when chat includes `desktop: true`: `{reply, actions}`. The backend appends the desktop instructions to the persona, validates at most three actions with Pydantic and exposes only approved action types. Plain replies remain usable if a model ignores the contract; malformed JSON produces a retry message without executable proposals. A browser conversation does not enable the contract. The backend never executes OS actions.

| Type | Target | Native behavior |
| --- | --- | --- |
| `open_file` | Local absolute document/media path, or empty | Open the file with its default application; empty opens a picker |
| `open_folder` | Absolute folder path, home/desktop/documents/downloads/music/pictures/videos, or empty | Explorer/default folder application, or a folder picker |
| `play_media` / `play_music` | Local absolute audio path, unique song query, or empty | Controlled mpv playback; empty opens an audio picker |
| `pause_media`, `resume_media`, `stop_media` | Empty | Change Misaki player state |
| `next_track`, `previous_track` | Empty | Move within the current queue |
| `set_volume` | Integer string 0–100 | Change Misaki player volume |
| `get_playback_status` | Empty | Report real player state, title, position and volume |
| `search_media` | Song-name query | Return matches from the chosen music folder |
| `focus_window` | Current window grant token | Focus only a window the user explicitly shared; grants expire after five minutes |
| `reveal_file` | Existing absolute file path, or empty | Reveal the selected file in Explorer |
| `open_website` | HTTP/HTTPS URL | Default browser |

The user approves the displayed target with its Open, Play or Show in Explorer button in chat; there is no second native confirmation. Empty paths use a Choose file/folder/music button and native picker. The picker is brought forward with its owner and temporarily releases the owner's always-on-top setting so it remains reachable. Cancelled and failed cards retain a Try again button; successful actions cannot accidentally replay from the same card. The main process revalidates the action, resolves symlinks, checks the actual file type and existence, rejects network/device/alternate-stream paths, and rejects scripts/executables for opening. No command interpreter or arbitrary process spawning is exposed. Only one native action can run at a time. Music actions route through the Desktop Agent to mpv instead of the shell opener. Opening an audio file explicitly with open_file still uses its associated application.

Success, cancellation and errors appear in chat and are part of the selected provider's next-turn context. Success means the OS accepted the open request, not that another application's document finished loading. Proposals are in memory separately from persisted messages; reload cannot replay them. Audio and document contents are not uploaded by these tools. Paths the user types, opted-in matching music filenames, playback state, action-result labels and any opted-in chat history follow the selected provider/history rules. An explicitly attached screen image is uploaded only for that message.

Changes to Electron's native action code require closing the desktop window completely and running `npm run desktop` again. Running that command while the old window is still open only focuses the existing process.

## Native boundary

The renderer uses a sandbox with context isolation, no Node integration, no webviews, no general IPC access and no session secret. Preload exports only scoped backend requests, validated actions, player status/search/library selection, explicit screen selection/capture/revocation and window settings. The Desktop Agent owns dispatch, serializes mutations, and never exposes raw mpv IPC, OS commands or arbitrary process launch. Every main handler verifies the sending WebContents, main frame and exact UI origin. The backend proxy accepts only the existing health/provider/chat/cancel routes and bounded request bodies (2 MiB for chat images, 64 KiB for other requests), sends the session token over fixed loopback HTTP, and refuses redirects. External navigation cannot replace the desktop page; supported user-clicked links open in the system browser. Permission requests are denied. A same-origin CSP permits the local Live2D WebAssembly runtime and Vite development refresh, with no JS eval, object embedding or frames. This follows Electron's [security guidance](https://www.electronjs.org/docs/latest/tutorial/security) and [context-isolated preload pattern](https://www.electronjs.org/docs/latest/tutorial/context-isolation).

## Music setup and use

The portable player is installed locally in `.cache/mpv` on this computer. A fresh Windows x64 checkout can install the same pinned first-party CI build with:

```powershell
npm run setup:media
npm run desktop
```

The setup script verifies the published SHA-256 before extraction, uses the system TLS trust store, and makes no PATH/default-player changes. It installs no registry entries and does not run mpv's registration scripts. The archive and provenance remain in `.cache/mpv`; the player is not shipped in the application bundle. On another platform, install an appropriate mpv build and set the process environment variable `MISAKI_MPV_PATH` to its absolute executable path. See the [mpv installation page](https://mpv.io/installation/) and [JSON IPC manual](https://mpv.io/manual/stable/#json-ipc).

Open **Desktop tools → Choose music folder**. This explicit choice indexes at most 10,000 entries / 5,000 audio files, skips links outside the root, and remembers the folder in the Electron profile's `desktop-agent.json`. Choose the same folder again to refresh its index. Matching titles and paths can accompany chat while **Use playback state and matching song names in chat** is enabled; switching it off persists across launches. No automatic personal-folder scan happens before a folder has been chosen. Audio contents remain local.

Ask “Play Snowfall”, “Pause the music”, “Next track”, or “Set volume to 30 percent”, then click the proposed action. The model receives fresh playback observations and up to twelve bounded search matches, so it can choose an actual indexed path rather than guessing one. Ambiguous matches require clarification. The panel also offers immediate user-operated controls and **Choose audio** for a file outside the library. Playing a library track queues up to 500 subsequent tracks in filename order; Previous works after moving forward in that queue. Volume affects Misaki's player, not Windows master volume or Spotify/YouTube.

A private randomized named pipe carries allowlisted JSON commands to mpv. Requests have correlated IDs and deadlines; playback is confirmed using mpv events/status, not merely a successful process launch. Decode errors, unavailable tracks, no-next-track and missing-player errors appear in the UI. A stdin supervisor kills the owned player if Electron exits or is terminated, preventing orphan playback. No raw player command, URL, script or playlist input is accepted from a model.

## One-shot screen sharing

Click **Share screen**, choose a screen or application window, and inspect the attachment preview. Nothing is sent to a model until you send a message. The next message sends that image once to the selected provider; subsequent messages and retries contain no image unless you explicitly attach another. Remove the attachment to stop before sending. Switching provider, clearing chat, reloading, or using **Revoke screen and window access** clears current grants. Removing an image after a request was already sent cannot retract it from a provider.

The picker uses Electron [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer) in the main process. Its thumbnails stay local. Capture is user initiated, with no timer, stream, recording or automatic follow-up capture. For a full-screen snapshot, Misaki briefly hides and restores itself to avoid photographing its own picker. Images are bounded JPEGs (maximum 768 KiB), held in memory and never written into app history, exports or logs. Provider-generated descriptions can still enter normal chat history if history is enabled. A minimised/protected/unavailable window can fail capture and asks the user to restore or reselect it.

The authenticated bridge sends Gemini inline image data, Grok Responses image input only for models advertising image support, or Ollama base64 images only after `/api/show` advertises vision. It never silently switches providers. A text-only model returns a clear error. See [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding), [Grok image input](https://docs.x.ai/developers/model-capabilities/images/understanding), and [Ollama chat](https://docs.ollama.com/api/chat).

A selected application window also receives an expiring opaque focus grant. A user-requested `focus_window` proposal is still approved in chat; Electron rechecks the source and native title before a fixed Windows helper restores/focuses it. Misaki then minimizes so its always-on-top window cannot cover the target; Ctrl+Shift+M brings her back. No mouse clicks, typing, arbitrary keyboard shortcuts or unattended desktop loop are implemented in this phase. Text in screenshots, titles and filenames is treated as untrusted data, never authorization for an action.

## Validation

`npm run test:desktop` covers native boundaries and a real Electron window with the actual avatar, built UI server, authenticated preload, provider setup, cloud-error recovery, action retries and warm restart. It also runs a real installed mpv against generated silent WAV fixtures to verify play/pause/resume, next/previous, volume, stop and accurate status. A missing mpv installation skips that one real-player check and leaves the deterministic boundary tests active; install it with setup:media first for full validation.

Screen tests use a repository-image fixture through the real main/preload IPC; no personal screen images or live cloud credits are used. Browser regressions check preview-before-send, removal/revocation, one-shot attachments, no image persistence, provider changes, media controls and awareness opt-out. Backend tests verify image serialization for Gemini, vision Grok and local Ollama, reject text-only models, and enforce image/request bounds. Native focus is exercised with an injected focus adapter; tests do not focus personal applications. These checks do not establish live cloud visual-answer quality.

## Startup rendering and recovery

Desktop startup runs the TypeScript check and production Vite build before opening Electron. `scripts/desktop-ui.mjs` serves the resulting assets with explicit MIME types and no stale browser cache. Its scoped, authenticated API proxy retains browser access to the same running bridge. Files outside the built directory, including symlink traversal, are rejected. Browser development still uses Vite, with dependency caches separated by UI port.

The initial HTML contains a styled loading screen that does not depend on React. A plain local startup script shows an error code and Reload interface on entry-script failure, rejected initialization or a startup timeout. A React error boundary provides recovery for render failures, without clearing settings or history. The native process receives a validated renderer-ready signal after the interface mounts; HTML load alone is no longer treated as proof of successful rendering. A replaced initial navigation (`ERR_ABORTED`, including an early reload) does not shut down the bridge. Renderer-process crashes offer native reload recovery.

Validation: sixteen browser tests pass, including injected entry-script and React-render failures followed by successful reload. The real Electron acceptance test now uses the same built UI server as desktop startup, checks the actual avatar, and repeats launch with the same profile to cover warm startup. Provider calls and OS actions in that suite remain fixtures unless the optional real-open flag is set. The build, six state/storage unit tests, 36 backend tests, eight desktop boundary/media tests and the isolated Electron flow are checked separately.
