import test from 'node:test';
import assert from 'node:assert/strict';
import { admitTarget, admitCanary, permits, admitHeldContinuity, digest, PROJECT, ENVIRONMENT, GENESIS, RECOVERY_SERVICE, RECOVERY_VOLUME, RAW_ARCHIVE, COMPRESSED_ARCHIVE, FREEZE } from './http_contract.mjs';
import { validRelease } from '../hold.mjs';
const id='11111111-1111-4111-8111-111111111111', now=Date.parse('2026-10-15T03:00:00Z'), at='2026-10-15T02:59:00Z';
const review={schemaVersion:1,scope:'isolated-source-http-recovery-target',approved:true,providerAssignmentVerified:true,reviewedAt:at,attempt:id,freezeSha256:FREEZE,archiveSha256:COMPRESSED_ARCHIVE,rawArchiveSha256:RAW_ARCHIVE,archiveHttpBaselineSha256:'a'.repeat(64),target:{projectId:PROJECT,environmentId:ENVIRONMENT,serviceId:RECOVERY_SERVICE,volumeId:RECOVERY_VOLUME,api:'https://recovery-drill-production.up.railway.app'}};
const env={RAILWAY_PROJECT_ID:PROJECT,RAILWAY_ENVIRONMENT_ID:ENVIRONMENT,RAILWAY_SERVICE_ID:RECOVERY_SERVICE,RAILWAY_VOLUME_MOUNT_PATH:'/data',RAILWAY_DEPLOYMENT_ID:id};
const canary={wallet:'11111111111111111111111111111111',requestId:id,signature:'1'.repeat(88),lamports:1000000000,balanceLamports:2000000000,state:'confirmed',archiveDerived:true};
const engine={genesis:GENESIS,migrationId:id,runId:id,preparedAt:'2026-10-14T00:00:00Z',binaries:{'solana-test-validator':{sha256:'3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a'}}};
const runtime={deploymentId:id,apiBootId:id,validatorBootId:id,coreSha256:'a'.repeat(64),sourceCommit:'a'.repeat(40),engineBuild:engine};
function proof(){return {schemaVersion:1,scope:'isolated-source-http-recovery-held-continuity',passed:true,genesis:GENESIS,at,freezeSha256:FREEZE,backupArchiveSha256:RAW_ARCHIVE,compressedArchiveSha256:COMPRESSED_ARCHIVE,targetServiceId:RECOVERY_SERVICE,targetVolumeId:RECOVERY_VOLUME,targetDeploymentId:id,apiBootId:id,validatorBootId:id,coreSha256:runtime.coreSha256,sourceCommit:runtime.sourceCommit,engineManifestSha256:digest(JSON.stringify(engine)),completeAccountComparison:{passed:true,completeCurrentInventory:true,accountCount:2163,userAndProgrammeAccountsUnchanged:true,voteFeeMovementReconciled:true},application:{allHashesMatch:true,galleryRows:617,immutableFiles:1992},archivedCanaryVerified:true,canonicalRuntimeUnchanged:true,isolatedArchiveExtractionVerified:true,proofs:[1,2,3].map(n=>({path:'incoming/proof'+n+'.json',sha256:'a'.repeat(64)}))};}
function release(p){const bytes=Buffer.from(JSON.stringify(p));const approval={action:'release-isolated-recovery-replay',proofSha256:digest(bytes),targetServiceId:RECOVERY_SERVICE,targetVolumeId:RECOVERY_VOLUME,genesis:GENESIS,approvedAt:at};return admitHeldContinuity(p,approval,review,runtime,engine,bytes,now);}
test('only independently reviewed actual recovery target, never canonical/shared worker',()=>{
  admitTarget(review,env,now);
  for(const changed of [{...env,RAILWAY_SERVICE_ID:'d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6'},{...env,SC_OPERATION:'cold-restore'},{...env,SC_MIGRATION_MODE:'canonical-testnet'}])assert.throws(()=>admitTarget(review,changed,now));
  assert.throws(()=>admitTarget({...review,providerAssignmentVerified:false},env,now));
  assert.throws(()=>admitTarget({...review,target:{...review.target,volumeId:'080bf785-50e7-4dda-893b-4d613aa5e9a8'}},env,now));
});
test('only archive-derived recorded faucet UUID and readonly RPC can pass outer guard',()=>{
  admitCanary(canary);
  assert.equal(permits({method:'POST',url:'/api/faucet',body:{publicKey:canary.wallet,requestId:id}},canary),true);
  for(const request of [{method:'POST',url:'/api/faucet',body:{publicKey:canary.wallet,requestId:'replacement'}},{method:'POST',url:'/api/assets',body:{}},{method:'POST',url:'/api/rpc',body:{jsonrpc:'2.0',method:'sendTransaction'}},{method:'POST',url:'/api/rpc',body:{jsonrpc:'2.0',method:'validatorExit'}},{method:'POST',url:'/api/rpc',body:{jsonrpc:'2.0',method:'setLogFilter'}}])assert.equal(permits(request,canary),false);
  assert.equal(permits({method:'POST',url:'/api/rpc',body:{jsonrpc:'2.0',method:'getGenesisHash'}},canary),true);
  assert.throws(()=>admitCanary({...canary,archiveDerived:false}));
  for(const balanceLamports of [undefined,0,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>admitCanary({...canary,balanceLamports}));
  assert.throws(()=>admitCanary({...canary,lamports:2000000000}));
});
test('bounded known-address comparison cannot masquerade as complete bank/fees',()=>{
  for(const field of ['completeCurrentInventory','voteFeeMovementReconciled']){const p=proof();p.completeAccountComparison[field]=false;assert.throws(()=>release(p));}
  const p=proof();p.application.galleryRows=500;assert.throws(()=>release(p));
});
test('actual held runtime and real target proof required, no relabelled old candidate',()=>{
  for(const field of ['apiBootId','validatorBootId','targetServiceId','sourceCommit']){const p=proof();p[field]='changed';assert.throws(()=>release(p));}
  const p=proof();p.proofs[0].path='../outside';assert.throws(()=>release(p));
});
test('reviewed isolated control bytes satisfy original unmodified hold contract',()=>{
  const controls=release(proof());assert.equal(validRelease(controls.release,JSON.parse(controls.proofBytes),engine,digest(controls.proofBytes),now),true);
  assert.notEqual(JSON.parse(controls.proofBytes).targetServiceId,'d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6');
  assert.equal(validRelease(controls.release,JSON.parse(controls.proofBytes),engine,'b'.repeat(64),now),false);
});
