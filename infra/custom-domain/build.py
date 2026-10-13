#!/usr/bin/env python3
"""Build a separate custom-domain frontend without editing the frozen application."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import shutil

root = Path(__file__).resolve().parents[2]
freeze = json.loads((root / 'evidence/candidate-freeze.json').read_text())
for name, expected in freeze['coreFiles'].items():
    if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
        raise SystemExit('Frozen file changed: ' + name)
env = dict(os.environ)
env['VITE_API_BASE_URL'] = 'https://solanaclassic.net/_network'
env['VITE_EXPECTED_GENESIS_HASH'] = freeze['genesis']
overlay = root / '.tools/custom-domain-web'
overlay.mkdir(exist_ok=True)
shutil.copytree(root / 'apps/web/src', overlay / 'src', dirs_exist_ok=True)
shutil.copytree(root / 'apps/web/public', overlay / 'public', dirs_exist_ok=True)
index=(root / 'apps/web/index.html').read_text().replace('</head>', '<link rel="icon" type="image/svg+xml" href="/favicon.svg"/></head>')
(overlay / 'index.html').write_text(index)
shutil.copy2(root / 'apps/web/vite.config.ts', overlay / 'vite.config.ts')
shutil.copy2(root / 'apps/web/package.json', overlay / 'package.json')
if not (overlay / 'node_modules').exists():
    (overlay / 'node_modules').symlink_to(root / 'apps/web/node_modules', target_is_directory=True)
app = (overlay / 'src/App.tsx').read_text()
app = app.replace("['/token', 'Token']];", "['/token', 'Token'], ['/about', 'About'], ['/roadmap', 'Roadmap']];")
app = app.replace('<span className="brand-mark" aria-hidden="true"/>', '<span className="brand-logo" aria-hidden="true"/>').replace('TEST','tSOC')
app = "import About from './About';\n" + app
app = app.replace("path === '/' ? <Home/>", "path === '/about' ? <About/> : path === '/' ? <Home/>")
(overlay / 'src/App.tsx').write_text(app)
shutil.copy2(root / 'infra/custom-domain/About.tsx', overlay / 'src/About.tsx')
shutil.copy2(root / 'infra/custom-domain/ImageUpload.tsx', overlay / 'src/ImageUpload.tsx')
playground=(overlay / 'src/Playground.tsx').read_text()
playground="import ImageUpload from './ImageUpload';\n"+playground
playground=playground.replace("const wallet = useRef<Keypair", "const [customImage, setCustomImage] = useState<string | null>(null);\n  const [uploadBusy, setUploadBusy] = useState(false);\n  const wallet = useRef<Keypair")
playground=playground.replace("api<AssetDocument>('/api/assets', input)", "api<AssetDocument>(customImage ? '/api/upload-assets' : '/api/assets', customImage ? { ...input, imageData: customImage.split(',')[1] } : input)")
playground=playground.replace("api('/api/gallery', { mint:", "api(state.document.image.endsWith('/image.png') ? '/api/upload-gallery' : '/api/gallery', { mint:")
playground=playground.replace('onChange={setPreset}', 'onChange={id => { setPreset(id); setCustomImage(null); }}')
playground=playground.replace('<button className="button primary mint-button"', '<ImageUpload value={customImage} disabled={busy || locked} onChange={setCustomImage} onBusyChange={setUploadBusy}/><button className="button primary mint-button"')
playground=playground.replace('disabled={busy || !publicKey || !canMutate || !!completed}', 'disabled={busy || uploadBusy || !publicKey || !canMutate || !!completed}').replace('TEST','tSOC')
(overlay / 'src/Playground.tsx').write_text(playground)
pages=(overlay / 'src/Pages.tsx').read_text().replace('TEST','tSOC')
pages=pages.replace("Our goal is a home where creation is simple and buyers can see who controls supply, who receives fees and what unlocks next. Developer disclosures, allocation views and auditable creator funding are part of the product vision.", "We are bringing together developers who care about this category. Solana is broadening its purpose; Solana Classic gives art, NFTs, memes and their communities a focused place to build their own future.")
pages=pages.replace("<a href=\"/network\">See the network's actual status and limits</a>", "<a href=\"/about\">Remember why we came</a> · <a href=\"/network\">See the network's actual status and limits</a>")
pages=pages.replace('facts?.denomination', "(facts?.denomination === 'TEST' ? 'tSOC' : facts?.denomination)")
(overlay / 'src/Pages.tsx').write_text(pages)
style = (overlay / 'src/styles.css').read_text()
style += (root / 'infra/custom-domain/styles.css').read_text()
(overlay / 'src/styles.css').write_text(style)
shutil.copy2(root / 'infra/custom-domain/solana-classic-logo.png', overlay / 'public/solana-classic-logo.png')
shutil.copy2(root / 'infra/custom-domain/solana-classic-logo-cutout.png', overlay / 'public/solana-classic-logo-cutout.png')
shutil.copy2(root / 'infra/custom-domain/favicon.svg', overlay / 'public/favicon.svg')
subprocess.run(['python3', 'scripts/pnpm.py', '--filter', '@solana-classic/web', 'exec',
                'vite', 'build', str(overlay), '--config', str(overlay / 'vite.config.ts'),
                '--outDir', str(root / '.tools/custom-domain-site/public'), '--emptyOutDir'],
               cwd=root, env=env, check=True)
destination = root / '.tools/custom-domain-site'
for name in ['package.json', 'vercel.json']:
    shutil.copy2(root / 'infra/custom-domain' / name, destination / name)
shutil.copytree(root / 'infra/custom-domain/api', destination / 'api', dirs_exist_ok=True)
roadmap = (root / 'roadmap/public/integrated.html').read_text()
roadmap = roadmap.replace('https://solana-classic-soc.vercel.app/playground', '/playground').replace('https://solana-classic-soc.vercel.app', '/')
roadmap = roadmap.replace('<span class="brand-dot" aria-hidden="true"></span>', '<span class="brand-logo" aria-hidden="true"></span>')
roadmap = roadmap.replace('</head>', '<link rel="stylesheet" href="/domain.css"><link rel="icon" type="image/svg+xml" href="/favicon.svg"></head>')
(destination / 'public/roadmap.html').write_text(roadmap)
(destination / 'public/domain.css').write_text((root / 'infra/custom-domain/styles.css').read_text())
