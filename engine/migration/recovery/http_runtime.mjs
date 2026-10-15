// New isolated recovery entrypoint. Original engine/start/hold files stay intact.
import { readFileSync, writeFileSync, mkdirSync, lstatSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { admitTarget, admitCanary, permits, admitHeldContinuity, digest, FREEZE, GENESIS } from './http_contract.mjs';
let ROOT = '/app';const DATA = '/data';
let currentAttempt = '';
function inputPath(path){return path.startsWith('incoming/')?'classic-recovery-inputs/'+currentAttempt+'/'+path.slice(9):path;}
function privateFile(path, maximum=1048576) {
  path=inputPath(path);const absolute=resolve(DATA,path);if(!absolute.startsWith(DATA+'/')||path.split('/').includes('..'))throw Error('Private proof path escapes isolated data');
  let parent=absolute;while(parent!=='/'){if(lstatSync(parent).isSymbolicLink())throw Error('Private path symlink refused');parent=resolve(parent,'..');}
  const stat=lstatSync(absolute);if(!stat.isFile()||stat.uid!==process.getuid()||stat.nlink!==1||stat.mode&0o077||stat.size<1||stat.size>maximum)throw Error('Bounded owner-only proof required');
  return readFileSync(absolute);
}
export async function serve(attempt,expectedReviewHash) {
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(attempt))throw Error('Fresh attempt UUID required');currentAttempt=attempt;ROOT=DATA+'/classic-recovery-inputs/'+attempt+'/runtime';
  const reviewBytes=privateFile('incoming/http-target-review.json');if(digest(reviewBytes)!==expectedReviewHash)throw Error('Executed target review differs');
  const review=JSON.parse(reviewBytes);admitTarget(review,process.env);if(review.attempt!==attempt)throw Error('Review attempt differs');
  const freezeBytes=privateFile('incoming/candidate-freeze.json');if(digest(freezeBytes)!==FREEZE)throw Error('Exact source-run freeze required');
  const freeze=JSON.parse(freezeBytes),engine=JSON.parse(readFileSync(ROOT+'/engine/migration/release.json'));
  for(const [name,hash] of Object.entries(freeze.coreFiles))if(digest(readFileSync(ROOT+'/'+name))!==hash)throw Error('Original frozen runtime file differs');
  const restore=JSON.parse(privateFile('incoming/isolated-restore-receipt.json'));
  if(restore.passed!==true||restore.targetServiceId!==review.target.serviceId||restore.targetVolumeId!==review.target.volumeId||restore.genesis!==GENESIS||restore.archiveSha256!==review.archiveSha256||restore.rawArchiveSha256!==review.rawArchiveSha256||restore.freshAttemptDirectoryVerified!==true||restore.oldTargetDataRetained!==true||restore.attempt!==review.attempt||restore.allApplicationHashesMatch!==true)throw Error('Genuine isolated extraction receipt required');
  const baselineBytes=privateFile('incoming/archive-http-baseline.json');if(digest(baselineBytes)!==review.archiveHttpBaselineSha256)throw Error('Reviewed archived HTTP baseline differs');
  const canary=admitCanary(JSON.parse(baselineBytes).canary);
  const dataset=DATA+'/classic-recovery/'+review.attempt+'/restored';
  const facts=JSON.parse(privateFile('classic-recovery/'+review.attempt+'/restored/network.json'));
  if(facts.mode!=='remote'||facts.expectedGenesisHash!==GENESIS||facts.hasMonetaryValue!==false||facts.operatorCount!==1)throw Error('Restored remote configuration differs');
  const {createApp}=await import(pathToFileURL(ROOT+'/apps/api/src/app.ts'));
  // Supported factory configuration scopes storage to ONLY the fresh copied
  // dataset. Original Railway root data and source settings/hold are unchanged.
  const settings={network:facts,dataDir:dataset+'/app',assetOrigin:'https://network-release-production.up.railway.app',allowedOrigins:[freeze.candidate.frontendOrigin],upstreamUrl:'http://127.0.0.1:25899/',port:3000,hosting:'linux'};
  const {app}=await createApp(settings);
  const require=createRequire(ROOT+'/apps/api/package.json'),Database=require('better-sqlite3');
  const db=new Database(dataset+'/app/app.sqlite',{readonly:true});
  const row=db.prepare('SELECT wallet,state,signature FROM faucet WHERE request_id=?').get(canary.requestId);db.close();
  if(!row||row.wallet!==canary.wallet||row.state!=='confirmed'||row.signature!==canary.signature)throw Error('Exact archived receipt absent; never permit a new grant');
  app.addHook('preHandler',async(request,reply)=>{if(!permits(request,canary))return reply.code(403).send({code:'ISOLATED_RECOVERY_SCOPE',message:'Only recovery reads and the recorded faucet receipt are permitted.'});});
  // Expose only the bounded proof identity; no paths, keys or raw journal data.
  app.get('/recovery/scope',async()=>({scope:'isolated-source-http-recovery',genesis:GENESIS,targetServiceId:review.target.serviceId,targetVolumeId:review.target.volumeId,canonicalServiceChanged:false,writeScope:'one archived faucet UUID only'}));
  const migration=DATA+'/migration/'+engine.migrationId;
  if(existsSync(migration))throw Error('Fresh target has existing migration controls; preserve and review separately');
  let releasing=false;
  const timer=setInterval(async()=>{
    if(releasing)return;
    const proofPath='incoming/held-http-continuity.json',approvalPath='incoming/approve-http-replay.json';
    if(!existsSync(DATA+'/'+inputPath(proofPath))||!existsSync(DATA+'/'+inputPath(approvalPath)))return;
    releasing=true;
    try{
      const proofBytes=privateFile(proofPath),proof=JSON.parse(proofBytes),approval=JSON.parse(privateFile(approvalPath));
      for(const reference of proof.proofs??[])if(digest(privateFile(reference.path))!==reference.sha256)throw Error('Held-state supporting proof hash differs');
      const runtime=(await app.inject({method:'GET',url:'/api/runtime'})).json();
      const controls=admitHeldContinuity(proof,approval,review,runtime,engine,proofBytes);
      const parent=DATA+'/migration';if(existsSync(parent)&&lstatSync(parent).isSymbolicLink())throw Error('Migration directory symlink refused');
      mkdirSync(migration,{recursive:true,mode:0o700});
      writeFileSync(migration+'/continuity-pass.json',controls.proofBytes,{flag:'wx',mode:0o600});
      writeFileSync(migration+'/enable-writes.json',JSON.stringify(controls.release)+'\n',{flag:'wx',mode:0o600});
      clearInterval(timer);
      console.log(JSON.stringify({scope:'isolated recovery only',archivedReplayReleased:true,targetServiceId:review.target.serviceId,canonicalServiceChanged:false}));
    }catch{clearInterval(timer);console.error('Isolated held-continuity admission failed; writes remain held.');}
  },2000);timer.unref();
  app.addHook('onClose',async()=>clearInterval(timer));
  await app.listen({port:3000,host:'0.0.0.0'});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close().then(()=>process.exit(0)));
  return app;
}
if(process.argv[1]===new URL(import.meta.url).pathname){if(process.argv.length!==4||!/^[a-f0-9]{64}$/.test(process.argv[3]))throw Error('Fresh attempt UUID and reviewed target packet SHA256 required');await serve(process.argv[2],process.argv[3]);}
