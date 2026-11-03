# Third-party components

This personal prototype includes the user-supplied Changli model, Live2D Core, an original code-drawn SVG fallback character and an app mark.

## Supplied Changli avatar and renderer

- Model source: the user's `长离带水印` folder, copied into `public/models/changli/`. The model binary, four original texture sheets, physics, display information, expression files and icon are preserved. The watermark remains part of the rendered model. No model license or author attribution file was supplied; these assets are not asserted to be open-source or cleared for redistribution.
- Live2D Cubism Core: downloaded on 30 October 2026 from https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js and stored in `public/vendor/`. Its copyright/license header is retained. Governing terms: https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html. The app loads this local copy without contacting a runtime CDN.
- PixiJS and `@pixi/unsafe-eval` 6.5.10: MIT, https://github.com/pixijs/pixijs. The latter installs Pixi's shader implementation for environments that disallow JavaScript eval.
- `pixi-live2d-display` 0.4.0: MIT, https://github.com/guansss/pixi-live2d-display. Its unused publishing dependency `gh-pages` is overridden to a patched 6.x release.

Installer bundling remains disabled. Review the supplied model's permissions and the applicable Cubism terms before distributing this project.

Dependencies retain their upstream licenses, available with their installed packages and repositories. Review the complete npm/Python/Cargo dependency inventories before distribution.

- React: https://github.com/facebook/react
- Vite: https://github.com/vitejs/vite
- Tauri: https://github.com/tauri-apps/tauri
- Electron 45.2.1: MIT, https://github.com/electron/electron. Its bundled Chromium/Node dependencies retain their license notices in `node_modules/electron/dist/LICENSES.chromium.html` and `LICENSE`.
- FastAPI: https://github.com/fastapi/fastapi
- HTTPX: https://github.com/encode/httpx
- Ollama (installed separately): https://github.com/ollama/ollama
- Qwen 3 model weights (downloaded separately; Apache 2.0): https://github.com/QwenLM/Qwen3

## Lucide icons

ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

## Optional portable mpv runtime

`npm run setup:media` downloads a pinned first-party mpv CI build from [mpv-player/mpv](https://github.com/mpv-player/mpv/releases/tag/git-release) into the ignored `.cache/mpv` directory and verifies its published SHA-256. Archive identity and hash are recorded in `provenance.json` there. This runtime is not embedded in the frontend or installer. mpv and its bundled FFmpeg/other components retain their upstream licenses; see [mpv copyright and licensing](https://github.com/mpv-player/mpv/blob/master/Copyright) and the corresponding build/source notices.
