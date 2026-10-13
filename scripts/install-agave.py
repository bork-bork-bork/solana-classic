#!/usr/bin/env python3
"""Install only the pinned official archive after full size and SHA256 verification."""
from pathlib import Path
import argparse
import hashlib
import json
import platform
import shutil
import tarfile
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--platform', default='aarch64-apple-darwin' if platform.system() == 'Darwin' and platform.machine() == 'arm64' else 'x86_64-unknown-linux-gnu')
parser.add_argument('--destination', default='.tools/agave-v4.3.0')
parser.add_argument('--manifest', default='docs/agave-release.json')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
release = json.loads((root / args.manifest).read_text())
assert release['tag'] in {'v4.3.0', 'v3.0.14'}, 'Unreviewed release pin.'
asset = next(a for a in release['assets'] if a['name'] == 'solana-release-' + args.platform + '.tar.bz2')
assert asset['browser_download_url'] == 'https://github.com/anza-xyz/agave/releases/download/' + release['tag'] + '/' + asset['name']
archive = root / '.tools/downloads' / release['tag'] / asset['name']
archive.parent.mkdir(parents=True, exist_ok=True)
legacy = root / '.tools' / asset['name']
if not archive.exists() and legacy.exists() and legacy.stat().st_size == asset['size'] and 'sha256:' + hashlib.sha256(legacy.read_bytes()).hexdigest() == asset['digest']:
    shutil.copyfile(legacy, archive)
for attempt in range(20):
    current = archive.stat().st_size if archive.exists() else 0
    if current == asset['size']: break
    headers = {'User-Agent': 'solana-classic-pinned-install', 'Accept-Encoding': 'identity'}
    if current: headers['Range'] = f'bytes={current}-{asset["size"] - 1}'
    request = urllib.request.Request(asset['browser_download_url'], headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        if current and (response.status != 206 or not response.headers.get('Content-Range', '').startswith(f'bytes {current}-')):
            raise SystemExit('Server did not honour the missing range; archive not executed.')
        with archive.open('ab' if current else 'wb') as output:
            while chunk := response.read(1024 * 1024): output.write(chunk)
    print('Downloaded bytes:', archive.stat().st_size, '/', asset['size'], flush=True)
    if archive.stat().st_size <= current: raise SystemExit('Download did not advance.')
assert archive.stat().st_size == asset['size'], 'Incomplete release archive; not executed.'
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
assert 'sha256:' + digest == asset['digest'], 'Published archive checksum mismatch; not executed.'
destination = (root / args.destination).resolve()
destination.mkdir(parents=True, exist_ok=True)
with tarfile.open(archive, 'r:bz2') as source:
    # The pinned official release contains only directories and regular files.
    # Extract these explicitly so older distro Python versions retain path guards.
    members = source.getmembers()
    for member in members:
        target = (destination / member.name).resolve()
        target.relative_to(destination)
        if not (member.isdir() or member.isfile()) or Path(member.name).is_absolute():
            raise SystemExit('Unsupported archive member; archive not executed.')
    for member in members:
        target = destination / member.name
        if member.isdir(): target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(member) as incoming, target.open('wb') as output:
                shutil.copyfileobj(incoming, output)
            target.chmod(member.mode & 0o755)
manifest = {'release': release['tag'], 'platform': args.platform, 'archive_sha256': digest, 'archive_bytes': asset['size'], 'binaries': {}}
for name in ['solana', 'solana-test-validator', 'solana-keygen']:
    binary = next(destination.rglob(name))
    manifest['binaries'][name] = {'path': str(binary.relative_to(root)), 'sha256': hashlib.sha256(binary.read_bytes()).hexdigest()}
(root / 'evidence').mkdir(exist_ok=True)
(root / 'evidence' / ('agave-install-' + release['tag'] + '-' + args.platform + '.json')).write_text(json.dumps(manifest, indent=2) + '\n')
print('Verified pinned archive and binaries:', json.dumps(manifest, indent=2))
