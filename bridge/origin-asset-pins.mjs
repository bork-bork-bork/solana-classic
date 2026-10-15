// Select complete previously reviewed fixture pins; never learn them from RPC.
import {normalizeProgramPins} from './program-pins.mjs';
const fields=['genesis','remoteGenesis','program','remoteProgram','bridge','originMint','side','upgradeAuthority','elfSHA256','elfBytes','programDataSHA256','policySHA256'];
export function originAssetPinsFromReview(reviewed){
 if(reviewed?.state!=='passed'||reviewed.realLedgerPinnedJournalIntegration!==true||reviewed.processes?.allStopped!==true||reviewed.sourceBroadcasts!==2||reviewed.claimBroadcasts!==2||reviewed.globalBacking?.actualGenesisBackingVerified!==false||!Array.isArray(reviewed.genesi)||reviewed.genesi.length!==2||!Array.isArray(reviewed.pinAdmissions)||reviewed.pinAdmissions.length!==2)throw new Error('Complete stopped private pinned-journal review required');
 const admissions=reviewed.pinAdmissions.filter(a=>a.direction===0);if(admissions.length!==1)throw new Error('One reviewed origin admission required');
 const {source,destination}=admissions[0];
 if(!source||!destination||source.state!=='PINNED_PRIVATE_OBSERVATION'||destination.state!=='PINNED_PRIVATE_OBSERVATION'||source.observations!==2||destination.observations!==2)throw new Error('Complete two-sided historical pin observations required');
 const pins=normalizeProgramPins(Object.fromEntries(fields.map(k=>[k,source[k]])));
 const remote=normalizeProgramPins(Object.fromEntries(fields.map(k=>[k,destination[k]])));
 if(pins.side!==0||remote.side!==1||pins.genesis!==reviewed.genesi[0]||pins.remoteGenesis!==reviewed.genesi[1]||remote.genesis!==pins.remoteGenesis||remote.remoteGenesis!==pins.genesis||pins.remoteProgram!==remote.program||remote.remoteProgram!==pins.program||pins.bridge!==remote.bridge||pins.originMint!==remote.originMint||source.originDecimals!==destination.originDecimals||source.nativeDecimals!==9||destination.nativeDecimals!==9||source.epoch!==destination.epoch)throw new Error('Reviewed origin and remote identity, precision or epoch differs');
 if(!Number.isSafeInteger(source.contextSlot)||source.contextSlot<1||!Number.isInteger(source.originDecimals)||source.originDecimals<0||source.originDecimals>9)throw new Error('Retained origin checkpoint and precision required');
 return {pins,minimumContextSlot:source.contextSlot,originDecimals:source.originDecimals};
}
