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
      *{box-sizing:border-box}body{margin:0;background:#0b2017;color:#f4f7f6;font-family:Space,Arial,sans-serif;overflow:hidden}
      main{position:relative;width:${width}px;height:${height}px;padding:64px}
      .label{font-size:18px;color:#74e8b2;letter-spacing:2px;margin:0 0 22px}
      h1{font-size:68px;line-height:1.08;letter-spacing:-3px;margin:0;font-weight:700}
      .tagline{font-size:36px;letter-spacing:-1px;margin:20px 0 18px}
      .focus{font-size:21px;color:#b8d0c3;margin:0}
      .footer{position:absolute;left:64px;right:64px;bottom:34px;border-top:1px solid #365a47;padding-top:18px;display:flex;justify-content:space-between;color:#b8d0c3;font-size:16px}
      img{position:absolute;right:52px;top:${name==='social-preview'?122:52}px;width:310px;height:310px;object-fit:contain}
      .social h1{font-size:88px;max-width:680px}.social .tagline{font-size:42px;margin-top:26px}.social main{padding-top:94px}
      .avatar{background:#f4f7f6}.avatar main{padding:0}.avatar img{inset:86px;width:340px;height:340px}
    </style></head><body class="${avatar?'avatar':name==='social-preview'?'social':''}"><main>
    ${avatar?'':`<p class="label">OPEN SOURCE · BUILT TOGETHER</p><h1>Solana Classic</h1><p class="tagline">Bring back the fun.</p><p class="focus">Art. NFTs. Memes. Communities.</p><div class="footer"><span>Shared roots. Our own direction.</span><span>solanaclassic.net</span></div>`}
    <img src="${logo}" alt="Solana Classic green crystal mark"></main></body></html>`);
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('img').evaluate(image=>image.decode());
    await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,import.meta.url))});
    await page.close();
  }
} finally { await browser.close(); }
