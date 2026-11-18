"""Prepare attributed Japanese female speech references for local auditions."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REVISION = '0ca4908ee5b9610bc3b739e1e67dff6120df0675'
REPOSITORY = 'litagin/jvnv_corpus_v1_no_nv'
CREDIT = ('JVNV: Detai Xin, Junfeng Jiang, Shinnosuke Takamichi, Yuki Saito, '
          'Akiko Aizawa, Hiroshi Saruwatari; nonverbal sections removed by litagin.')


def prepare():
    import truststore
    truststore.inject_into_ssl()
    import requests
    import soundfile as sf
    import numpy as np
    folder = ROOT / 'references' / 'jvnv'
    folder.mkdir(parents=True, exist_ok=True)
    manifest = {'repository': REPOSITORY, 'revision': REVISION,
                'credit': CREDIT, 'license': 'CC BY-SA 4.0',
                'license_url': 'https://creativecommons.org/licenses/by-sa/4.0/', 'clips': []}
    for speaker in ['F1', 'F2']:
        for number in range(1, 4):
            name = f'{speaker}_happy_free_{number:02d}.wav'
            relative = f'{speaker}/{name}'
            url = f'https://huggingface.co/datasets/{REPOSITORY}/resolve/{REVISION}/{relative}'
            destination = folder / name
            if not destination.exists():
                response = requests.get(url, timeout=60)
                response.raise_for_status()
                if len(response.content) > 10_000_000:
                    raise ValueError('Unexpectedly large reference audio.')
                destination.write_bytes(response.content)
            samples, sr = sf.read(destination)
            duration = len(samples) / sr
            record = {'file': name, 'speaker': speaker, 'emotion': 'happy', 'url': url,
                      'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
                      'seconds': round(duration, 3), 'sample_rate': sr, 'changes': 'None beyond upstream removal of nonverbal sections.'}
            # Keep complete short phrases; no pitch shifting or synthetic respeech.
            if samples.ndim == 1 and 3 <= duration <= 10 and np.isfinite(samples).all():
                record['eligible'] = True
            else:
                record['eligible'] = False
            manifest['clips'].append(record)
            print(f'{name}: {duration:.2f}s, eligible={record["eligible"]}', flush=True)
    (folder / 'provenance.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    (folder / 'ATTRIBUTION.txt').write_text(
        CREDIT + '\nSource: https://sites.google.com/site/shinnosuketakamichi/research-topics/jvnv_corpus\n'
        + 'Mirror: https://huggingface.co/datasets/' + REPOSITORY + '\n'
        + 'Licence: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/\n'
        + 'Files retain the mirror\'s removal of nonverbal segments; no other changes.\n', encoding='utf-8')


if __name__ == '__main__':
    prepare()
