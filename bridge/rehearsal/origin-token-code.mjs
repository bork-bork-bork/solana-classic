// Actual read-only token-code/asset observation on one NEW private ledger copy.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {genesisTokenCodePins,observeOriginTokenCode,observeTokenPinnedOriginAssets} from './origin-token-code.mjs';
import {originAssetPinsFromReview} from './origin-asset-pins.mjs';
const root='/data/bridge-origin-token-code-v1',hash=b=>createHash('sha256').update(b).digest('hex');
const reviewed=JSON.parse(fs.readFileSync(root+'/reviewed-pins-public.json'));
const prior=JSON.parse(fs.readFileSync(root+'/prior-settlement-public.json'));
assert.equal(prior.state,'passed');assert(prior.processes.allStopped&&prior.operation.state==='FINALIZED');assert.equal(prior.globalBacking.actualGenesisBackingVerified,false);
const selected=originAssetPinsFromReview(reviewed),pins=selected.pins;assert.equal(pins.genesis,prior.genesi[0]);
const release=JSON.parse(fs.readFileSync(root+'/token-release-public.json'));
const asset=release.assets.find(v=>v.name==='spl_token_2022-10.0.0.so');assert(asset&&release.tag_name==='program@v10.0.0');
assert.equal(asset.digest,'sha256:a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68');assert.equal(asset.size,506896);
// Historical test-validator --bpf-program installs slot0 Some(default pubkey).
// Select that expected authority and trusted public artifact, never RPC bytes.
const tokenPins=genesisTokenCodePins({genesis:pins.genesis,artifact:fs.readFileSync('/data/bridge-bootstrap-v2/token2022.so'),upgradeAuthority:'11111111111111111111111111111111',expectedSHA256:asset.digest.slice(7),expectedBytes:asset.size});
const calls=[],fetcher=(url,options)=>{const q=JSON.parse(options.body);assert(['getGenesisHash','getMultipleAccounts'].includes(q.method));calls.push(q.method);return fetch(url,options);};
const options={rpc:'http://127.0.0.1:20899',pins,tokenPins,expectedSupplyUnits:'2000000',expectedDecimals:6,minimumContextSlot:selected.minimumContextSlot};
const proof={schemaVersion:1,state:'running',scope:'Actual read-only selected Token-2022 artifact/authority and immutable origin mint/escrow observation on one NEW private Agave copy',startedAt:new Date().toISOString(),checks:[],broadcasts:0,simulations:0,productionReady:false,canonicalNetworkChanged:false,globalBacking:prior.globalBacking,reviewedPinEvidenceSHA256:hash(fs.readFileSync(root+'/reviewed-pins-public.json')),tokenArtifactReviewSHA256:hash(fs.readFileSync(root+'/token-release-public.json'))};
const save=()=>fs.writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2));
try{
 save();const first=await observeTokenPinnedOriginAssets(options,fetcher);assert.equal(first.mintSupplyUnits,'2000000');assert.equal(first.originEscrowUnits,'1950000');assert.equal(first.originOutstandingUnits,'1950000');assert.equal(first.unallocatedEscrowSurplusUnits,'0');assert(first.tokenCodeVerified&&first.programmePinsVerified&&first.escrowCoversRecordedObligations);assert.equal(first.tokenCode.elfSHA256,asset.digest.slice(7));assert.equal(first.tokenCode.upgradeAuthority,'11111111111111111111111111111111');assert.equal(first.tokenCodeBoundaries,2);
 proof.checks.push('Selected public Token-2022 v10 ELF, complete slot-zero ProgramData and authority match before and after actual immutable mint/escrow observations');save();
 await assert.rejects(observeOriginTokenCode({rpc:options.rpc,pins:{...tokenPins,programDataSHA256:'0'.repeat(64)},minimumContextSlot:first.finalTokenContextSlot},fetcher),/selected pin/);proof.checks.push('Wrong selected complete token programme-data hash rejects against actual deployed state');save();
 await assert.rejects(observeOriginTokenCode({rpc:options.rpc,pins:{...tokenPins,upgradeAuthority:pins.upgradeAuthority},minimumContextSlot:first.finalTokenContextSlot},fetcher),/authority differs/);proof.checks.push('Wrong selected token upgrade authority rejects despite matching code and programme-data hash');save();
 const last=await observeTokenPinnedOriginAssets({...options,minimumContextSlot:first.finalTokenContextSlot},fetcher);assert.equal(last.assetDataSHA256,first.assetDataSHA256);assert.equal(last.tokenCode.programDataSHA256,first.tokenCode.programDataSHA256);assert(last.finalTokenContextSlot>=first.finalTokenContextSlot);
 proof.checks.push('Fresh composed observation after rejected selections retains exact origin assets and token code; read-only RPC methods only');
 proof.observation=last;proof.rpcReads=calls.length;proof.rpcMethodCounts=Object.fromEntries([...new Set(calls)].map(m=>[m,calls.filter(v=>v===m).length]));proof.state='passed';proof.completedAt=new Date().toISOString();save();
}catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
