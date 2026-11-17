# Misaki portable Windows build

Open `Misaki.exe` from the extracted folder. Keep the `resources`, locales and
runtime files beside it. Node, npm and Python are bundled; development tools are
not required. Ollama remains an optional separate installation for local models.
The build includes the existing portable mpv player and Live2D assets.

Keys can be entered in Connection, or stored in `%APPDATA%/Misaki/.env` using
`GEMINI_API_KEY=...` and `GROK_API_KEY=...`. Keys are read by the bridge, never
bundled in the UI. The development checkout's `.env` is never packaged.

Use Preferences → Desktop permissions to approve folders and applications.
File search returns names and metadata, not file contents. Mouse/keyboard tools
are scoped to a freshly shared Notepad, Calculator or Paint window; typing is
supported in Notepad. Each input/close operation asks for confirmation. Closing
is graceful and may leave the application's save prompt open. No forced kill,
arbitrary command, file deletion/move/overwrite or unattended capture is provided.

For a tool request, approve the displayed action(s), then select **Send results
to Misaki**. The model can use actual results for its next reply or propose the
next step. At most four tool rounds are allowed. Expired turns must be requested
again. Screen snapshots always require selection and preview before a new send.

This is an unsigned local preview build. Publishing a signed installer, automatic
updates, and redistribution of the supplied model require the owner's release
credentials and asset-license review. No upload or publication is performed.

## Rebuilding

From the checkout, install dependencies, create `.venv` with
`backend/requirements.txt`, and install `PyInstaller==6.22.3` in that environment.
Run `npm run setup:media` once, then `npm run package:desktop`. Each run creates a
new versioned folder under `release/`; it never deletes a previous build.

## Acceptance checks

Test first launch and relaunch, offline chat with installed Ollama, cloud
connection, cancellation, player controls, approved-folder boundaries, denied
input permissions, and closure of bundled helper processes. Automated tests use
isolated profiles and mocked cloud replies; a valid API key is needed for a real
cloud acceptance run. Do not copy your profile or `.env` into a distributable.
