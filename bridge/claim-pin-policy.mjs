// Pure private-claim pin binding. No keys, RPC, signing, storage or broadcast.
import {createHash} from 'node:crypto';
import {normalizeProgramPins} from './program-pins.mjs';
const SCOPE='isolated-claim-pins-v1';
const hash=v=>createHash('sha256').update('solana-classic/private-claim-pins/v1\0').update(JSON.stringify(v)).digest('hex');
export function claimPinPolicy({source,destination},event,originMint=null){
  source=normalizeProgramPins(source);destination=normalizeProgramPins(destination);
  for(const [pins,genesis,remoteGenesis,program,remoteProgram,side] of [
    [source,event.sourceChain,event.destinationChain,event.sourceProgram,event.destinationProgram,event.direction],
    [destination,event.destinationChain,event.sourceChain,event.destinationProgram,event.sourceProgram,1-event.direction]]){
    if(pins.genesis!==genesis||pins.remoteGenesis!==remoteGenesis||pins.program!==program||pins.remoteProgram!==remoteProgram||pins.side!==side||pins.bridge!==event.bridge)throw new Error('Programme pins differ from the signed claim domain');
  }
  if(source.originMint!==destination.originMint||originMint!==null&&source.originMint!==originMint)throw new Error('Original mint differs from both programme pins');
  const selected={schemaVersion:1,scope:SCOPE,source,destination};
  return Object.freeze({...selected,sha256:hash(selected)});
}
export function checkedClaimPinPolicy(policy,event,originMint){
  if(!policy||Object.keys(policy).length!==5||Object.keys(policy).some(k=>!['schemaVersion','scope','source','destination','sha256'].includes(k))||policy.schemaVersion!==1||policy.scope!==SCOPE)throw new Error('Exact private claim-pin policy required');
  const expected=claimPinPolicy(policy,event,originMint);
  if(policy.sha256!==expected.sha256)throw new Error('Private claim-pin digest changed');
  return expected;
}
export function checkClaimPinObservations(policy,event,record,source,destination){
  for(const [observation,pins,minimum] of [[source,policy.source,record.sourceContextSlot],[destination,policy.destination,record.minimumDestinationSlot]]){
    for(const key of ['genesis','remoteGenesis','program','remoteProgram','bridge','originMint','side','elfSHA256','elfBytes','programDataSHA256','upgradeAuthority','policySHA256'])if(observation?.[key]!==pins[key])throw new Error('Observed programme differs from the journal pin');
    if(observation.state!=='PINNED_PRIVATE_OBSERVATION'||observation.observations!==2||!Number.isSafeInteger(observation.contextSlot)||observation.contextSlot<minimum||observation.epoch!==event.epoch.toString()||observation.originDecimals!==record.originDecimals||observation.nativeDecimals!==9||observation.settlementPaused!==false||!Array.isArray(observation.committee)||observation.committee.length!==5||new Set(observation.committee).size!==5||record.committee.some(k=>!observation.committee.includes(k)))throw new Error('Observed precision,epoch,quorum,pause or checkpoint differs from the signed claim');
  }
  if(JSON.stringify([...source.committee].sort())!==JSON.stringify([...destination.committee].sort()))throw new Error('Private source/destination committee differs');
}
