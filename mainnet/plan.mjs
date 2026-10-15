// Read-only genesis planning. This module never creates keys, starts validators,
// writes a ledger, submits transactions or activates a production network.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PublicKey } from '@solana/web3.js';

const U64=(1n<<64n)-1n;
const upstream='f516a8927c76c07f0ebc54ca7a4ce8b2046eee86';
const forbiddenGenesis=new Set(['7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY']);
function units(value,name){
  if(typeof value!=='string'||! /^(0|[1-9][0-9]*)$/.test(value))throw new Error(name+' must be an exact base-unit integer string');
  const n=BigInt(value);if(n>U64)throw new Error(name+' exceeds u64');return n;
}
function address(value,name){try{if(typeof value!=='string')throw 0;const parsed=new PublicKey(value).toBase58();if(parsed!==value||parsed==='11111111111111111111111111111111')throw 0;return parsed;}catch{throw new Error(name+' needs a canonical nonzero public address');}}

export function planGenesis(input){
  if(input?.schemaVersion!==1||input.environment!=='isolated-rehearsal')throw new Error('Only isolated rehearsal planning is supported');
  if(input.runtimeSource!==upstream)throw new Error('Pinned Agave source commit mismatch');
  if(input.inflation!=='none'||input.nativeDecimals!==9)throw new Error('Native units are fixed at nine decimals; independent inflation is prohibited');
  if(!Number.isInteger(input.originDecimals)||input.originDecimals<0||input.originDecimals>9)throw new Error('Origin precision is missing or unsupported');
  const factor=10n**BigInt(9-input.originDecimals);
  const supply=units(input.originSupplyUnits,'originSupplyUnits');
  const locked=units(input.prelockedOriginUnits,'prelockedOriginUnits');
  if(supply===0n||locked>supply||supply*factor>U64)throw new Error('Supply/backing is invalid or overflows native units');
  const reserve=address(input.reserveAddress,'reserveAddress');
  const mint=address(input.originMint,'originMint');
  if(reserve===mint)throw new Error('Mint and reserve must be distinct');
  if(!Array.isArray(input.validators)||input.validators.length!==3)throw new Error('Exactly three fresh rehearsal validators are supported');
  const seen=new Set([reserve,mint]);const operators=new Set();let bootstrap=0n;
  const validators=input.validators.map((v,i)=>{
    if(typeof v.operator!=='string'||!v.operator.trim())throw new Error('Distinct declared validator labels are required');
    const operator=v.operator.trim();if(operators.has(operator))throw new Error('Distinct declared validator labels are required');operators.add(operator);
    const keys=['identity','vote','stake'].map(key=>{
      const a=address(v[key],`validator${i}.${key}`);if(seen.has(a))throw new Error('Duplicate genesis account');seen.add(a);return a;
    });
    const balance=units(v.balanceUnits,'balanceUnits');const stake=units(v.stakeUnits,'stakeUnits');
    if(balance===0n||stake===0n)throw new Error('Bootstrap funding and stake must be nonzero and backed');
    bootstrap+=balance+stake;
    if(!Number.isInteger(v.rpcPort)||v.rpcPort<1024||v.rpcPort>65534)throw new Error('Invalid rehearsal RPC port');
    return {operator,identity:keys[0],vote:keys[1],stake:keys[2],balanceUnits:String(balance),stakeUnits:String(stake),rpcPort:v.rpcPort};
  });
  const ports=new Set();for(const v of validators)for(const port of [v.rpcPort,v.rpcPort+1]){if(ports.has(port))throw new Error('RPC/WebSocket port collision');ports.add(port);}
  const systemBudget=units(input.systemAccountBudgetUnits,'systemAccountBudgetUnits');
  const allocated=bootstrap+systemBudget;
  const protection=input.protectedReserveNativeUnits===undefined?0n:units(input.protectedReserveNativeUnits,'protectedReserveNativeUnits');
  if(allocated+protection>locked*factor)throw new Error('Unbacked bootstrap balances, stakes, system-account funding or protected reserve');
  if(allocated>=supply*factor)throw new Error('No native reserve remains');
  if(input.expectedGenesis!==undefined){
    const genesis=address(input.expectedGenesis,'expectedGenesis');
    if(forbiddenGenesis.has(genesis))throw new Error('Existing devnet or public-chain genesis must not be reused');
  }
  return {schemaVersion:2,state:'DRAFT_REHEARSAL_PLAN',deploymentEnabled:false,
    runtimeSource:upstream,clusterClassification:'development',inflation:'none',originMint:mint,
    originDecimals:input.originDecimals,nativeDecimals:9,totalNativeUnits:String(supply*factor),
    prelockedOriginUnits:String(locked),bootstrapAndSystemUnits:String(allocated),
    declaredProtectedReserveNativeUnits:protection.toString(),minimumPrelockedOriginUnits:((allocated+protection+factor-1n)/factor).toString(),
    reserve:{address:reserve,nativeUnits:String(supply*factor-allocated)},validators,
    expectedGenesis:input.expectedGenesis??null,
    execution:{enabled:false,commandGenerationEnabled:false,
      preparationEntryPoint:'mainnet/prepare-consensus.py',rehearsalEntryPoint:'mainnet/consensus.py',
      requiredReviewedInputs:['Capable host and exact runtime artifacts','Fresh hashing genesis with complete account inventory','Verified slot-zero bank hash and shred version','Owner-only fresh rehearsal keys','Explicit private preparation and run acknowledgments'],
      independentOperatorsVerified:false,productionActivationEnabled:false},
    requiredBeforeGenesis:['Provide the checksum-verified genesis, keygen, validator and ledger tooling from the pinned source.',
      'Verify original mint supply, immutable authorities and allowed Token-2022 extensions.',
      'Reconcile every actual genesis account and native unit against the planned budget.',
      'Run mainnet/bootstrap.mjs on the actual inventory, including protected vault rent and precision slack.',
      'Verify finalized original-SOC backing before any allocated native units become spendable.',
      'Apply and review backed genesis bootstrap accounting; ordinary zero initialization cannot activate production.',
      'Provide bootstrap/entrypoint networking and validator-specific private credentials locally.'],
    productionBlockers:['Independent operator verification and consensus/recovery tests',
      'Approved supply, bootstrap backing, fee/burn and validator-incentive policy',
      'Reviewed reserve/escrow custody, upgrade authority and verifier committee',
      'Independent bridge security review and emergency/recovery drills',
      'Explicit production release decision'],
  };
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{if(process.argv.length!==3)throw new Error('Usage: node mainnet/plan.mjs <public-rehearsal-input.json>');
    console.log(JSON.stringify(planGenesis(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
