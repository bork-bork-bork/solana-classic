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
shutil.copy2(root / 'docs/whitepaper/output/pdf/Solana_Classic_Whitepaper.pdf', overlay / 'public/whitepaper.pdf')
index=(root / 'apps/web/index.html').read_text().replace('<title>Solana Classic — Memes & NFTs</title>', '<title>Solana Classic</title>').replace('</head>', '<link rel="icon" type="image/svg+xml" href="/favicon.svg"/></head>')
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
shutil.copy2(root / 'infra/custom-domain/Transactions.tsx', overlay / 'src/Transactions.tsx')
shutil.copy2(root / 'infra/custom-domain/AddressDetails.tsx', overlay / 'src/AddressDetails.tsx')
playground=(overlay / 'src/Playground.tsx').read_text()
playground="import ImageUpload from './ImageUpload';\n"+playground
playground=playground.replace("const wallet = useRef<Keypair", "const [customImage, setCustomImage] = useState<string | null>(null);\n  const [uploadBusy, setUploadBusy] = useState(false);\n  const wallet = useRef<Keypair")
playground=playground.replace("api<AssetDocument>('/api/assets', input)", "api<AssetDocument>(customImage ? '/api/upload-assets' : '/api/assets', customImage ? { ...input, imageData: customImage.split(',')[1] } : input)")
playground=playground.replace('fetch(document.uri,', 'fetch(document.uri.startsWith("https://network-release-production.up.railway.app/assets/") ? "/chain-assets/" + document.uri.split("/assets/")[1] : document.uri,')
playground=playground.replace('fetch(document.image,', 'fetch(document.image.startsWith("https://network-release-production.up.railway.app/assets/") ? "/chain-assets/" + document.image.split("/assets/")[1] : document.image,')
playground=playground.replace("api('/api/gallery', { mint:", "api(state.document.image.endsWith('/image.png') ? '/api/upload-gallery' : '/api/gallery', { mint:")
playground=playground.replace('onChange={setPreset}', 'onChange={id => { setPreset(id); setCustomImage(null); }}')
playground=playground.replace('<button className="button primary mint-button"', '<ImageUpload value={customImage} disabled={busy || locked} onChange={setCustomImage} onBusyChange={setUploadBusy}/><button className="button primary mint-button"')
playground=playground.replace('disabled={busy || !publicKey || !canMutate || !!completed}', 'disabled={busy || uploadBusy || !publicKey || !canMutate || balance === null || balance === 0 || !!completed}').replace('TEST','tSOC')
playground=playground.replace('<ImageUpload value={customImage}', '<p className="mint-guidance" role="status">{!canMutate ? "Checking the testnet connection. If this persists, refresh the page." : !publicKey ? "1. Create your test wallet, then get 1 tSOC to mint." : balance === null || balance === 0 ? "2. Get 1 tSOC using the button in your test wallet." : "3. Choose a preset or upload artwork, then mint."}</p><ImageUpload value={customImage}')
playground=playground.replace('The network is being prepared. Test actions become available once connected.', 'Checking the testnet connection. <button className="text-button" onClick={() => window.dispatchEvent(new Event("sc-network-retry"))}>Try connection again</button>')
(overlay / 'src/Playground.tsx').write_text(playground)
network=(overlay / 'src/useNetwork.ts').read_text()
network=network.replace('void load(); const timer', "window.addEventListener('sc-network-retry', load); void load(); const timer")
network=network.replace('active = false; clearInterval(timer);', "active = false; clearInterval(timer); window.removeEventListener('sc-network-retry', load);")
(overlay / 'src/useNetwork.ts').write_text(network)
pages=(overlay / 'src/Pages.tsx').read_text().replace('TEST','tSOC')
pages="import Transactions from './Transactions';\nimport AddressDetails from './AddressDetails';\n"+pages
pages=pages.replace('if (!signature && !address) return;', 'if (!signature) return;')
pages=pages.replace('{address ? <Address value={address}/> : null}', '{address ? <AddressDetails address={address}/> : null}')
pages=pages.replace('<h1>Follow the proof.</h1><p className="lead">Actual transactions and accounts on the configured experimental network.</p>', '{address ? <p className="explorer-breadcrumb"><a href="/explorer">Explorer</a> / Account</p> : <><h1>Explorer</h1><p className="lead">Finalized activity on Solana Classic Testnet.</p></>}')
if os.environ.get('SC_ENABLE_TRANSACTION_FEED') == '1':
    pages=pages.replace('{loading ? <p>Reading chain state…</p>', '{!signature && !address ? <Transactions/> : null}{loading ? <p>Reading chain state…</p>')
    pages=pages.replace("This explorer looks up accounts, transactions and app-known assets. It does not index every activity on the chain. An account's program owner is not an NFT holder.", "Transaction lists read finalized blocks across the retained chain history. An account's program owner is not an NFT holder.")
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
title_start, title_end = roadmap.index('<title>'), roadmap.index('</title>')
roadmap = roadmap[:title_start] + '<title>Solana Classic</title>' + roadmap[title_end + len('</title>'):]
roadmap = roadmap.replace('https://solana-classic-soc.vercel.app/playground', '/playground').replace('https://solana-classic-soc.vercel.app', '/')
roadmap = roadmap.replace('<span class="brand-dot" aria-hidden="true"></span>', '<span class="brand-logo" aria-hidden="true"></span>')
roadmap = roadmap.replace('</head>', '<link rel="stylesheet" href="/domain.css"><link rel="icon" type="image/svg+xml" href="/favicon.svg"></head>')
(destination / 'public/roadmap.html').write_text(roadmap)
(destination / 'public/domain.css').write_text((root / 'infra/custom-domain/styles.css').read_text())
