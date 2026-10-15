// Actual read-only native reserve verification on one NEW private copied ledger.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {observeNativeReserve} from './native-reserve.mjs';
import {nativeReserveInputFromReview} from './native-reserve-input.mjs';
const root='/data/bridge-native-reserve-v1',hash=b=>createHash('sha256').update(b).digest('hex');
const files=['reviewed-pins-public.json','reviewed-origin-assets-public.json','reviewed-bootstrap-public.json'];
const reviews=files.map(n=>JSON.parse(fs.readFileSync(root+'/'+n))),selected=nativeReserveInputFromReview(...reviews);
const options={rpc:'http://127.0.0.1:21899',...selected},calls=[];
const fetcher=(url,options)=>{const q=JSON.parse(options.body);assert(['getGenesisHash','getMultipleAccounts'].includes(q.method));calls.push(q.method);return fetch(url,options);};
const proof={schemaVersion:1,state:'running',scope:'Actual read-only native reserve, bootstrap record, consumed receipt and rent-floor observation on one NEW private copied Agave ledger',startedAt:new Date().toISOString(),checks:[],broadcasts:0,simulations:0,productionReady:false,canonicalNetworkChanged:false,globalBacking:reviews[2].globalBacking,reviewEvidenceSHA256:Object.fromEntries(files.map(n=>[n,hash(fs.readFileSync(root+'/'+n))]))};
const save=()=>fs.writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2));
try{
 save();const first=await observeNativeReserve(options,fetcher);assert.equal(first.reserveNativeUnits,'52000000');assert.equal(first.minimumReconciledReserveNativeUnits,'52000000');assert.equal(first.protectedFloorNativeUnits,'2000000');assert.equal(first.nativeOutstandingOriginUnits,'1950000');assert.equal(first.unallocatedNativeSurplusUnits,'0');assert(first.consumedBootstrapReceiptVerified&&first.protectedFloorVerified&&first.recordedCapacityReconciled);assert.equal(first.completeGenesisBackingVerified,false);
 proof.checks.push('Reviewed native code/policy, actual V2 vault, bootstrap record, consumed source receipt and rent verify with exact52million-unit reserve and2million-unit protected floor');save();
 await assert.rejects(observeNativeReserve({...options,bootstrap:{...options.bootstrap,inventorySHA256:'0'.repeat(64)}},fetcher),/bootstrap record/);proof.checks.push('Wrong independently selected bootstrap inventory digest rejects against actual finalized record');save();
 await assert.rejects(observeNativeReserve({...options,bootstrap:{...options.bootstrap,receipt:selected.pins.program}},fetcher),/owner or layout|source event/);proof.checks.push('Substituted consumed receipt rejects against actual finalized native accounts');save();
 const last=await observeNativeReserve({...options,minimumContextSlot:first.finalCodeContextSlot},fetcher);assert.equal(last.snapshotSHA256,first.snapshotSHA256);assert(last.contextSlot>=first.contextSlot);assert.equal(last.reserveNativeUnits,first.reserveNativeUnits);
 proof.checks.push('Fresh observation after rejected expectations retains exact reserve, obligation, floor and bootstrap bytes; only read-only methods used');proof.observation=last;proof.rpcReads=calls.length;proof.rpcMethodCounts=Object.fromEntries([...new Set(calls)].map(m=>[m,calls.filter(v=>v===m).length]));proof.state='passed';proof.completedAt=new Date().toISOString();save();
}catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
