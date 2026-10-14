const gateway='https://network-release-production.up.railway.app';
export default async function handler(request,response){
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
  const url=new URL(request.url,'https://solanaclassic.net');const path=url.searchParams.get('path');
  if(request.method!=='GET'||[...url.searchParams].length!==1||!/^([a-f0-9]{64})\/(metadata\.json|image\.svg)$/.test(path??'')){response.statusCode=404;return response.end();}
  try{
    const upstream=await fetch(gateway+'/assets/'+path,{headers:{Origin:'https://solana-classic-soc.vercel.app'},redirect:'error',signal:AbortSignal.timeout(10000)});
    const type=path.endsWith('.svg')?'image/svg+xml':'application/json';
    if(!upstream.ok||!upstream.headers.get('content-type')?.includes(type)||!upstream.body){response.statusCode=upstream.status===404?404:502;return response.end();}
    const chunks=[];let size=0;const reader=upstream.body.getReader();
    while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>24576){await reader.cancel();throw Error('Asset bound exceeded');}chunks.push(next.value);}
    response.setHeader('Content-Type',type);response.setHeader('Cache-Control','public,max-age=31536000,immutable');response.end(Buffer.concat(chunks));
  }catch{response.statusCode=503;response.end();}
}
