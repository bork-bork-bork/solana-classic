// Exact native balance metadata from raw RPC JSON. Node24's reviver source
// preserves the original digits before any Number rounding. No RPC or writes.
const U64=(1n<<64n)-1n;
let supported=false;
JSON.parse('[9007199254740993]',function(k,v,context){if(k==='0')supported=context?.source==='9007199254740993';return v;});

export function parseNativeTransactionRPC(raw) {
  if(!supported)throw new Error('Node24 raw JSON number source support is required');
  if(typeof raw!=='string'||raw.length>65536)throw new Error('Bounded raw RPC JSON required');
  const digits=new WeakMap();
  const decoded=JSON.parse(raw,function(k,v,context){
    if(Array.isArray(this)&&typeof v==='number'){
      let values=digits.get(this);if(!values){values=new Map();digits.set(this,values);}
      values.set(k,context?.source);
    }
    return v;
  });
  const meta=decoded?.result?.meta;
  if(meta==null)return decoded; // Null/pruned transaction remains unresolved.
  for(const field of ['preBalances','postBalances']){
    const array=meta[field],sources=digits.get(array);
    if(!Array.isArray(array)||array.length<1||array.length>256||!sources)throw new Error('Invalid native balance metadata');
    meta[field]=array.map((v,i)=>{
      const source=sources.get(String(i));
      if(typeof v!=='number'||typeof source!=='string'||source.length>20||! /^(0|[1-9][0-9]*)$/.test(source))throw new Error('Canonical native u64 JSON numbers required');
      const n=BigInt(source);if(n>U64)throw new Error('Native balance exceeds u64');return n;
    });
  }
  if(meta.preBalances.length!==meta.postBalances.length)throw new Error('Native metadata account counts differ');
  return decoded;
}
