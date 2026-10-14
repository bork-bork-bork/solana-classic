// New synthetic operation on retained private ledgers only. The native claim
// journal is persisted before one broadcast; fault harness withholds client
// confirmation, interrupts the private destination RPC, then reconciles.
import { readFileSync, writeFileSync, mkdirSync, openSync, fsyncSync, closeSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID as TOKEN } from '@solana/spl-token';
import { observeLocalEvent, nativeClaimInstruction, PUBLIC_GENESIS } from './sdk.mjs';
import { preparePendingClaim, takeSubmissionAttempt, reconcilePendingClaim } from './pending-claim.mjs';
const root='/data/bridge-pending-v1', source='/data/bridge-rehearsal-v1';
const manifest=JSON.parse(readFileSync(source+'/private-input.json'));
const earlier=JSON.parse(readFileSync(source+'/public-result.json'));
assert.equal(earlier.state,'passed');assert.deepEqual(manifest.genesi,earlier.genesi);
assert(manifest.genesi.every(g=>!PUBLIC_GENESIS.has(g)&&g!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'));
const phase=process.argv[2];assert(['submit','outage','recover'].includes(phase));
const fixtureKey=n=>Keypair.fromSecretKey(Uint8Array.from(manifest.keys[n]));
const payer=fixtureKey('payer'),user=fixtureKey('originUser'),recipient=fixtureKey('nativeUser');
const members=[0,1,2].map(i=>fixtureKey('committee'+i));
const mint=new PublicKey(earlier.mint),bridge=new PublicKey(manifest.bridge);
const sides=[0,1].map(i=>({i,genesis:manifest.genesi[i],program:new PublicKey(manifest.programs[i]),connection:new Connection('http://127.0.0.1:'+manifest.ports[i],'finalized')}));
for(const s of sides){s.config=PublicKey.findProgramAddressSync([Buffer.from('config'),bridge.toBuffer()],s.program)[0];s.vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),s.config.toBuffer()],s.program)[0];}
const [origin,native]=sides;
let proof=phase==='submit'?{schemaVersion:1,scope:'Actual private Agave ledgers and synthetic co-signers; one new lock/claim, withheld client confirmation, real destination RPC outage and same-signature recovery',state:'running',startedAt:new Date().toISOString(),genesi:manifest.genesi,canonicalNetworkChanged:false,productionReady:false,checks:[],claimBroadcasts:0}:JSON.parse(readFileSync(root+'/public-result.json'));
const save=()=>writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2));
const pass=name=>{proof.checks.push(name);save();console.log('PASS '+name);};
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
async function admit(s){assert.equal(await s.connection.getGenesisHash(),s.genesis);}
async function counters(){const values=[];for(const s of sides){await admit(s);const a=await s.connection.getAccountInfo(s.config,'finalized');assert(a.owner.equals(s.program));values.push(a.data.readBigUInt64LE(a.data.length-8));}return values;}
try {
  save();
  if(phase==='submit') {
    assert.deepEqual(await counters(),[600_000n,600_000n]);
    mkdirSync(root+'/journal',{mode:0o700});
    const tokens=getAssociatedTokenAddressSync(mint,user.publicKey,false,TOKEN);
    const escrow=PublicKey.findProgramAddressSync([Buffer.from('escrow'),origin.config.toBuffer()],origin.program)[0];
    const address=PublicKey.findProgramAddressSync([Buffer.from('event'),origin.config.toBuffer(),user.publicKey.toBuffer(),u64(3n)],origin.program)[0];
    const lock=new TransactionInstruction({programId:origin.program,keys:[meta(user.publicKey,true,true),meta(origin.config,true),meta(origin.vault,true),meta(address,true),meta(SystemProgram.programId),meta(tokens,true),meta(escrow,true),meta(mint),meta(TOKEN)],data:Buffer.concat([Buffer.from([1]),u64(100_000n),u64(3n),recipient.publicKey.toBuffer()])});
    await admit(origin);const latest=await origin.connection.getLatestBlockhash('finalized');
    const tx=new Transaction({feePayer:payer.publicKey,...latest}).add(lock);tx.sign(payer,user);
    // Retain exact signed source bytes before a single source broadcast. A
    // failed attempt is not rerun; no new nonce is automatically generated.
    const sourceFile=openSync(root+'/source-private.json','wx',0o600);try{writeFileSync(sourceFile,JSON.stringify({raw:tx.serialize().toString('base64'),signatureHex:tx.signature.toString('hex'),blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,state:'ATTEMPT_AUTHORIZED'}));fsyncSync(sourceFile);}finally{closeSync(sourceFile);}
    const sourceDirectory=openSync(root,'r');try{fsyncSync(sourceDirectory);}finally{closeSync(sourceDirectory);}
    await admit(origin);const sourceSignature=await origin.connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:0});proof.sourceSignature=sourceSignature;save();
    const finalized=await origin.connection.confirmTransaction({...latest,signature:sourceSignature},'finalized');assert.equal(finalized.value.err,null);
    const expected={bridge:bridge.toBase58(),sourceChain:origin.genesis,destinationChain:native.genesis,sourceProgram:origin.program.toBase58(),destinationProgram:native.program.toBase58(),recipient:recipient.publicKey.toBase58(),epoch:1n,direction:0};
    const observed=await observeLocalEvent({rpc:origin.connection.rpcEndpoint,expectedGenesis:origin.genesis,eventAddress:address.toBase58(),expected});
    assert.equal(observed.event.originAmount,100_000n);assert.deepEqual(await counters(),[700_000n,600_000n]);pass('new synthetic origin lock finalized; native release remains pending');
    await admit(native);const recent=await native.connection.getLatestBlockhash('finalized');
    const claim=new Transaction({feePayer:payer.publicKey,...recent}).add(nativeClaimInstruction({event:observed.event,expected,payer:payer.publicKey,committee:members.map(m=>m.publicKey)}));claim.sign(payer,...members);
    const journal=preparePendingClaim({directory:root+'/journal',sourceRpc:origin.connection.rpcEndpoint,rpc:native.connection.rpcEndpoint,event:observed.event,expected,payer:payer.publicKey,committee:members.map(m=>m.publicKey),transaction:claim.serialize(),lastValidBlockHeight:recent.lastValidBlockHeight,originDecimals:6,sourceContextSlot:observed.contextSlot,minimumDestinationSlot:await native.connection.getSlot('finalized')});
    proof.operation=journal;save();pass('exact fully signed claim persisted in a private receipt-keyed journal');
    const attempt=await takeSubmissionAttempt(root+'/journal',journal.id);
    proof.operationStateBeforeBroadcast='SUBMISSION_ATTEMPTED';save();
    const signature=await native.connection.sendRawTransaction(attempt.rawTransaction,{skipPreflight:false,maxRetries:0});assert.equal(signature,attempt.signature);
    proof.claimBroadcasts=1;proof.claimSignature=signature;proof.clientConfirmationWithheld=true;save();pass('one claim broadcast; client journal deliberately remains awaiting confirmation');
  } else if(phase==='outage') {
    await assert.rejects(reconcilePendingClaim(root+'/journal',proof.operation.id));
    await assert.rejects(takeSubmissionAttempt(root+'/journal',proof.operation.id));
    const record=JSON.parse(readFileSync(root+'/journal/'+proof.operation.id+'.json'));
    assert.equal(record.signature,proof.claimSignature);assert.equal(record.attempts,1);assert.equal(record.state,'SUBMISSION_ATTEMPTED');
    pass('actual destination RPC outage retains original signature and refuses a second attempt');
  } else {
    const result=await reconcilePendingClaim(root+'/journal',proof.operation.id);
    assert.equal(result.state,'FINALIZED');assert.equal(result.signature,proof.claimSignature);assert.equal(result.attempts,1);
    await assert.rejects(takeSubmissionAttempt(root+'/journal',proof.operation.id));
    proof.operation=result;pass('original signature, finalized receipt, exact bytes and 100000000-lamport economic movement reconciled');
    assert.deepEqual(await counters(),[700_000n,700_000n]);proof.reconciliation={originOutstandingUnits:'700000',nativeOutstandingOriginUnits:'700000',newClaimOriginUnits:'100000',newNativeUnits:'100000000'};
    pass('both bridge counters reconcile after recovery; no replacement claim or fresh signatures');
    proof.state='passed';proof.completedAt=new Date().toISOString();save();
  }
} catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
