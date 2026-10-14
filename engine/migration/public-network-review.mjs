// Anonymous public network/software discovery. No wallets or mutation calls.
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runtimeMatches} from './gateway-review.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),freeze=JSON.parse(readFileSync(ROOT+'evidence/candidate-freeze.json'));
const API='https://network-release-production.up.railway.app',WEB='https://solana-classic-soc.vercel.app';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function softwareMatches(agave,token,deps){
  return agave?.tag==='v3.0.14'&&agave.full_commit==='f516a8927c76c07f0ebc54ca7a4ce8b2046eee86'&&agave.assets?.some(a=>a.digest==='sha256:65614325423316a48f57f1ceeaa91ca78f4516e165e305b38c01873cf8c6b8b4')&&token?.tag_name==='program@v10.0.0'&&token.full_commit==='3350a3ba856f5997c4ade91fd1e5c8b515e5df33'&&token.assets?.every(a=>a.digest==='sha256:'+freeze.runtime.tokenProgramSha256)&&token.assets.length>0&&deps?.node_local==='24.19.0'&&deps.pnpm==='10.34.7'&&deps.packages?.['@solana/web3.js']==='1.99.0';
}
async function bytes(url){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok||!r.body)throw Error('Public source unavailable');const rd=r.body.getReader(),chunks=[];let total=0;try{while(true){const {value,done}=await rd.read();if(done)break;total+=value.byteLength;if(total>131072)throw Error('Public source exceeds bound');chunks.push(Buffer.from(value));}}finally{await rd.cancel();rd.releaseLock();}return Buffer.concat(chunks);}
export async function run(){
  const at=new Date().toISOString(),result={schemaVersion:1,at,scope:'remote anonymous production-origin public network page and public software-manifest discovery; no wallet or chain mutation',passed:false,web:WEB,api:API,genesis:freeze.genesis,candidate:freeze.candidate,pages:[],manifests:[],mutationRequests:0,canonicalProcessChanged:false,releaseAccepted:false};let browser;
  try{
    const before=JSON.parse(await bytes(API+'/api/runtime'));if(!runtimeMatches(before))throw Error('Original runtime differs');result.runtimeBefore=before;
    const facts=JSON.parse(await bytes(API+'/api/network'));if(facts.expectedGenesisHash!==freeze.genesis||facts.operatorCount!==1||facts.hasMonetaryValue!==false||facts.mode!=='remote')throw Error('Wrong public network facts');result.networkFacts=facts;
    const files=['docs/agave-compatibility-release.json','docs/token-program-release.json','docs/dependency-manifest.json'];const loaded=[];
    for(const path of files){const url='https://raw.githubusercontent.com/solana-classic/solana-classic/main/'+path,raw=await bytes(url);if(sha(raw)!==sha(readFileSync(ROOT+path)))throw Error('Public software file differs from reviewed source');loaded.push(JSON.parse(raw));result.manifests.push({path,url,sha256:sha(raw),anonymous:true});}
    if(!softwareMatches(...loaded))throw Error('Software manifest identity differs');
    browser=await chromium.launch({headless:true});let errors=0;
    for(const [name,web] of [['frozen',WEB],['custom','https://solanaclassic.net']]){
      const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',()=>errors++);page.on('console',m=>{if(m.type()==='error')errors++;});
      await page.goto(web+'/network');await page.getByText(freeze.genesis,{exact:true}).first().waitFor({timeout:30000});
      const body=await page.locator('main').innerText();if(!(await page.title()).startsWith('Solana Classic')||!await page.locator('main').isVisible()||await page.locator('vite-error-overlay,nextjs-portal').count())throw Error('Wrong or blank network page');
      if(!/no monetary value/i.test(body)||!/(?:One operator|one validator)/i.test(body)||!/reset/i.test(body)||!/Solana.*(?:history|balances)/i.test(body))throw Error('Network limits or reset disclosure missing');
      const widths=[];for(const width of [1440,360]){
        await page.setViewportSize({width,height:1000});
        await page.locator('header .brand').click();await page.waitForURL(web+'/');await page.getByRole('heading',{level:1}).waitFor();
        if(name==='custom'&&width===360){await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('navigation',{name:'Mobile navigation',exact:true}).getByRole('link',{name:'Network',exact:true}).click();}
        else await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('link',{name:'Network',exact:true}).click();
        await page.waitForURL(web+'/network');await page.getByText(freeze.genesis,{exact:true}).first().waitFor({timeout:30000});
        if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Network page overflows');await page.screenshot({path:'/tmp/soc-network-review-'+name+'-'+width+'.png',fullPage:true});widths.push(width);
      }
      result.pages.push({name,url:web+'/network',title:await page.title(),genesisVisible:true,operatorLimitVisible:true,valuelessVisible:true,resetPolicyVisible:true,noSolanaStateInheritanceVisible:true,widths,navigationFromHomeVerified:true,pageErrors:0});await context.close();
    }
    if(errors)throw Error('Network page runtime errors');const after=JSON.parse(await bytes(API+'/api/runtime'));if(!runtimeMatches(after))throw Error('Runtime changed during discovery');result.runtimeAfter=after;
    result.frozenFilesUnchanged=Object.entries(freeze.coreFiles).every(([p,h])=>sha(readFileSync(ROOT+p))===h);if(!result.frozenFilesUnchanged)throw Error('Frozen files changed');result.browser='Chromium Playwright; Browser plugin not available';result.passed=true;
  }catch(error){result.failure=String(error.message).slice(0,300);}finally{await browser?.close();result.completedAt=new Date().toISOString();}return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.length!==4||process.argv[2]!=='--ack'||process.argv[3]!=='read-only')throw Error('Use --ack read-only; no caller-selected targets');const r=await run(),path=ROOT+'evidence/public-network-current-'+r.at.replace(/[^0-9TZ]/g,'')+'.json';writeFileSync(path,JSON.stringify(r,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:r.passed,evidence:path.slice(ROOT.length),pages:r.pages.length,manifests:r.manifests.length,failure:r.failure}));if(!r.passed)process.exitCode=1;}
