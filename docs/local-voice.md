# Local voice: inspection and standalone prototype

Scope: phases 0 and 1 of the supplied local voice plan. The user selected
English and Japanese. Microphone capture, in-app speech, service IPC, and
lip-sync are later phases, after listening to the generated voice samples.

**Voice approved, 18 November 2026:** the user accepted the natural Japanese
female `oneesan-f2` warm audition (`20261118-180741`, English and Japanese).
`voice/profile.json` saves this default, the reference identity/hash and the
approved audition. The unshared F1 comparison does not replace that choice.

## Inspection (18 November 2026)

| Area | Existing implementation / future integration point |
| --- | --- |
| Desktop | Electron 45, `electron/main.mjs`, `preload.cjs`; authenticated IPC, isolated sandboxed renderer. Microphone permissions are currently denied. |
| UI | React 19, TypeScript 5.9, Vite 8; `src/main.tsx` and `src/app/App.tsx`. Text chat and avatar metadata are already separate. |
| Backend | FastAPI in its own `.venv`, Ollama/Gemini/Grok behind `backend/providers.py` and `app.py`. Voice must not change providers or persona. |
| Dialogue | `backend/response_processor.py` validates message/emotion/expression/motion/actions and removes recognized stage directions. Future speech receives processed dialogue, never tool instructions or raw JSON. |
| Avatar | Pixi 6 / pixi-live2d-display 0.4 / Cubism4. `Avatar.tsx` owns parameter composition and bounds checks. `behavior.ts` already opens the mouth for surprise, yawns and laughter. Speech must be composed here, with explicit priority/reset, not written by the voice service. |
| Rig | Changli's display info lists `ParamMouthOpenY`, `ParamMouthForm`, `ParamMouthX`, `ParamTongueOut`. The model's LipSync group is empty. Runtime bounds must still come from Cubism; these IDs do not establish an A/I/O/U viseme rig. |
| Expressions / idle | Seven supplied expressions in `expressions.ts`, independent idle controller; preserve their timing and existing model framing. |
| Audio | `electron/media.mjs` controls external mpv for music. No voice audio player or microphone pipeline exists. `useIdleCompanion.ts` checks browser speech state only; later native voice needs its own busy signal. |
| Launch / packaging | `scripts/dev.mjs` supervises desktop helpers; `electron/release.mjs` does so for portable releases. Later voice service needs lifecycle/error/cancellation hooks in both. Current CSP needs an intentional audio source allowance when playback is added. |
| Hardware observed | NVIDIA RTX 3050 Laptop, 4096 MiB VRAM; Python 3.14 system interpreter. Prototype uses project-local Python 3.11.13 and CUDA 12.4 PyTorch to isolate compatibility requirements. |

## Files introduced

- `voice/poc.py`: replaceable speech engine interface, explicit V3 model selection,
  English/Japanese samples, local reference WAV support, offline inference and measurements.
- `voice/requirements.txt`, `voice/overrides.txt`, `voice/requirements.windows.lock.txt`:
  pinned engine, watermark dependency and tested Windows environment.
- `voice/reference.py`: downloads a small pinned selection of Japanese female
  JVNV recordings and saves source hashes, credits and licence information.
- `voice/profile.json`: the user-approved voice and default delivery/languages.
- `scripts/voice.mjs`: isolated setup and command runner.
- `voice/tests/test_poc.py`: request bounds, unsupported languages, missing assets,
  and network-block restoration checks.
- `package.json` / `.gitignore`: commands and exclusions for model weights,
  private reference recordings and generated speech.

No application runtime files are changed for this milestone.

## Use

Run from the project folder:

```powershell
npm run setup:voice
npm run voice:sample
```

Setup downloads Python, GPU dependencies and model weights (several GB) into
the project. Generation loads only local files with hub offline flags and
Python socket connections blocked. No API keys or paid voice services are used.
The existing backend environment is untouched. Download is the only network step.

Setup also prepares Chatterbox's mandatory Chinese segmenter in
`voice/models/pkuseg/` (even English/Japanese initialization needs it). An adapter
redirects upstream's Cangjie mapping lookup to the pinned local JSON, avoiding
its unintended hub lookup during `from_local`. No site-packages code is edited.

Samples and JSON measurements appear in timestamped `voice/output/` folders.
Defaults generate two short English and two short Japanese takes so the report
distinguishes initial and subsequent generation. Ctrl+C cancels the standalone
process. Samples already completed remain available.

```powershell
npm run voice:sample -- --device cpu --repeat 1
npm run voice:sample -- --languages en --text "Hey, take your time. I'm listening."
npm run voice:sample -- --reference "C:\path\to\your-authorized-voice.wav"
npm run voice:reference # Download/check the attributed Japanese references
npm run voice:sample -- --voice oneesan-f1 --languages ja --repeat 1
npm run voice:sample -- --voice oneesan-f2 --style playful --languages ja --repeat 1
npm run voice:sample -- --style comforting --repeat 1
npm run voice:sample -- --voice builtin # Explicitly audition upstream's original voice
```

Reference WAVs must contain 3–15 seconds of clean speech. The user requested a
mature Japanese "onee-san" voice with emotion and rejected both the built-in
voice and a Windows Zira synthetic reference as artificial. The default now
uses `oneesan-f2`: natural female Japanese JVNV speech. `oneesan-f1` is a second
female reference for comparison. These are audition labels, not claims about
the speakers' ages or a guarantee of the desired character style. The same
reference is used across English and Japanese; accent transfer needs listening evaluation.
Missing reference files cause a clear error, never a silent return to the
rejected built-in voice. `--reference` overrides this candidate with a selected
recording. No reference audio is committed or included in the portable app.

`--style warm`, `playful` and `comforting` combine sample phrasing with actual
Chatterbox exaggeration/CFG settings (0.5/0.3, 0.7/0.3, 0.35/0.35 respectively).
These are audition presets, not invented categorical emotion features. With
`--text`, your supplied dialogue replaces the sample wording. Voice emotion is
not yet connected to the app's response metadata; that belongs to phase 5.

The `--exaggeration` control maps to the engine's actual expressiveness setting;
it does not promise discrete emotions. `--cfg` is an experimental model control,
not a speech-speed slider. No unsupported pitch/speed controls are presented.
Tamil is not in the pinned engine's supported-language list; requests fail clearly.

## Provenance and licences

- [Chatterbox code](https://github.com/resemble-ai/chatterbox): MIT, pinned commit
  `ab55923c27757c90cfcc407baa57dc25a7d25217` (reports package version 0.1.7).
- [ResembleAI model card](https://huggingface.co/ResembleAI/chatterbox): weights
  marked MIT, pinned revision `5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18`;
  explicitly uses `t3_mtl23ls_v3.safetensors`, since upstream defaults to V2.
  Downloads record file sizes and SHA-256 digests in local `manifest.json`.
- [Perth](https://github.com/resemble-ai/Perth): MIT, pinned commit
  `ff1c8ac55a976971245cdd53c18d6131ca00d993`; upstream watermarking remains enabled.
- PyTorch/torchaudio: BSD-style; NumPy, SciPy, librosa, psutil: BSD-style;
  Transformers/diffusers: Apache-2.0; soundfile: BSD-3-Clause (libsndfile LGPL);
  pykakasi: GPL-3.0. The Japanese tokenizer's dependency licence must be included
  in any later distribution review. Installing an isolated local prototype does
  not automatically add these dependencies to Misaki's portable build.
- uv: MIT/Apache-2.0; Python: PSF licence. Reference audio requires its own rights.
- [spacy-pkuseg](https://github.com/explosion/spacy-pkuseg): MIT code. Its mandatory
  `spacy_ontonotes` auxiliary model is downloaded from the upstream v0.0.26 release
  with SHA-256 `b216e7f92de7ae285aeab8feba2faa8ea8216e5995ff6fb3d391cc8356db1bfe`.
  This remains local setup data; review auxiliary model terms before distribution.
- [JVNV](https://sites.google.com/site/shinnosuketakamichi/research-topics/jvnv_corpus):
  CC BY-SA 4.0. Authors: Detai Xin, Junfeng Jiang, Shinnosuke Takamichi, Yuki Saito,
  Akiko Aizawa, Hiroshi Saruwatari. References use
  [litagin's edited dataset](https://huggingface.co/datasets/litagin/jvnv_corpus_v1_no_nv),
  which removes nonverbal segments and retains CC BY-SA 4.0, pinned at
  `0ca4908ee5b9610bc3b739e1e67dff6120df0675`. The original WAV clips are not pitch
  shifted or otherwise edited by this project. Reference provenance and credits
  accompany generated auditions; preserve attribution and ShareAlike terms when
  sharing reference-derived audio. No endorsement by the speakers is implied.

The engine includes upstream transitive dependencies, including Gradio, but this
prototype does not launch a web server. No TTS models or runtime are redistributed
in the current portable app.

## Acceptance record

Initial real offline runs on the RTX 3050 / 15.7 GiB RAM machine:

| Run | Load | English generation | Japanese generation | Peak memory |
| --- | --- | --- | --- | --- |
| GPU, built-in baseline | 35.916 s | 26.598 s first, 4.353 s warm | 4.923 s, 4.214 s | 4.80 GiB process RSS; 3.14 GiB CUDA allocated / 3.25 GiB reserved |
| CPU, four threads, built-in baseline | 23.855 s | 24.500 s | 21.577 s | 7.10 GiB process RSS |
| GPU, rejected synthetic female reference | 24.999 s | 17.398 s first | 6.891 s next | 4.84 GiB process RSS; 3.51 GiB CUDA allocated / 3.61 GiB reserved |
| CPU, rejected synthetic female reference | 14.418 s | 40.262 s | Not run | 7.11 GiB process RSS |
| GPU, approved natural F2 reference | 21.025 s | 17.092 s first | 15.424 s next | 4.93 GiB process RSS; 3.59 GiB CUDA allocated / 3.70 GiB reserved |

Model files total 3,208,951,924 bytes, excluding auxiliary tokenizer files.
Outputs are mono 24 kHz PCM16 WAV, 3.16–4.04 seconds for these short prompts.
Both runs succeeded with hub offline flags and Python socket connections blocked.
Reports: `voice/output/20261118-175447/report.json` (GPU),
`voice/output/20261118-175618/report.json` (CPU). These figures describe the
original built-in baseline. The synthetic female reference produces 5.56 s English
and 5.00 s Japanese clips, recorded in
`voice/output/20261118-180015/report.json`. The female-reference generation uses
more GPU memory than the built-in baseline.

Approved F2 samples: `voice/output/20261118-180741/en-1.wav` (4.28 s) and
`ja-1.wav` (6.08 s), with full measurements and attribution beside them.
This is the voice selected in `voice/profile.json`. The earlier built-in and
synthetic voice metrics are retained as comparison data, not current defaults.

The production build and four voice contract tests passed. No paid/cloud voice
service or chat-provider call was used. Voice/avatar GPU contention, microphone,
in-app interruption and speech playback are not tested in this milestone.
The GPU's limited headroom requires a shared-workload benchmark before app integration.

Phase 0 inspection and the phase 1 standalone TTS proof of concept are complete.
The user accepted the F2 voice after hearing both language samples. This is
subjective acceptance, not a formal pronunciation or speaker-age evaluation.
Phase 2 onward is not implemented. The app still uses text chat until the local
voice service, playback, microphone and lip-sync phases are connected.
