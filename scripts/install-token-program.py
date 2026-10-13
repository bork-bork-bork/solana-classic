#!/usr/bin/env python3
"""Fetch only the checksum-pinned official Token-2022 v10 program."""
import hashlib
import json
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'docs/token-program-release.json').read_text())
assert manifest['tag_name'] == 'program@v10.0.0'
asset = next(a for a in manifest['assets'] if a['name'] == 'spl_token_2022.so')
assert asset['browser_download_url'] == 'https://github.com/solana-program/token-2022/releases/download/program%40v10.0.0/spl_token_2022.so'
expected = 'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68'
assert asset['digest'] == 'sha256:' + expected and asset['size'] == 506896
target = root / '.tools/programs/spl_token_2022-v10.0.0.so'
target.parent.mkdir(parents=True, exist_ok=True)
if not target.exists():
    request = urllib.request.Request(asset['browser_download_url'], headers={'User-Agent': 'solana-classic-pinned-program'})
    with urllib.request.urlopen(request, timeout=30) as response: data = response.read(asset['size'] + 1)
    assert len(data) == asset['size'] and hashlib.sha256(data).hexdigest() == expected and data.startswith(b'\x7fELF')
    target.write_bytes(data)
assert len(target.read_bytes()) == asset['size'] and hashlib.sha256(target.read_bytes()).hexdigest() == expected
print('Verified official Token-2022 v10.0.0:', expected)
