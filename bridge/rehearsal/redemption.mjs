// New synthetic original redemption operation on retained private ledgers only. The original redemption
// journal is persisted before one broadcast; fault harness withholds client
// confirmation, interrupts the private destination RPC, then reconciles.
import { readFileSync, writeFileSync, mkdirSync, openSync, fsyncSync, closeSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID as TOKEN } from '@solana/spl-token';
import { observeLocalEvent, originClaimInstruction, PUBLIC_GENESIS } from './sdk.mjs';
import { preparePendingClaim, takeSubmissionAttempt, reconcilePendingClaim } from './pending-claim.mjs';
const root='/data/bridge-redemption-v1', source='/data/bridge-rehearsal-v1';
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
const tokens=getAssociatedTokenAddressSync(mint,user.publicKey,false,TOKEN);
const escrow=PublicKey.findProgramAddressSync([Buffer.from('escrow'),origin.config.toBuffer()],origin.program)[0];
let proof=phase==='submit'?{schemaVersion:1,scope:'Actual private Agave ledgers and synthetic co-signers; one new native return/original redemption, withheld client confirmation, real destination RPC outage and same-signature recovery',state:'running',startedAt:new Date().toISOString(),genesi:manifest.genesi,canonicalNetworkChanged:false,productionReady:false,checks:[],claimBroadcasts:0,kind:'origin-redemption'}:JSON.parse(readFileSync(root+'/public-result.json'));
const save=()=>writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2));
const pass=name=>{proof.checks.push(name);save();console.log('PASS '+name);};
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
async function admit(s){assert.equal(await s.connection.getGenesisHash(),s.genesis);}
async function counters(){const values=[];for(const s of sides){await admit(s);const a=await s.connection.getAccountInfo(s.config,'finalized');assert(a.owner.equals(s.program));values.push(a.data.readBigUInt64LE(a.data.length-8));}return values;}
try {
  save();
  if(phase==='submit') {
    assert.deepEqual(await counters(),[700_000n,700_000n]);
    mkdirSync(root+'/journal',{mode:0o700});
    const address=PublicKey.findProgramAddressSync([Buffer.from('event'),native.config.toBuffer(),recipient.publicKey.toBuffer(),u64(4n)],native.program)[0];
    const lock=new TransactionInstruction({programId:native.program,keys:[meta(recipient.publicKey,true,true),meta(native.config,true),meta(native.vault,true),meta(address,true),meta(SystemProgram.programId)],data:Buffer.concat([Buffer.from([1]),u64(100_000n),u64(4n),user.publicKey.toBuffer()])});
    await admit(native);const latest=await native.connection.getLatestBlockhash('finalized');
    const tx=new Transaction({feePayer:payer.publicKey,...latest}).add(lock);tx.sign(payer,recipient);
    // Retain exact signed source bytes before a single source broadcast. A
    // failed attempt is not rerun; no new nonce is automatically generated.
    const sourceFile=openSync(root+'/source-private.json','wx',0o600);try{writeFileSync(sourceFile,JSON.stringify({raw:tx.serialize().toString('base64'),signatureHex:tx.signature.toString('hex'),blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,state:'ATTEMPT_AUTHORIZED'}));fsyncSync(sourceFile);}finally{closeSync(sourceFile);}
    const sourceDirectory=openSync(root,'r');try{fsyncSync(sourceDirectory);}finally{closeSync(sourceDirectory);}
    await admit(native);const sourceSignature=await native.connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:0});proof.sourceSignature=sourceSignature;save();
    const finalized=await native.connection.confirmTransaction({...latest,signature:sourceSignature},'finalized');assert.equal(finalized.value.err,null);
    const expected={bridge:bridge.toBase58(),sourceChain:native.genesis,destinationChain:origin.genesis,sourceProgram:native.program.toBase58(),destinationProgram:origin.program.toBase58(),recipient:user.publicKey.toBase58(),epoch:1n,direction:1};
    const observed=await observeLocalEvent({rpc:native.connection.rpcEndpoint,expectedGenesis:native.genesis,eventAddress:address.toBase58(),expected});
    assert.equal(observed.event.originAmount,100_000n);assert.deepEqual(await counters(),[700_000n,600_000n]);pass('new synthetic native return finalized; original redemption remains pending');
    await admit(origin);const recent=await origin.connection.getLatestBlockhash('finalized');
    const claim=new Transaction({feePayer:payer.publicKey,...recent}).add(originClaimInstruction({event:observed.event,expected,payer:payer.publicKey,committee:members.map(m=>m.publicKey),mint,destinationToken:tokens}));claim.sign(payer,...members);
    const journal=preparePendingClaim({directory:root+'/journal',sourceRpc:native.connection.rpcEndpoint,rpc:origin.connection.rpcEndpoint,event:observed.event,expected,payer:payer.publicKey,committee:members.map(m=>m.publicKey),transaction:claim.serialize(),lastValidBlockHeight:recent.lastValidBlockHeight,originDecimals:6,sourceContextSlot:observed.contextSlot,minimumDestinationSlot:await origin.connection.getSlot('finalized'),originMint:mint,destinationToken:tokens});
    proof.operation=journal;save();pass('exact fully signed original redemption persisted in a private receipt-keyed journal');
    const attempt=await takeSubmissionAttempt(root+'/journal',journal.id);
    proof.operationStateBeforeBroadcast='SUBMISSION_ATTEMPTED';save();
    const signature=await origin.connection.sendRawTransaction(attempt.rawTransaction,{skipPreflight:false,maxRetries:0});assert.equal(signature,attempt.signature);
    proof.claimBroadcasts=1;proof.claimSignature=signature;proof.clientConfirmationWithheld=true;save();pass('one original redemption broadcast; client journal deliberately remains awaiting confirmation');
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
    proof.operation=result;pass('original signature, finalized receipt, exact bytes and 100000-unit original-token debit and credit reconciled');
    assert.deepEqual(await counters(),[600_000n,600_000n]);proof.reconciliation={originOutstandingUnits:'600000',nativeOutstandingOriginUnits:'600000',redeemedOriginUnits:'100000',returnedNativeUnits:'100000000'};
    const accounts=await origin.connection.getMultipleAccountsInfo([escrow,tokens],'finalized');assert.equal(accounts[0].data.readBigUInt64LE(64),600_000n);assert.equal(accounts[1].data.readBigUInt64LE(64),1_400_000n);proof.reconciliation.originEscrowUnits='600000';proof.reconciliation.originUserUnits='1400000';
    pass('both bridge counters reconcile after recovery; no replacement claim or fresh signatures');
    proof.state='passed';proof.completedAt=new Date().toISOString();save();
  }
} catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
