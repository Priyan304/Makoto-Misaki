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
| `play_music` | Local absolute audio path, or empty | Audio picker when empty, then default music player |
| `reveal_file` | Existing absolute file path, or empty | Reveal the selected file in Explorer |
| `open_website` | HTTP/HTTPS URL | Default browser |

The user approves the displayed target with its Open, Play or Show in Explorer button in chat; there is no second native confirmation. Empty paths use a Choose file/folder/music button and native picker. The picker is brought forward with its owner and temporarily releases the owner's always-on-top setting so it remains reachable. Cancelled and failed cards retain a Try again button; successful actions cannot accidentally replay from the same card. The main process revalidates the action, resolves symlinks, checks the actual file type and existence, rejects network/device/alternate-stream paths, and rejects scripts/executables for opening. No command interpreter or arbitrary process spawning is exposed. Only one native action can run at a time. Windows' default application determines actual playback; no fake audio is played and there are no pause/skip controls in this version.

Success, cancellation and errors appear in chat and are part of the selected provider's next-turn context. Success means the OS accepted the open request, not that another application's document finished loading. Proposals are in memory separately from persisted messages; reload cannot replay them. File contents are never read or sent to models. Paths the user types, action-result labels and any opted-in chat history follow the existing provider/history rules.

Changes to Electron's native action code require closing the desktop window completely and running `npm run desktop` again. Running that command while the old window is still open only focuses the existing process.

## Native boundary

The renderer uses a sandbox with context isolation, no Node integration, no webviews, no general IPC access and no session secret. Preload exports only backend requests, validated actions and always-on-top. Every main handler verifies the sending WebContents, main frame and exact UI origin. The backend proxy accepts only the existing health/provider/chat/cancel routes and bounded request bodies, sends the session token over fixed loopback HTTP, and refuses redirects. External navigation cannot replace the desktop page; supported user-clicked links open in the system browser. Permission requests are denied. A same-origin CSP permits the local Live2D WebAssembly runtime and Vite development refresh, with no JS eval, object embedding or frames. This follows Electron's [security guidance](https://www.electronjs.org/docs/latest/tutorial/security) and [context-isolated preload pattern](https://www.electronjs.org/docs/latest/tutorial/context-isolation).

## Validation

`npm run test:desktop` tests action validation with temporary fixtures, then opens a real Electron window with the real avatar. The integration test exercises sandboxed preload, authenticated scoped IPC, cancellation, audio selection, all three provider routes, action results in subsequent context and rejection of another window. Native dialogs and shell launches are stubbed so tests do not open personal files, launch a player or consume API credit. Backend tests separately check action parsing through Local, Gemini and Grok. Live cloud inference quality and a particular Windows music-player association are not established by these mocked tests.

The Electron test uses an actual loopback HTTP fixture server, without replacing the main process's fetch function. It covers Gemini/Grok key configuration, rejected-key details, malformed bridge responses, bridge shutdown and successful key reconnection after restart. Desktop connection errors name `npm run desktop`; unauthenticated/expired sessions and non-JSON responses retain actionable diagnostics. Provider responses and keys in this test are fixtures, not live cloud credentials.

The action regression also confirms no execution before the chat button is clicked, no second confirmation, retrying the same card after picker cancellation, and retrying a default-application failure without another model request. An optional `MISAKI_TEST_REAL_OPEN=1 npm run test:desktop` check restores the real Electron shell opener for one chat-approved action on the project folder. On 2 November 2026, Windows accepted opening `C:\learn\Misaki` through this path. Music playback and cloud inference remain mocked in this test.

A separate live `qwen3:4b` check on 2 November 2026 asked “Open my Downloads folder.” through the real backend composition and installed Ollama. It returned the validated `open_folder` / `downloads` proposal in 52.2 seconds; no OS action was executed. This verifies one real local generation, not a latency guarantee.


## Startup rendering and recovery

Desktop startup runs the TypeScript check and production Vite build before opening Electron. `scripts/desktop-ui.mjs` serves the resulting assets with explicit MIME types and no stale browser cache. Its scoped, authenticated API proxy retains browser access to the same running bridge. Files outside the built directory, including symlink traversal, are rejected. Browser development still uses Vite, with dependency caches separated by UI port.

The initial HTML contains a styled loading screen that does not depend on React. A plain local startup script shows an error code and Reload interface on entry-script failure, rejected initialization or a startup timeout. A React error boundary provides recovery for render failures, without clearing settings or history. The native process receives a validated renderer-ready signal after the interface mounts; HTML load alone is no longer treated as proof of successful rendering. A replaced initial navigation (`ERR_ABORTED`, including an early reload) does not shut down the bridge. Renderer-process crashes offer native reload recovery.

Validation: twelve browser tests pass, including injected entry-script and React-render failures followed by successful reload. The real Electron acceptance test now uses the same built UI server as desktop startup, checks the actual avatar, and repeats launch with the same profile to cover warm startup. Provider calls and OS actions in that suite remain fixtures unless the optional real-open flag is set. Six unit tests, 25 backend tests and the strengthened launcher check also pass.
