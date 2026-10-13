import json
import gzip
import time
import urllib.request
from pathlib import Path

PACKAGES = {
    '@solana/web3.js': '1.x', '@solana/spl-token': 'latest',
    '@solana/spl-token-metadata': 'latest', 'react': 'latest',
    'react-dom': 'latest', 'vite': 'latest', '@vitejs/plugin-react': 'latest',
    'fastify': 'latest', '@fastify/cors': 'latest', 'better-sqlite3': 'latest',
    'zod': 'latest', 'typescript': '5.x', 'tsx': 'latest', 'vitest': 'latest',
    '@playwright/test': 'latest', 'pnpm': '10.x', '@types/node': '24.x',
    '@types/react': 'latest', '@types/react-dom': 'latest',
    '@types/better-sqlite3': 'latest', 'buffer': 'latest', 'vercel': 'latest', 'fastestsmallesttextencoderdecoder': 'latest',
    'eslint': 'latest', '@eslint/js': 'latest', 'typescript-eslint': 'latest',
    'globals': 'latest', '@fontsource/space-grotesk': 'latest',
    '@fontsource/ibm-plex-mono': 'latest',
}
root = Path(__file__).resolve().parent.parent
output = root / 'docs/resolved-package-versions.json'
result = json.loads(output.read_text()) if output.exists() else {}
def fetch_json(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip', 'User-Agent': 'solana-classic-preflight',
            })
            with urllib.request.urlopen(request, timeout=45) as response:
                body = response.read()
                if response.headers.get('Content-Encoding') == 'gzip':
                    body = gzip.decompress(body)
                return json.loads(body)
        except Exception:
            if attempt == 2: raise
            time.sleep(1)
for name, tag in PACKAGES.items():
    if name in result: continue
    data = fetch_json('https://registry.npmjs.org/' + name + ('/latest' if tag == 'latest' else ''))
    if tag.endswith('.x'):
        major = tag.split('.')[0]
        versions = [v for v in data['versions'] if v.split('.')[0] == major and '-' not in v]
        version = max(versions, key=lambda v: tuple(map(int, v.split('.'))))
    else:
        version = data['version']
    result[name] = version
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(name, version, flush=True)
output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
release = fetch_json('https://api.github.com/repos/anza-xyz/agave/releases/tags/v4.3.0')
manifest = {
    'tag': release['tag_name'], 'published_at': release['published_at'],
    'assets': [{k: asset[k] for k in ['name', 'browser_download_url', 'size', 'digest'] if k in asset}
               for asset in release['assets']],
}
(root / 'docs/agave-release.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Agave release assets:', json.dumps(manifest['assets']))
