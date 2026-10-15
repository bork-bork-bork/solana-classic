// Pure selection from previously reviewed private-fixture evidence; no RPC.
import {PublicKey} from '@solana/web3.js';
import {normalizeProgramPins} from './program-pins.mjs';
import {originAssetPinsFromReview} from './origin-asset-pins.mjs';
const fields=['genesis','remoteGenesis','program','remoteProgram','bridge','originMint','side','upgradeAuthority','elfSHA256','elfBytes','programDataSHA256','policySHA256'];
const units=v=>{if(typeof v!=='string'||v.length>20||! /^(0|[1-9][0-9]*)$/.test(v)||BigInt(v)>(1n<<64n)-1n)throw new Error('Exact reviewed fixture units required');return BigInt(v);};
export function nativeReserveInputFromReview(pinsReview,originReview,bootstrapReview){
 const origin=originAssetPinsFromReview(pinsReview),native=pinsReview.pinAdmissions.find(a=>a.direction===0).destination;
 const pins=normalizeProgramPins(Object.fromEntries(fields.map(k=>[k,native[k]])));
 if(pins.side!==1||!Number.isSafeInteger(native.contextSlot)||native.contextSlot<1)throw new Error('Reviewed native side and checkpoint required');
 if(originReview?.state!=='passed'||originReview.processes?.allStopped!==true||originReview.broadcasts!==0||originReview.simulations!==0||originReview.observation?.state!=='PINNED_ORIGIN_ASSET_SNAPSHOT'||originReview.observation.genesis!==origin.pins.genesis||originReview.observation.program!==origin.pins.program||originReview.observation.mint!==pins.originMint||originReview.observation.originDecimals!==origin.originDecimals||originReview.observation.mintAuthoritiesRevoked!==true||originReview.observation.programmePinsVerified!==true)throw new Error('Matching stopped immutable origin-asset review required');
 if(bootstrapReview?.state!=='passed'||bootstrapReview.processes?.allStopped!==true||bootstrapReview.globalBacking?.actualGenesisBackingVerified!==false||JSON.stringify(bootstrapReview.genesi)!==JSON.stringify(pinsReview.genesi)||bootstrapReview.mint!==pins.originMint)throw new Error('Matching stopped synthetic bootstrap review required');
 const r=bootstrapReview.reconciliation,supply=units(originReview.observation.mintSupplyUnits),locked=units(r?.initialPrelockOriginUnits),floor=units(r?.protectedFloorNativeUnits),total=units(bootstrapReview.globalBacking.hypotheticalNativeBudgetUnits),factor=10n**BigInt(9-origin.originDecimals),outside=locked*factor-floor;
 if(supply===0n||locked===0n||locked>supply||total!==supply*factor||outside<0n||outside>=total||r.originDecimals!==origin.originDecimals||r.nativeDecimals!==9||typeof r.bootstrapInventorySHA256!=='string'||! /^[0-9a-f]{64}$/.test(r.bootstrapInventorySHA256))throw new Error('Reviewed synthetic bootstrap budget or precision differs');
 const config=PublicKey.findProgramAddressSync([Buffer.from('config'),new PublicKey(pins.bridge).toBuffer()],new PublicKey(pins.program))[0],record=PublicKey.findProgramAddressSync([Buffer.from('bootstrap'),config.toBuffer()],new PublicKey(pins.program))[0].toBase58();
 if(record!==r.bootstrapRecord||typeof r.bootstrapReceipt!=='string'||new PublicKey(r.bootstrapReceipt).toBase58()!==r.bootstrapReceipt)throw new Error('Reviewed bootstrap PDA and receipt required');
 return {pins,originDecimals:origin.originDecimals,minimumContextSlot:native.contextSlot,bootstrap:{originSupplyUnits:supply.toString(),totalNativeUnits:total.toString(),outsideNativeUnits:outside.toString(),initialReserveNativeUnits:(total-outside).toString(),originAmount:locked.toString(),protectedNativeUnits:floor.toString(),inventorySHA256:r.bootstrapInventorySHA256,receipt:r.bootstrapReceipt}};
}
