// Disposable synthetic test keys only; never print or publish their bytes.
import { mkdtempSync, realpathSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { encodeEvent, nativeClaimInstruction, originClaimInstruction, originalTokenAddress, TOKEN_2022 } from '../sdk.mjs';
export function fixture(t,direction=0) {
  const directory=realpathSync(mkdtempSync(join(tmpdir(),'sc-bridge-journal-')));chmodSync(directory,0o700);t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const k=()=>Keypair.generate(), payer=k(), committee=[k(),k(),k()], sender=k(), recipient=k();
  const e={bridge:k().publicKey.toBase58(),sourceChain:k().publicKey.toBase58(),destinationChain:k().publicKey.toBase58(),sourceProgram:k().publicKey.toBase58(),destinationProgram:k().publicKey.toBase58(),sender:sender.publicKey.toBase58(),recipient:recipient.publicKey.toBase58(),originAmount:1_000_000n,nonce:1n,slot:10n,epoch:1n,direction};
  const cfg=PublicKey.findProgramAddressSync([Buffer.from('config'),new PublicKey(e.bridge).toBuffer()],new PublicKey(e.sourceProgram))[0];const nonce=Buffer.alloc(8);nonce.writeBigUInt64LE(e.nonce);e.sourceEvent=PublicKey.findProgramAddressSync([Buffer.from('event'),cfg.toBuffer(),sender.publicKey.toBuffer(),nonce],new PublicKey(e.sourceProgram))[0].toBase58();
  const originMint=k().publicKey, destinationToken=originalTokenAddress(originMint,e.recipient);
  const ix=direction===0?nativeClaimInstruction({event:e,expected:e,payer:payer.publicKey,committee:committee.map(k=>k.publicKey)}):originClaimInstruction({event:e,expected:e,payer:payer.publicKey,committee:committee.map(k=>k.publicKey),mint:originMint,destinationToken});
  const tx=new Transaction({feePayer:payer.publicKey,recentBlockhash:k().publicKey.toBase58()}).add(ix);tx.sign(payer,...committee);
  const args={directory,sourceRpc:'http://127.0.0.1:8899',rpc:'http://127.0.0.1:9900',event:e,expected:e,payer:payer.publicKey,committee:committee.map(k=>k.publicKey),transaction:tx.serialize(),lastValidBlockHeight:100,originDecimals:6,originMint:direction===1?originMint:null,destinationToken:direction===1?destinationToken:null,sourceContextSlot:20,minimumDestinationSlot:0};
  const config=Buffer.alloc(382);config.write('SCCFG001');for(const [o,v] of [[8,e.bridge],[40,e.destinationChain],[72,e.sourceChain],[104,e.sourceProgram]])new PublicKey(v).toBuffer().copy(config,o);committee.forEach((k,i)=>k.publicKey.toBuffer().copy(config,168+i*32));config[328]=6;config[329]=9;config[330]=1-direction;originMint.toBuffer().copy(config,136);config[331]=3;config.writeBigUInt64LE(1n,332);
  const mintBytes=Buffer.alloc(82);mintBytes.writeBigUInt64LE(3_000_000n,36);mintBytes[44]=6;mintBytes[45]=1;
  const tokenBytes=(owner,amount)=>{const b=Buffer.alloc(170);originMint.toBuffer().copy(b);owner.toBuffer().copy(b,32);b.writeBigUInt64LE(amount,64);b[108]=1;b[165]=2;b.writeUInt16LE(7,166);return b;};
  let mode='pending';const calls=[];
  const fetcher=async(url,options)=>{
    const q=JSON.parse(options.body);calls.push(q);
    if(mode==='outage')throw new Error('unavailable');
    const source=new URL(url).port==='8899';let result;
    if(q.method==='getGenesisHash')result=mode==='wrongGenesis'?'wrong':source?e.sourceChain:e.destinationChain;
    else if(q.method==='getBlockHeight')result=mode==='expired'?101:50;
    else if(q.method==='getAccountInfo') {
      const value=source?{owner:e.sourceProgram,executable:false,data:[encodeEvent(mode==='changedSource'?{...e,originAmount:e.originAmount+1n}:e).toString('base64'),'base64']}:q.params[0]===ix.keys[1].pubkey.toBase58()?{owner:e.destinationProgram,executable:false,data:[config.toString('base64'),'base64']}:['finalized','pruned','conflict','badBalance','wrongTokenMint','missingTokenMetadata','fractionalTokenBalance','hiddenNativeTransfer'].includes(mode)?{owner:e.destinationProgram,executable:false,data:[new PublicKey(mode==='conflict'?e.sender:e.sourceEvent).toBuffer().toString('base64'),'base64']}:null;
      result={context:{slot:mode==='stale'?0:source?30:50},value};
    } else if(q.method==='getMultipleAccounts') {
      const m=Buffer.from(mintBytes), escrow=tokenBytes(ix.keys[2].pubkey,2_000_000n), dst=tokenBytes(new PublicKey(e.recipient),1_000_000n);
      if(mode==='mutableMint')m.writeUInt32LE(1,0);if(mode==='frozenAccount')dst[108]=2;if(mode==='delegateAccount')dst.writeUInt32LE(1,72);if(mode==='wrongOwner')payer.publicKey.toBuffer().copy(dst,32);
      result={context:{slot:50},value:[m,escrow,dst].map(b=>({owner:TOKEN_2022,executable:false,data:[b.toString('base64'),'base64']}))};
    } else if(q.method==='getSignatureStatuses')result={context:{slot:50},value:['finalized','pruned','badBalance','wrongTokenMint','missingTokenMetadata','fractionalTokenBalance','hiddenNativeTransfer'].includes(mode)?[{slot:45,err:null,confirmationStatus:'finalized'}]:[null]};
    else if(q.method==='getTransaction') {
      if(mode==='pruned')result=null;
      else {const keys=tx.compileMessage().accountKeys,pre=keys.map(()=>100_000_000),post=[...pre];const recipientIndex=keys.findIndex(k=>k.toBase58()===e.recipient),vaultIndex=keys.findIndex(k=>k.equals(ix.keys[2].pubkey));pre[vaultIndex]=2_000_000_000;post[vaultIndex]=1_000_000_000;post[recipientIndex]+=mode==='badBalance'?999:1_000_000_000;const entry=(index,owner,amount)=>({accountIndex:index,mint:originMint.toBase58(),owner:owner.toBase58(),programId:TOKEN_2022,uiTokenAmount:{decimals:6,amount:amount.toString()}});
        const metadata={err:null,preBalances:pre,postBalances:post};
        if(direction===1){post[recipientIndex]=pre[recipientIndex];post[vaultIndex]=pre[vaultIndex];if(mode==='hiddenNativeTransfer')post[vaultIndex]-=1;const escrowIndex=keys.findIndex(k=>k.equals(ix.keys[6].pubkey)),dstIndex=keys.findIndex(k=>k.equals(ix.keys[7].pubkey));metadata.preTokenBalances=[entry(escrowIndex,ix.keys[2].pubkey,2_000_000n),entry(dstIndex,new PublicKey(e.recipient),1_000_000n)];metadata.postTokenBalances=[entry(escrowIndex,ix.keys[2].pubkey,1_000_000n),entry(dstIndex,new PublicKey(e.recipient),mode==='badBalance'?1_000_999n:2_000_000n)];if(mode==='wrongTokenMint')metadata.postTokenBalances[1].mint=payer.publicKey.toBase58();if(mode==='missingTokenMetadata')delete metadata.preTokenBalances;if(mode==='fractionalTokenBalance')metadata.postTokenBalances[1].uiTokenAmount.amount='2000000.5';}
        result={slot:45,meta:metadata,transaction:[args.transaction.toString('base64'),'base64']};}
    } else throw new Error('Unexpected mutation or method');
    return {ok:true,text:async()=>JSON.stringify({jsonrpc:'2.0',id:1,result})};
  };
  return {directory,args,e,tx,ix,payer,committee,fetcher,calls,mode:v=>{mode=v;},record:id=>JSON.parse(readFileSync(join(directory,id+'.json')))};
}
