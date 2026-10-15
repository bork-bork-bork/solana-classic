// Actual external HTTPS proof of an isolated restoration after genuine release.
// One original faucet UUID replay, zero new grants/signatures or wallet keys.
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, admitCanary, GENESIS, FREEZE, RAW_ARCHIVE, COMPRESSED_ARCHIVE, RECOVERY_SERVICE, RECOVERY_VOLUME } from './http_contract.mjs';
const API='https://recovery-drill-production.up.railway.app';
const ORIGINAL='https://network-release-production.up.railway.app';
const bounded=path=>{const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.size<1||s.size>1048576)throw Error('Bounded baseline/proof file required');return readFileSync(path);};
export async function run(baselinePath, expectedBaselineHash, outputPath) {
  const baselineBytes=bounded(baselinePath);if(digest(baselineBytes)!==expectedBaselineHash)throw Error('Reviewed archive HTTP baseline differs');
  const baseline=JSON.parse(baselineBytes),canary=admitCanary(baseline.canary);
  if(baseline.genesis!==GENESIS||baseline.rawArchiveSha256!==RAW_ARCHIVE||baseline.compressedArchiveSha256!==COMPRESSED_ARCHIVE||baseline.appManifestSha256!=='df6a6cef01852918cadf399921e65331fcd125a329c80a5cc0c82b6e842255af'||baseline.bankInventorySha256!=='5f951ad8e9bf360ccc7291bdf2342f8901b892d526ba9b75f90c533127429cd5'||baseline.rows?.length!==617||Object.keys(baseline.immutableFiles??{}).length!==1992)throw Error('Real full archived baseline required');
  const require=createRequire(resolve('package.json')),{Connection,PublicKey}=require('@solana/web3.js');
  const {verifyAsset,currentNftOwner}=await import(pathToFileURL(resolve('packages/chain/src/index.ts')));
  let queued=Promise.resolve(),last=0;
  const fetchRead=async(url,init={})=>{
    const parsed=new URL(url);if(![API,ORIGINAL].includes(parsed.origin)||parsed.username||parsed.password)throw Error('Only reviewed API origins allowed');
    const wait=queued.then(async()=>{const delay=70-(Date.now()-last);if(delay>0)await new Promise(r=>setTimeout(r,delay));last=Date.now();});queued=wait;await wait;
    return fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
  };
  const json=async(path,body)=>{const r=await fetchRead(API+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error('Required restored HTTPS response failed');const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>2097152)throw Error('Public response bound exceeded');return JSON.parse(bytes);};
  const connection=new Connection(API+'/api/rpc',{commitment:'finalized',disableRetryOnRateLimit:true,fetch:fetchRead});
  const proof={schemaVersion:1,at:new Date().toISOString(),scope:'remote actual isolated HTTPS cold-restore and archived faucet replay verification; not canonical cutover or monetary release',passed:false,genesis:GENESIS,liveApi:ORIGINAL,restoredApi:API,sourceArchiveSha256:RAW_ARCHIVE,compressedArchiveSha256:COMPRESSED_ARCHIVE,archiveHttpBaselineSha256:expectedBaselineHash,backupCheckAccepted:false,canonicalNetworkChanged:false,newFaucetGrants:0,issues:[]};
  try {
    const scope=await json('/recovery/scope');if(scope.targetServiceId!==RECOVERY_SERVICE||scope.targetVolumeId!==RECOVERY_VOLUME||scope.canonicalServiceChanged!==false)throw Error('Wrong isolated target');
    const beforeRuntime=await json('/api/runtime');
    if(beforeRuntime.genesis!==GENESIS||beforeRuntime.sourceCommit!=='119f25e225540be78b64b19bdb6cb300a1f47c10'||beforeRuntime.coreSha256!=='533950731d4ed6d94b59e71517613be002b6ec416b0ebb3a20a592fe5ec6f22f'||beforeRuntime.engineBuild?.binaries?.['solana-test-validator']?.sha256!=='3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a')throw Error('Exact source runtime differs');
    const start=await connection.getSlot('finalized');
    if(await connection.getGenesisHash()!==GENESIS||(await json('/api/status')).state!=='online')throw Error('Restored network not ready');
    const rows=[];let cursor=0;
    for(let pages=0;pages<201;pages++){
      const page=await json('/api/gallery?limit=50&cursor='+cursor);if(!Array.isArray(page.entries)||page.entries.length>50||rows.length+page.entries.length>617)throw Error('Full gallery pagination bound failed');rows.push(...page.entries);
      if(page.nextCursor===null)break;
      if(!/^\d+$/.test(page.nextCursor??'')||Number(page.nextCursor)!==rows.length||Number(page.nextCursor)<=cursor)throw Error('Gallery cursor did not progress');cursor=Number(page.nextCursor);
    }
    const normalized=values=>values.map(row=>Object.fromEntries(['mint','kind','name','symbol','presetId','contentHash','uri','image','issuanceSignature','verifiedAt'].map(key=>[key,row[key]]))).sort((a,b)=>a.mint.localeCompare(b.mint));
    if(rows.length!==617||new Set(rows.map(r=>r.mint)).size!==617||JSON.stringify(normalized(rows))!==JSON.stringify(normalized(baseline.rows)))throw Error('Complete persisted archived gallery differs');
    let nftOwners=0,files=0;
    for(const row of rows){
      await verifyAsset(connection,row);
      const detail=await json('/api/gallery/'+row.mint);
      if(JSON.stringify(normalized([detail]))!==JSON.stringify(normalized([row])))throw Error('Gallery detail registry differs');
      if(row.kind==='nft'){const owner=await currentNftOwner(connection,row.mint);if(!owner||detail.currentOwner!==owner)throw Error('Restored NFT owner differs');nftOwners++;}
      for(const uri of [row.uri,row.image]){
        const url=new URL(uri);if(url.origin!==ORIGINAL||url.search||url.hash||url.username||url.password)throw Error('Original immutable URI changed');const expected=baseline.immutableFiles[url.pathname.slice(1)];if(!expected)throw Error('Immutable file missing from archive');
        for(const origin of [ORIGINAL,API]){const response=await fetchRead(origin+url.pathname);if(!response.ok)throw Error('Original or restored immutable file unavailable');const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length!==expected.bytes||digest(bytes)!==expected.sha256)throw Error('Immutable asset hash differs');}files++;
      }
    }
    const balance=await connection.getBalance(new PublicKey(canary.wallet),'finalized');if(balance!==canary.balanceLamports)throw Error('Original canary balance differs');
    const status=(await connection.getSignatureStatuses([canary.signature],{searchTransactionHistory:true})).value[0];if(!status||status.err||status.confirmationStatus!=='finalized')throw Error('Original archived signature finality missing');
    const repeated=await json('/api/faucet',{publicKey:canary.wallet,requestId:canary.requestId});
    if(repeated.requestId!==canary.requestId||repeated.signature!==canary.signature||repeated.lamports!==canary.lamports||repeated.state!=='confirmed'||await connection.getBalance(new PublicKey(canary.wallet),'finalized')!==balance)throw Error('Actual HTTPS replay changed archived receipt/balance');
    const afterRuntime=await json('/api/runtime');for(const key of ['genesis','sourceCommit','coreSha256','apiBootId','validatorBootId','deploymentId'])if(beforeRuntime[key]!==afterRuntime[key])throw Error('Isolated runtime changed during proof');
    const end=await connection.getSlot('finalized');if(end<=start||await connection.getGenesisHash()!==GENESIS)throw Error('Restored finalized progression failed');
    Object.assign(proof,{passed:true,galleryRows:617,immutableGalleryFilesVerified:files,nftOwnersVerified:nftOwners,faucet:{...canary,noDoubleGrant:true},targetServiceId:RECOVERY_SERVICE,targetVolumeId:RECOVERY_VOLUME,targetRuntimeBefore:beforeRuntime,targetRuntimeAfter:afterRuntime,finalizedSlots:[start,end],exactPublicFaucetPostRecoveryVerified:true,publicIngressVerified:true,scopeLimit:'This HTTP result must be reviewed together with the actual complete-bank/fee/app/provider extraction proofs before aggregate backup-check acceptance.'});
  }catch(error){proof.issues.push('Actual isolated HTTPS recovery stopped; retain this attempt and investigate. No backup acceptance claimed.');proof.failureReason=error instanceof Error ? error.message.slice(0,1000).replace(/\/(?:Users|home)\/[^\s]+/g,'<private-path>') : 'Unknown verification failure';}
  proof.completedAt=new Date().toISOString();writeFileSync(outputPath,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});return proof;
}
if(process.argv[1]===new URL(import.meta.url).pathname){if(process.argv.length!==5||!/^[a-f0-9]{64}$/.test(process.argv[3]))throw Error('Use reviewed baseline, its SHA256, and NEW output proof path');const proof=await run(process.argv[2],process.argv[3],process.argv[4]);console.log(JSON.stringify({passed:proof.passed,backupCheckAccepted:false,galleryRows:proof.galleryRows??0}));if(!proof.passed)process.exitCode=1;}
