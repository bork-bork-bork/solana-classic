import {getDocument,GlobalWorkerOptions,TextLayer} from '/pdf-reader/pdf.min.mjs';
GlobalWorkerOptions.workerSrc='/pdf-reader/pdf.worker.min.mjs';
const pages=document.querySelector('#pages'),status=document.querySelector('#status'),input=document.querySelector('#page-number');
let pdf,zoom=1,current=1,generation=0,queue=Promise.resolve(),baseSize,renderObserver,visibleObserver;
const states=[];
function message(value){status.textContent=value;}
function jump(n){if(!pdf||!Number.isInteger(n)||n<1||n>pdf.numPages){input.value=String(current);return;}current=n;input.value=String(n);states[n-1].node.scrollIntoView({block:'start'});}
async function render(state,epoch){if(!state.near||state.done||epoch!==generation)return;const page=await pdf.getPage(state.number);if(!state.near||epoch!==generation)return;
  const viewport=page.getViewport({scale:state.width/baseSize.width});const canvas=document.createElement('canvas');const pixelScale=Math.min(devicePixelRatio||1,1.5,1400/viewport.width);canvas.width=Math.ceil(viewport.width*pixelScale);canvas.height=Math.ceil(viewport.height*pixelScale);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';canvas.setAttribute('aria-hidden','true');
  const text=document.createElement('div');text.className='textLayer';text.style.setProperty('--total-scale-factor',viewport.scale);state.node.replaceChildren(canvas,text);state.task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[pixelScale,0,0,pixelScale,0,0]});
  await state.task.promise;if(epoch!==generation||!state.near)return;state.layer=new TextLayer({textContentSource:await page.getTextContent(),container:text,viewport});await state.layer.render();state.done=true;state.node.dataset.rendered='true';message('');
}
function enqueue(state){const epoch=generation;queue=queue.then(()=>render(state,epoch)).catch(error=>{if(error.name!=='RenderingCancelledException'&&error.name!=='AbortException')message('This page could not load. Try reloading, or open the PDF from the page above.');});}
function release(state){state.task?.cancel();state.layer?.cancel();state.node.querySelectorAll('canvas').forEach(c=>{c.width=0;c.height=0;});state.node.replaceChildren();state.done=false;state.node.removeAttribute('data-rendered');}
function layout(){if(!pdf)return;generation++;const width=Math.min(pages.clientWidth-(innerWidth<500?16:32),960)*zoom;for(const state of states){release(state);state.width=width;state.node.style.width=width+'px';state.node.style.height=(width*baseSize.height/baseSize.width)+'px';if(state.near)enqueue(state);}}
try{pdf=await getDocument({url:'/whitepaper.pdf',isEvalSupported:false}).promise;baseSize=(await pdf.getPage(1)).getViewport({scale:1});document.querySelector('#page-count').textContent='/ '+pdf.numPages;input.max=String(pdf.numPages);
  for(let number=1;number<=pdf.numPages;number++){const node=document.createElement('section');node.className='pdf-page';node.setAttribute('aria-label','Page '+number);node.style.scrollMarginTop='60px';const state={number,node,near:false,done:false};states.push(state);pages.append(node);}
  layout();renderObserver=new IntersectionObserver(entries=>{for(const entry of entries){const state=states[Number(entry.target.getAttribute('aria-label').split(' ')[1])-1];state.near=entry.isIntersecting;if(state.near)enqueue(state);else release(state);}},{rootMargin:'700px 0px'});
  visibleObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){current=Number(entry.target.getAttribute('aria-label').split(' ')[1]);if(document.activeElement!==input)input.value=String(current);}},{rootMargin:'-65px 0px -60% 0px'});
  for(const state of states){renderObserver.observe(state.node);visibleObserver.observe(state.node);}document.querySelector('#previous').onclick=()=>jump(current-1);document.querySelector('#next').onclick=()=>jump(current+1);input.onchange=()=>jump(Number(input.value));input.onkeydown=event=>{if(event.key==='Enter'){jump(Number(input.value));input.blur();}};
  function changeZoom(value){zoom=Math.max(.75,Math.min(2,value));layout();jump(current);}document.querySelector('#zoom-in').onclick=()=>changeZoom(zoom+.25);document.querySelector('#zoom-out').onclick=()=>changeZoom(zoom-.25);document.querySelector('#fit').onclick=()=>changeZoom(1);
  let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>{layout();jump(current);},150);});
}catch{message('The whitepaper could not load. Open the PDF from the page above, or try reloading.');}
