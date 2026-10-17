#!/usr/bin/env python3
"""Build a separate custom-domain frontend without editing the frozen application."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import shutil
import re

root = Path(__file__).resolve().parents[2]
freeze = json.loads((root / 'evidence/candidate-freeze.json').read_text())
for name, expected in freeze['coreFiles'].items():
    if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
        raise SystemExit('Frozen file changed: ' + name)
env = dict(os.environ)
env['VITE_API_BASE_URL'] = 'https://solanaclassic.net/_network'
env['VITE_EXPECTED_GENESIS_HASH'] = freeze['genesis']
subprocess.run(['python3', 'scripts/pnpm.py', 'exec', 'node', 'wallet/tools/link-dependencies.mjs'], cwd=root, env=env, check=True)
overlay = root / '.tools/custom-domain-web'
overlay.mkdir(exist_ok=True)
shutil.copytree(root / 'apps/web/src', overlay / 'src', dirs_exist_ok=True)
shutil.copytree(root / 'apps/web/public', overlay / 'public', dirs_exist_ok=True)
shutil.copy2(root / 'docs/whitepaper/output/pdf/Solana_Classic_Whitepaper.pdf', overlay / 'public/whitepaper.pdf')
index=(root / 'apps/web/index.html').read_text().replace('<title>Solana Classic — Memes & NFTs</title>', '<title>Solana Classic</title>').replace('</head>', '<link rel="icon" type="image/svg+xml" href="/favicon.svg"/></head>')
(overlay / 'index.html').write_text(index)
vite_config = (root / 'apps/web/vite.config.ts').read_text()
assert vite_config.count('plugins: [react()]') == 1
vite_config = vite_config.replace('plugins: [react()]', '''plugins: [react(), { name: 'devnet-copy', transform(code: string, id: string) {
  if (id.includes('/packages/chain/')) return code.replace('Experimental network identity is not verified.', 'Devnet identity is not verified.').replace('Issued and verified on the experimental network.', 'Issued and verified on the devnet.');
} }]''')
vite_config = vite_config.replace('build: { sourcemap: false }', "resolve: { dedupe: ['react', 'react-dom'], alias: [{ find: /^react-dom(\\/.*)?$/, replacement: '" + str(root / 'apps/web/node_modules/react-dom') + "' + '$1' }, { find: /^react(\\/.*)?$/, replacement: '" + str(root / 'apps/web/node_modules/react') + "' + '$1' }, { find: 'buffer', replacement: '" + str(root / 'apps/web/node_modules/buffer/index.js') + "' }] }, build: { sourcemap: false }")
(overlay / 'vite.config.ts').write_text(vite_config)
(overlay / 'tsconfig.json').write_text(json.dumps({'extends': '../../wallet/tsconfig.json', 'include': ['src'], 'exclude': []}))
shutil.copy2(root / 'apps/web/package.json', overlay / 'package.json')
if not (overlay / 'node_modules').exists():
    (overlay / 'node_modules').symlink_to(root / 'apps/web/node_modules', target_is_directory=True)
app = (overlay / 'src/App.tsx').read_text()
app = app.replace("['/token', 'Token']];", "['/token', 'Token'], ['/about', 'About'], ['/roadmap', 'Roadmap']];")
app = "import GitHubLink from './GitHubLink';\n" + app
assert app.count('</nav></header>') == 1 and app.count('</footer>') == 1
app = app.replace('</nav></header>', '<GitHubLink/></nav></header>').replace('</footer>', '<GitHubLink/></footer>')
shutil.copy2(root / 'infra/custom-domain/GitHubLink.tsx', overlay / 'src/GitHubLink.tsx')
app = app.replace('Experimental devnet · 1 operator', 'Devnet is live · Run by the Solana Classic team')
app = app.replace('SOC: launch and mainnet planned', 'SOC on Solana · Mainnet planned')
app = app.replace('<span className="brand-mark" aria-hidden="true"/>', '<span className="brand-logo" aria-hidden="true"/>').replace('TEST','tSOC')
app = "import About from './About';\nimport Whitepaper from './Whitepaper';\n" + app
app = app.replace("path === '/' ? <Home/>", "path === '/about' ? <About/> : path === '/' ? <Home/>")
app = "import Builders from './Builders';\nimport Collectors from './Collectors';\nimport Developers from './Developers';\n" + app
app = app.replace("import { useEffect, useState }", "import { useCallback, useEffect, useRef, useState }")
app = "import WalletDrawer from './WalletDrawer';\n" + app
app = app.replace("['/roadmap', 'Roadmap']];", "['/roadmap', 'Roadmap'], ['/wallet', 'Wallet']];")
old_state = "const [path, setPath] = useState(window.location.pathname); const network = useNetwork();"
assert app.count(old_state) == 1
app = app.replace(old_state, """const directWallet = window.location.pathname === '/wallet';
  const initialWallet = directWallet || (() => { try { return localStorage.getItem('classic.wallet.panel') === 'open'; } catch { return false; } })();
  const [path, setPath] = useState(directWallet ? '/' : window.location.pathname);
  const [walletOpen, setWalletOpen] = useState(initialWallet);
  const [walletVisited, setWalletVisited] = useState(initialWallet);
  const walletBackground = useRef(directWallet ? '/' : window.location.pathname + window.location.search + window.location.hash);
  useEffect(() => { try { localStorage.setItem('classic.wallet.panel', walletOpen ? 'open' : 'closed'); } catch {} }, [walletOpen]);
  const openWallet = useCallback(() => {
    if (window.location.pathname !== '/wallet') walletBackground.current = window.location.pathname + window.location.search + window.location.hash;
    setWalletVisited(true); setWalletOpen(true);
  }, []);
  const closeWallet = useCallback(() => {
    setWalletOpen(false);
    if (window.location.pathname === '/wallet') {
      window.history.replaceState({}, '', walletBackground.current);
      setPath(window.location.pathname);
    }
  }, []);
  const network = useNetwork();""")
old_navigate = "const navigate = () => { setPath(window.location.pathname); window.scrollTo(0, 0); };"
assert app.count(old_navigate) == 1
app = app.replace(old_navigate, """const navigate = () => {
      if (window.location.pathname === '/wallet') { openWallet(); return; }
      walletBackground.current = window.location.pathname + window.location.search + window.location.hash;
      setPath(window.location.pathname); window.scrollTo(0, 0);
    };""")
old_push = "event.preventDefault(); window.history.pushState({}, '', url.pathname + url.search); navigate();"
assert app.count(old_push) == 1
app = app.replace(old_push, "event.preventDefault(); if (url.pathname === '/wallet') { openWallet(); return; } window.history.pushState({}, '', url.pathname + url.search); navigate();")
app = app.replace("}, []);\n  const playground", "}, [openWallet]);\n  const playground")
assert app.count('</footer></div>') == 1
app = app.replace('</footer></div>', '</footer>{walletVisited ? <WalletDrawer open={walletOpen} onClose={closeWallet}/> : null}</div>')
app = app.replace("['/about', 'About']", "['/builders', 'Build'], ['/collectors', 'Collectors'], ['/about', 'About'], ['/whitepaper', 'Whitepaper']")
app = app.replace('playground|gallery|explorer|network|token', 'playground|gallery|explorer|network|token|wallet|builders|developers|collectors|about|whitepaper')
app = app.replace("path === '/about' ? <About/>", "path === '/developers' ? <Developers/> : path === '/builders' ? <Builders/> : path.startsWith('/collectors') ? <Collectors path={path}/> : path === '/whitepaper' ? <Whitepaper/> : path === '/about' ? <About/>")
header_start, header_end = app.index('<header className="site-header">'), app.index('</header>') + len('</header>')
app = "import SiteHeader from './SiteHeader';\n" + app[:header_start] + '<SiteHeader path={path} routes={routes} walletOpen={walletOpen}/>' + app[header_end:]
shutil.copy2(root / 'infra/custom-domain/SiteHeader.tsx', overlay / 'src/SiteHeader.tsx')
header = (overlay / 'src/SiteHeader.tsx').read_text()
header = header.replace('routes: readonly (readonly string[])[]', 'routes: readonly (readonly string[])[]; walletOpen?: boolean')
header = header.replace('SiteHeader({ path, routes }: Props)', 'SiteHeader({ path, routes, walletOpen = false }: Props)')
header = header.replace("className={path.startsWith(href!) ? 'active' : ''}", "className={(href === '/wallet' ? walletOpen : path.startsWith(href!)) ? 'active' : ''}")
header = header.replace("aria-current={path.startsWith(href!) ? 'page' : undefined}", "aria-current={href !== '/wallet' && path.startsWith(href!) ? 'page' : undefined} aria-expanded={href === '/wallet' ? walletOpen : undefined} aria-controls={href === '/wallet' ? 'classic-wallet-dialog' : undefined} data-wallet-trigger={href === '/wallet' ? 'true' : undefined}")
(overlay / 'src/SiteHeader.tsx').write_text(header)
(overlay / 'src/App.tsx').write_text(app)
(overlay / 'src/WalletDrawer.tsx').write_text("export { default } from '../../../wallet/src/WalletDrawer';\n")
for name in ['Builders.tsx', 'Collectors.tsx', 'Whitepaper.tsx', 'Developers.tsx', 'SOCContract.tsx', 'Token.tsx']:
    shutil.copy2(root / 'infra/custom-domain' / name, overlay / 'src' / name)
shutil.copy2(root / 'developers/network.json', overlay / 'src/developer-network.json')
paper_edition = json.loads((root / 'docs/whitepaper/output/qa/verification-v015.json').read_text())
(overlay / 'src/whitepaper-edition.json').write_text(json.dumps({'version': paper_edition['version'], 'pages': paper_edition['pages']}))
shutil.copy2(root / 'infra/custom-domain/About.tsx', overlay / 'src/About.tsx')
shutil.copy2(root / 'infra/custom-domain/public-copy.ts', overlay / 'src/public-copy.ts')
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
playground=playground.replace('<ImageUpload value={customImage}', '<p className="mint-guidance" role="status">{!canMutate ? "Checking the devnet connection. If this persists, refresh the page." : !publicKey ? "1. Create your test wallet, then get 1 tSOC to mint." : balance === null || balance === 0 ? "2. Get 1 tSOC using the button in your test wallet." : "3. Choose a preset or upload artwork, then mint."}</p><ImageUpload value={customImage}')
playground=playground.replace('The network is being prepared. Test actions become available once connected.', 'Checking the devnet connection. <button className="text-button" onClick={() => window.dispatchEvent(new Event("sc-network-retry"))}>Try connection again</button>')
(overlay / 'src/Playground.tsx').write_text(playground)
network=(overlay / 'src/useNetwork.ts').read_text()
network="import { publicCopy } from './public-copy';\n"+network
network=network.replace('setFacts(f); setStatus(s);', "setFacts({ ...f, name: publicCopy(f.name), resetPolicy: publicCopy(f.resetPolicy) }); setStatus({ ...s, message: s.state === 'online' ? 'Devnet is live.' : publicCopy(s.message) });")
network=network.replace('void load(); const timer', "window.addEventListener('sc-network-retry', load); void load(); const timer")
network=network.replace('active = false; clearInterval(timer);', "active = false; clearInterval(timer); window.removeEventListener('sc-network-retry', load);")
(overlay / 'src/useNetwork.ts').write_text(network)
api_source=(overlay / 'src/api.ts').read_text()
api_source="import { publicCopy } from './public-copy';\n"+api_source
api_source=api_source.replace("new Error(result.error?.message ?? 'The network could not complete this request.')", "new Error(publicCopy(result.error?.message ?? 'The network could not complete this request.'))")
api_source=api_source.replace('new Error(result.error.message)', 'new Error(publicCopy(result.error.message))')
(overlay / 'src/api.ts').write_text(api_source)
pages=(overlay / 'src/Pages.tsx').read_text().replace('TEST','tSOC')
pages=pages.replace('SOC is planned to launch on Solana through Pump.fun, with a later bridge to native SOC on Solana Classic mainnet. Neither has launched.', 'SOC is intended to be the network token of Solana Classic. A reserve-backed bridge is planned to connect original SOC on Solana with native SOC on Classic. Mainnet and redemption are not live.')
pages=pages.replace('Initial Solana token → planned native network asset', 'SOC on Solana and native SOC on Classic')
pages=pages.replace('Initial trading would use Pump.fun on Solana. Future bridge and pool addresses will appear here once verified. The bridge security model, developer holdings, mainnet economics and future liquidity funding are not finalized.', 'The official mint, team involvement, holdings and fee recipients will be published with any official token announcement. Bridge and pool addresses will appear here once verified. Bridge security, mainnet economics and future liquidity funding are not finalized.')
token_start = pages.index('export function Token()')
assert pages[token_start:].count('export function ') == 1
pages = pages[:token_start] + "export { default as Token } from './Token';\n"
pages=pages.replace('href="/whitepaper.pdf" download', 'href="/whitepaper"')
pages=pages.replace('Experimental by design. Transparent about its limits.', 'Devnet is live. Here is how it works today.')
pages=pages.replace('<dt>Operators</dt><dd>1 — project operated</dd>', '<dt>Who runs the devnet</dt><dd>The Solana Classic team runs one validator - the computer that checks and records transactions.</dd>')
pages=pages.replace('One operator controls network availability and the experimental ledger.', 'The Solana Classic team controls the devnet server and ledger. It can stop the service, change its software or reset the ledger. Independent teams do not yet run validators on this devnet.')
home_start = pages.index('export function Home()')
home_end = pages.index('export function Gallery()', home_start)
pages = pages[:home_start] + "export { default as Home } from './Home';\n" + pages[home_end:]
pages = pages.replace('Address, Notice, PresetArt', 'Address, Notice')
pages = pages.replace('<h1>Made here.</h1>', '<div className="gallery-top"><h1>Made here.</h1><a href="/collectors">View a wallet collection ↗</a></div>')
shutil.copy2(root / 'infra/custom-domain/Home.tsx', overlay / 'src/Home.tsx')
pages="import Transactions from './Transactions';\nimport AddressDetails from './AddressDetails';\n"+pages
pages=pages.replace('if (!signature && !address) return;', 'if (!signature) return;')
pages=pages.replace('{address ? <Address value={address}/> : null}', '{address ? <AddressDetails address={address}/> : null}')
pages=pages.replace('<h1>Follow the proof.</h1><p className="lead">Actual transactions and accounts on the configured experimental network.</p>', '{address ? <p className="explorer-breadcrumb"><a href="/explorer">Explorer</a> / Account</p> : <><h1>Explorer</h1><p className="lead">Finalized activity on Solana Classic Devnet.</p></>}')
if os.environ.get('SC_ENABLE_TRANSACTION_FEED') == '1':
    pages=pages.replace('{loading ? <p>Reading chain state…</p>', '{!signature && !address ? <Transactions/> : null}{loading ? <p>Reading chain state…</p>')
    pages=pages.replace("This explorer looks up accounts, transactions and app-known assets. It does not index every activity on the chain. An account's program owner is not an NFT holder.", "Transaction lists read finalized blocks across the retained chain history. An account's program owner is not an NFT holder.")
pages=pages.replace('facts?.denomination', "(facts?.denomination === 'TEST' ? 'tSOC' : facts?.denomination)")
(overlay / 'src/Pages.tsx').write_text(pages)
style = (overlay / 'src/styles.css').read_text()
style += (root / 'infra/custom-domain/styles.css').read_text()
responsive = []
for media in re.finditer(r'@media\s*\(\s*max-width\s*:\s*(\d+px)\s*\)\s*\{', style):
    start = media.end()
    depth, end = 1, start
    while depth and end < len(style):
        depth += (style[end] == '{') - (style[end] == '}')
        end += 1
    if depth:
        raise SystemExit('Unbalanced responsive style block.')
    responsive.append('@container classic-site (max-width:' + media.group(1) + '){' + style[start:end - 1] + '}')
style += '\n#root{container:classic-site/inline-size}\n' + '\n'.join(responsive)
(overlay / 'src/styles.css').write_text(style)
shutil.copy2(root / 'infra/custom-domain/solana-classic-logo.png', overlay / 'public/solana-classic-logo.png')
shutil.copy2(root / 'infra/custom-domain/solana-classic-logo-cutout.png', overlay / 'public/solana-classic-logo-cutout.png')
shutil.copy2(root / 'infra/custom-domain/favicon.svg', overlay / 'public/favicon.svg')
# Public copy uses Devnet. The frozen source and network identity checks stay intact.
for source in (overlay / 'src').rglob('*'):
    if source.suffix in {'.ts', '.tsx'} and source.name != 'public-copy.ts':
        copy = source.read_text().replace('Experimental devnet', 'Devnet').replace('experimental devnet', 'devnet')
        copy = copy.replace('experimental network', 'devnet').replace('Experimental network', 'Devnet')
        copy = copy.replace('an devnet', 'a devnet').replace('devnet testnet', 'devnet')
        copy = re.sub(r'\bTestnet\b', 'Devnet', copy)
        copy = re.sub(r'\btestnet\b', 'devnet', copy)
        copy = re.sub(r'\bexperimental\b', 'devnet', copy, flags=re.IGNORECASE)
        if re.search(r'\ban devnet\b|\bdevnet testnet\b|\bone operator\b|\b1 operator\b', copy, flags=re.IGNORECASE):
            raise SystemExit('Unclear public devnet wording: ' + str(source))
        source.write_text(copy)
subprocess.run(['python3', 'scripts/pnpm.py', '--filter', '@solana-classic/web', 'exec',
                'vite', 'build', str(overlay), '--config', str(overlay / 'vite.config.ts'),
                '--outDir', str(root / '.tools/custom-domain-site/public'), '--emptyOutDir'],
               cwd=root, env=env, check=True)
destination = root / '.tools/custom-domain-site'
reader_source = root / 'infra/custom-domain/pdf-reader'
reader_dist = reader_source / 'node_modules/pdfjs-dist'
if not (reader_dist / 'build/pdf.min.mjs').exists():
    raise SystemExit('Install the pinned PDF reader: npm ci --prefix infra/custom-domain/pdf-reader --ignore-scripts')
assert json.loads((reader_dist / 'package.json').read_text())['version'] == json.loads((reader_source / 'package.json').read_text())['dependencies']['pdfjs-dist'], 'PDF reader dependency does not match its pin.'
reader_public = destination / 'public/pdf-reader'
reader_public.mkdir(exist_ok=True)
for name in ['reader.html', 'reader.css', 'reader.mjs']:
    shutil.copy2(reader_source / name, reader_public / name)
for name in ['pdf.min.mjs', 'pdf.worker.min.mjs']:
    shutil.copy2(reader_dist / 'build' / name, reader_public / name)
shutil.copy2(reader_dist / 'web/pdf_viewer.css', reader_public / 'pdf_viewer.css')
shutil.copy2(reader_dist / 'LICENSE', reader_public / 'LICENSE.txt')
for name in ['package.json', 'vercel.json']:
    shutil.copy2(root / 'infra/custom-domain' / name, destination / name)
shutil.copytree(root / 'infra/custom-domain/api', destination / 'api', dirs_exist_ok=True)
roadmap = (root / 'roadmap/public/integrated.html').read_text()
title_start, title_end = roadmap.index('<title>'), roadmap.index('</title>')
roadmap = roadmap[:title_start] + '<title>Solana Classic</title>' + roadmap[title_end + len('</title>'):]
roadmap = roadmap.replace('https://solana-classic-soc.vercel.app/playground', '/playground').replace('https://solana-classic-soc.vercel.app', '/')
roadmap = roadmap.replace('experimental release', 'devnet release')
roadmap = roadmap.replace('<span class="brand-dot" aria-hidden="true"></span>', '<span class="brand-logo" aria-hidden="true"></span>')
github = '<a class="github-link" href="https://github.com/solana-classic/solana-classic" target="_blank" rel="noopener noreferrer" aria-label="GitHub source code (opens in a new tab)">GitHub</a>'
roadmap = roadmap.replace('<a class="playground"', '<nav class="roadmap-header-links" aria-label="Project links"><a class="playground"').replace('</header>', github + '</nav></header>')
roadmap = roadmap.replace('https://github.com/solana-classic/solana-classic', 'https://github.com/solana-classic/solana-classic')
roadmap = roadmap.replace('</head>', '<link rel="stylesheet" href="/domain.css"><link rel="icon" type="image/svg+xml" href="/favicon.svg"></head>')
(destination / 'public/roadmap.html').write_text(roadmap)
(destination / 'public/domain.css').write_text((root / 'infra/custom-domain/styles.css').read_text())

# Public presentation uses release criteria; the internal sprint clock is unchanged.
roadmap = roadmap.replace('Verified work. Live checks. One fixed deadline.', 'Current checks, what has passed and what still needs work.')
old_deadline = '<section class="deadline"><h2>Fixed deadline</h2><p class="deadline-date">19 Oct 2026, <br>04:00 London</p><p id="deadline-clock">The original six-day clock.</p></section>'
assert old_deadline in roadmap
roadmap = roadmap.replace(old_deadline, '<section class="release-criteria"><h2>Before release</h2><p>The final candidate must pass an uninterrupted 24-hour stability test, browser regression and operator review. Unresolved checks stay visible here.</p></section>')
roadmap = roadmap.replace('/roadmap/app.js', '/roadmap-app.js')
(destination / 'public/roadmap.html').write_text(roadmap)
paper_qa = json.loads((root / 'docs/whitepaper/output/qa/verification-v015.json').read_text())
assert paper_qa['pdfSHA256'] == hashlib.sha256((destination / 'public/whitepaper.pdf').read_bytes()).hexdigest()
# Verify the exact published edition independently of later draft disclosures.
assert paper_qa['sourceSHA256'] == hashlib.sha256((root / 'docs/whitepaper/editions/0.15.md').read_bytes()).hexdigest()
roadmap_app = (root / 'infra/custom-domain/roadmap-app.js').read_text()
assert roadmap_app.count('__PUBLIC_WHITEPAPER__') == 1
roadmap_app = roadmap_app.replace('__PUBLIC_WHITEPAPER__', json.dumps({'version': paper_qa['version'], 'pages': paper_qa['pages'], 'sha256': paper_qa['pdfSHA256']}))
(destination / 'public/roadmap-app.js').write_text(roadmap_app)
# Content-address the integrated script so refreshed pages cannot reuse old status copy.
roadmap_script = 'roadmap-app.' + hashlib.sha256(roadmap_app.encode()).hexdigest()[:16] + '.js'
(destination / 'public' / roadmap_script).write_text(roadmap_app)
roadmap = roadmap.replace('/roadmap-app.js', '/' + roadmap_script)
(destination / 'public/roadmap.html').write_text(roadmap)

