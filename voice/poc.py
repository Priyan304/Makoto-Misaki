"""Phase 1: pinned model download, then network-disabled speech benchmarks."""
import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import socket
import shutil
import sys
import time
from typing import Protocol
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
MODEL = ROOT / 'models' / 'chatterbox-v3'
PKUSEG = ROOT / 'models' / 'pkuseg'
REVISION = '5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18'
FILES = ('ve.pt', 't3_mtl23ls_v3.safetensors', 's3gen.pt',
         'grapheme_mtl_merged_expanded_v1.json', 'conds.pt', 'Cangjie5_TC.json')
LANGUAGES = frozenset('ar da de el en es fi fr he hi it ja ko ms nl no pl pt ru sv sw tr zh'.split())
JAPANESE_REFERENCES = {'oneesan-f1': 'F1_happy_free_01.wav', 'oneesan-f2': 'F2_happy_free_02.wav'}
DELIVERY = {
    'warm': (.5, .3, {'en': "There you are. Take your time, okay? We can figure this out together.",
                       'ja': 'おかえり。今日もよく頑張ったね。ふふ、少し休んでから、一緒に考えましょう。'}),
    'playful': (.7, .3, {'en': "Hehe, trying to do everything by yourself again? Come on, let me help you.",
                          'ja': 'ふふ、また一人で頑張りすぎてるんでしょう？ほら、お姉さんにも少し手伝わせてね。'}),
    'comforting': (.35, .35, {'en': "It's okay. You don't have to rush. Let's take this one step at a time.",
                             'ja': '大丈夫。そんなに急がなくてもいいの。ゆっくり、一つずつ考えていこうね。'}),
}


@dataclass(frozen=True)
class SpeechRequest:
    text: str
    language: str = 'en'
    reference: Path | None = None
    exaggeration: float = .35
    cfg_weight: float = .5

    def validate(self):
        if self.language not in LANGUAGES:
            raise ValueError(f'Unsupported output language: {self.language}. No automatic language fallback.')
        if not self.text.strip() or len(self.text) > 500:
            raise ValueError('Provide 1–500 characters of dialogue for this short voice test.')
        if not 0 <= self.exaggeration <= 1 or not 0 <= self.cfg_weight <= 1:
            raise ValueError('Exaggeration and CFG must be between 0 and 1.')
        if self.reference and (not self.reference.is_file() or self.reference.suffix.lower() != '.wav'):
            raise ValueError('The reference must be an existing local WAV file.')


class SpeechEngine(Protocol):
    sample_rate: int

    def generate(self, request: SpeechRequest): ...


@contextmanager
def offline():
    """Block Python socket connections as well as hub downloads during inference."""
    keys = ('HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_HUB_DISABLE_TELEMETRY', 'DO_NOT_TRACK')
    previous = {key: os.environ.get(key) for key in keys}
    for key in keys:
        os.environ[key] = '1'
    connect, connect_ex, create = socket.socket.connect, socket.socket.connect_ex, socket.create_connection

    def blocked(*_args, **_kwargs):
        raise RuntimeError('Network access is disabled during local voice generation. Run setup:voice to download missing assets.')

    socket.socket.connect = blocked
    socket.socket.connect_ex = blocked
    socket.create_connection = blocked
    try:
        yield
    finally:
        socket.socket.connect, socket.socket.connect_ex, socket.create_connection = connect, connect_ex, create
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def check_model(directory=MODEL):
    missing = [name for name in FILES if not (directory / name).is_file()]
    if missing:
        raise FileNotFoundError('Voice model is not ready. Run npm run setup:voice. Missing: ' + ', '.join(missing))


def download():
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['HF_HUB_DISABLE_XET'] = '1'
    import ssl
    import httpx
    import truststore
    truststore.inject_into_ssl()
    from huggingface_hub import snapshot_download, set_client_factory
    # Use Windows' trusted certificate store; never bypass TLS verification.
    set_client_factory(lambda: httpx.Client(verify=truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT), follow_redirects=True))
    MODEL.mkdir(parents=True, exist_ok=True)
    snapshot_download('ResembleAI/chatterbox', revision=REVISION, local_dir=MODEL,
                      allow_patterns=[*FILES, 'README.md'], token=False, max_workers=2)
    check_model()
    manifest = {'repository': 'ResembleAI/chatterbox', 'revision': REVISION, 'files': {}}
    for name in FILES:
        with (MODEL / name).open('rb') as handle:
            digest = hashlib.file_digest(handle, 'sha256').hexdigest()
        manifest['files'][name] = {'bytes': (MODEL / name).stat().st_size, 'sha256': digest}
    (MODEL / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    # Upstream initializes this segmenter even for non-Chinese requests.
    # Its own downloader verifies the release archive's pinned SHA-256.
    os.environ['PKUSEG_HOME'] = str(PKUSEG)
    from spacy_pkuseg import pkuseg
    print('Preparing the tokenizer dependency for offline use…', flush=True)
    pkuseg()
    print('Local V3 model downloaded. Generation runs with networking disabled.')


class ChatterboxEngine:
    def __init__(self, device='cpu'):
        check_model()
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        from chatterbox.models.tokenizers import tokenizer
        # Upstream from_local still asks the hub for this already-downloaded
        # mapping. Restrict that one lookup to the pinned local model asset.
        def local_mapping(repo_id, filename, **_kwargs):
            if repo_id != 'ResembleAI/chatterbox' or filename != 'Cangjie5_TC.json':
                raise ValueError('Unexpected tokenizer asset request.')
            return str(MODEL / filename)
        # Explicit V3: upstream's default currently selects the older V2 weights.
        with patch.object(tokenizer, 'hf_hub_download', local_mapping):
            self.model = ChatterboxMultilingualTTS.from_local(MODEL, device=device, t3_model='v3')
        self.sample_rate = self.model.sr

    def generate(self, request):
        request.validate()
        if request.reference:
            import soundfile as sf
            info = sf.info(request.reference)
            if not 3 <= info.duration <= 15 or info.channels > 2:
                raise ValueError('Choose a clean 3–15 second mono or stereo reference WAV.')
        return self.model.generate(request.text, language_id=request.language,
                                   audio_prompt_path=str(request.reference) if request.reference else None,
                                   exaggeration=request.exaggeration, cfg_weight=request.cfg_weight)


def generate(args):
    languages = args.languages.split(',')
    preset_reference = (ROOT / 'references' / 'jvnv' / JAPANESE_REFERENCES[args.voice]
                        if args.voice in JAPANESE_REFERENCES else None)
    reference = Path(args.reference).resolve() if args.reference else preset_reference
    if reference and not reference.is_file():
        raise FileNotFoundError('Female voice reference is missing. Run npm run voice:reference or pass --reference with your own WAV.')
    exaggeration, cfg, sample_texts = DELIVERY[args.style]
    exaggeration = args.exaggeration if args.exaggeration is not None else exaggeration
    cfg = args.cfg if args.cfg is not None else cfg
    requests = [SpeechRequest(args.text or sample_texts.get(language, ''), language,
                              reference,
                              exaggeration, cfg) for language in languages]
    for request in requests:
        request.validate()
    check_model()
    # Keep every library cache in the project, separate from the user's models.
    os.environ['HF_HOME'] = str(ROOT / 'models' / 'hub')
    os.environ['TORCH_HOME'] = str(ROOT / 'models' / 'torch')
    os.environ['PKUSEG_HOME'] = str(PKUSEG)
    if not (PKUSEG / 'spacy_ontonotes.zip').is_file():
        raise FileNotFoundError('Offline tokenizer is missing. Run npm run setup:voice.')
    with offline():
        import psutil
        import torch
        import numpy as np
        import soundfile as sf
        torch.set_num_threads(args.threads)
        device = ('cuda' if torch.cuda.is_available() else 'cpu') if args.device == 'auto' else args.device
        if device == 'cuda' and not torch.cuda.is_available():
            raise RuntimeError('CUDA is unavailable. Use --device cpu or install the CUDA PyTorch build.')
        if device == 'cuda':
            torch.cuda.reset_peak_memory_stats()
        report = {'engine': 'Chatterbox Multilingual V3', 'model_revision': REVISION,
                  'device': device, 'network_disabled': True, 'torch': torch.__version__,
                  'voice': 'user reference' if args.reference else args.voice,
                  'delivery_preset': args.style, 'exaggeration': exaggeration, 'cfg_weight': cfg,
                  'model_bytes': sum((MODEL / name).stat().st_size for name in FILES),
                  'physical_ram_bytes': psutil.virtual_memory().total, 'threads': args.threads, 'samples': []}
        if device == 'cuda':
            report['gpu'] = torch.cuda.get_device_name()
        started = time.perf_counter()
        print(f'Loading V3 on {device}…', flush=True)
        engine = ChatterboxEngine(device)
        report['load_seconds'] = round(time.perf_counter() - started, 3)
        # Timestamped output avoids overwriting an earlier voice evaluation.
        output = ROOT / 'output' / time.strftime('%Y%m%d-%H%M%S')
        output.mkdir(parents=True, exist_ok=False)
        if args.voice in JAPANESE_REFERENCES and not args.reference:
            from voice.reference import CREDIT, REVISION as reference_revision
            report['reference'] = {'file': reference.name, 'revision': reference_revision,
                                   'sha256': hashlib.sha256(reference.read_bytes()).hexdigest(),
                                   'credit': CREDIT, 'license': 'CC BY-SA 4.0'}
            shutil.copyfile(ROOT / 'references/jvnv/ATTRIBUTION.txt', output / 'ATTRIBUTION.txt')
        for request in requests:
            for repeat in range(args.repeat):
                torch.manual_seed(args.seed + repeat)
                if device == 'cuda':
                    torch.cuda.synchronize()
                print(f'Generating {request.language}, take {repeat + 1}…', flush=True)
                started = time.perf_counter()
                wav = engine.generate(request)
                if device == 'cuda':
                    torch.cuda.synchronize()
                elapsed = time.perf_counter() - started
                samples = wav.detach().cpu().numpy().reshape(-1)
                if not samples.size or not np.isfinite(samples).all() or np.max(np.abs(samples)) < .001:
                    raise RuntimeError('The engine returned invalid or silent audio.')
                name = f'{request.language}-{repeat + 1}.wav'
                sf.write(output / name, samples, engine.sample_rate, subtype='PCM_16')
                item = {'file': name, 'language': request.language, 'seed': args.seed + repeat,
                        'generation_seconds': round(elapsed, 3), 'audio_seconds': round(len(samples) / engine.sample_rate, 3),
                        'sample_rate': engine.sample_rate, 'rms': round(float(np.sqrt(np.mean(samples ** 2))), 5)}
                report['samples'].append(item)
                memory = psutil.Process().memory_info()
                report['process_peak_rss_bytes'] = getattr(memory, 'peak_wset', memory.rss)
                if device == 'cuda':
                    report['cuda_peak_allocated_bytes'] = torch.cuda.max_memory_allocated()
                    report['cuda_peak_reserved_bytes'] = torch.cuda.max_memory_reserved()
                (output / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
                print(json.dumps(item), flush=True)
        print(f'Voice samples and measurements: {output}', flush=True)


def main():
    profile = json.loads((ROOT / 'profile.json').read_text(encoding='utf-8'))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['download', 'generate'])
    parser.add_argument('--languages', default=','.join(profile['languages']))
    parser.add_argument('--text', help='Plain spoken dialogue only; no stage directions or tool metadata.')
    parser.add_argument('--reference', help='Optional local reference WAV you have permission to use.')
    parser.add_argument('--voice', choices=['oneesan-f1', 'oneesan-f2', 'builtin'], default=profile['voice'])
    parser.add_argument('--style', choices=list(DELIVERY), default=profile['delivery'], help='Audition phrasing and expressiveness preset, not a categorical emotion guarantee.')
    parser.add_argument('--device', choices=['auto', 'cpu', 'cuda'], default='auto')
    parser.add_argument('--repeat', type=int, choices=range(1, 4), default=2)
    parser.add_argument('--threads', type=int, choices=range(1, 9), default=4)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--exaggeration', type=float)
    parser.add_argument('--cfg', type=float)
    args = parser.parse_args()
    try:
        download() if args.command == 'download' else generate(args)
    except KeyboardInterrupt:
        print('Voice generation cancelled.', file=sys.stderr)
        return 130
    except Exception as error:
        print(f'Voice test failed: {error}', file=sys.stderr)
        if 'out of memory' in str(error).lower():
            print('Try --device cpu. GPU fallback is explicit; no model or language is silently replaced.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
