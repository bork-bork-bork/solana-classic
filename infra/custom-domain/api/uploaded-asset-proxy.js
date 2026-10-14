// Public immutable artwork only. No arbitrary origin, method, headers or paths.
const origin='https://image-assets-production.up.railway.app';
export function allowedPath(request){
  const url=new URL(request.url,'https://solanaclassic.net');
  const path=url.searchParams.get('path');
  return request.method==='GET'&&[...url.searchParams].length===1&&/^[a-f0-9]{64}\/(metadata\.json|image\.png)$/.test(path??'')?path:null;
}
export default async function handler(request,response){
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
  const path=allowedPath(request);if(!path){response.statusCode=404;return response.end();}
  try{
    const upstream=await fetch(origin+'/assets/'+path,{headers:{Origin:'https://solanaclassic.net'},redirect:'error',signal:AbortSignal.timeout(10000)});
    const image=path.endsWith('.png'),type=image?'image/png':'application/json';
    if(!upstream.ok||!upstream.headers.get('content-type')?.includes(type)||!upstream.body){response.statusCode=upstream.status===404?404:502;return response.end();}
    const chunks=[];let size=0;const reader=upstream.body.getReader();
    while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>(image?2097152:24576)){await reader.cancel();throw Error('Artwork limit exceeded');}chunks.push(next.value);}
    const body=Buffer.concat(chunks);
    if(image&&!body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid PNG');
    if(!image)JSON.parse(body.toString('utf8'));
    response.setHeader('Content-Type',type);response.setHeader('Cache-Control','public,max-age=31536000,immutable');response.end(body);
  }catch{response.statusCode=503;response.end();}
}
