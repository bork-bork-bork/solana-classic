// Compose the existing logo and bundled typography into GitHub artwork.
// Run with the project-local Node runtime; no network or image generation.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const asset = path => readFileSync(new URL(path, import.meta.url)).toString('base64');
const logo = `data:image/png;base64,${asset('../../infra/custom-domain/solana-classic-logo-cutout.png')}`;
const font = asset('../../roadmap/public/fonts/space-700.ttf');
const regular = asset('../../roadmap/public/fonts/space-400.ttf');
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height] of [['avatar',512,512],['readme-banner',1280,440],['social-preview',1280,640]]) {
    const avatar = name === 'avatar';
    const page = await browser.newPage({ viewport:{width,height}, deviceScaleFactor:1 });
    await page.setContent(`<html><head><style>
      @font-face{font-family:Space;src:url(data:font/ttf;base64,${font});font-weight:700}
      @font-face{font-family:Space;src:url(data:font/ttf;base64,${regular});font-weight:400}
      *{box-sizing:border-box}body{margin:0;background:#d9efe5;color:#073b2a;font-family:Space,Arial,sans-serif;overflow:hidden}
      main{position:relative;width:${width}px;height:${height}px;padding:60px 64px}
      h1{font-size:124px;line-height:.94;letter-spacing:-6px;margin:0;font-weight:700}
      .caption{font-size:30px;color:#275e48;line-height:1.35;margin:30px 0 0}
      img{position:absolute;right:36px;top:-15px;width:470px;height:470px;object-fit:contain}
      .social main{padding:105px 72px}.social h1{font-size:154px;letter-spacing:-8px}.social img{top:55px;width:530px;height:530px;right:20px}.social .caption{font-size:36px;margin-top:42px}
      .avatar main{padding:0}.avatar img{left:21px;top:9px;width:470px;height:470px}
    </style></head><body class="${avatar?'avatar':name==='social-preview'?'social':''}"><main>
    ${avatar?'':`<h1>Solana<br>Classic</h1><p class="caption">Bring back the fun.</p>`}
    <img src="${logo}" alt="Solana Classic green crystal mark"></main></body></html>`);
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('img').evaluate(image=>image.decode());
    await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,import.meta.url))});
    await page.close();
  }
} finally { await browser.close(); }
