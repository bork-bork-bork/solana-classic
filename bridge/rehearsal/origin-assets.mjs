// Read-only actual origin asset checks on one NEW private copied ledger.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {observeOriginAssets} from './origin-assets.mjs';
const root='/data/bridge-origin-assets-v1',hash=b=>createHash('sha256').update(b).digest('hex');
const reviewed=JSON.parse(fs.readFileSync(root+'/reviewed-pins-public.json'));
const prior=JSON.parse(fs.readFileSync(root+'/prior-settlement-public.json'));
assert.equal(reviewed.state,'passed');assert(reviewed.processes.allStopped&&reviewed.broadcasts===0);
assert.equal(prior.state,'passed');assert(prior.processes.allStopped&&prior.operation.state==='FINALIZED');
assert.equal(prior.globalBacking.actualGenesisBackingVerified,false);
const old=reviewed.observations[0],fields=['genesis','remoteGenesis','program','remoteProgram','bridge','originMint','side','upgradeAuthority','elfSHA256','elfBytes','programDataSHA256','policySHA256'];
const pins=Object.fromEntries(fields.map(k=>[k,old[k]]));assert.equal(pins.side,0);assert.equal(pins.genesis,prior.genesi[0]);
const calls=[];const fetcher=(url,options)=>{const q=JSON.parse(options.body);assert(['getGenesisHash','getMultipleAccounts'].includes(q.method));calls.push(q.method);return fetch(url,options);};
const options={rpc:'http://127.0.0.1:20899',pins,expectedSupplyUnits:'2000000',expectedDecimals:6,minimumContextSlot:old.contextSlot};
const proof={schemaVersion:1,state:'running',scope:'Actual read-only immutable plain Token-2022 mint and escrow observation on one NEW private copied Agave ledger',startedAt:new Date().toISOString(),checks:[],broadcasts:0,simulations:0,productionReady:false,canonicalNetworkChanged:false,globalBacking:prior.globalBacking,reviewedPinEvidenceSHA256:hash(fs.readFileSync(root+'/reviewed-pins-public.json'))};
const save=()=>fs.writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2));
try{
 save();const first=await observeOriginAssets(options,fetcher);assert.equal(first.mintSupplyUnits,'2000000');assert.equal(first.originEscrowUnits,'1950000');assert.equal(first.originOutstandingUnits,'1950000');assert.equal(first.unallocatedEscrowSurplusUnits,'0');assert(first.mintAuthoritiesRevoked&&first.programmePinsVerified&&first.escrowCoversRecordedObligations);assert.equal(first.completeGenesisBackingVerified,false);
 proof.checks.push('Reviewed code/policy and actual immutable plain Token-2022 mint, supply, escrow PDA authority and exact1950000-unit obligations match');save();
 await assert.rejects(observeOriginAssets({...options,expectedSupplyUnits:'1999999'},fetcher),/mint supply/);proof.checks.push('Wrong independently selected original supply rejects against actual finalized mint data');save();
 await assert.rejects(observeOriginAssets({...options,expectedDecimals:7},fetcher),/asset policy/);proof.checks.push('Wrong independently selected precision rejects against actual finalized bridge configuration');save();
 const last=await observeOriginAssets({...options,minimumContextSlot:first.finalCodeContextSlot},fetcher);assert.equal(last.assetDataSHA256,first.assetDataSHA256);assert.equal(last.originOutstandingUnits,first.originOutstandingUnits);assert(last.contextSlot>=first.contextSlot);
 assert(calls.every(m=>['getGenesisHash','getMultipleAccounts'].includes(m)));
 proof.checks.push('Fresh observation after rejected expectations retains exact asset hashes and obligations; only read-only methods used');
 proof.observation=last;proof.rpcReads=calls.length;proof.rpcMethodCounts=Object.fromEntries([...new Set(calls)].map(m=>[m,calls.filter(v=>v===m).length]));proof.state='passed';proof.completedAt=new Date().toISOString();save();
}catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
