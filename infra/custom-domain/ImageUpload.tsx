import { useRef, useState } from 'react';
export default function ImageUpload({value,disabled,onChange,onBusyChange}:{value:string|null;disabled:boolean;onChange:(image:string|null)=>void;onBusyChange:(busy:boolean)=>void}) {
  const input=useRef<HTMLInputElement>(null);
  const [error,setError]=useState('');const [reading,setReading]=useState(false);
  const [filename,setFilename]=useState('');const [dragging,setDragging]=useState(false);
  const readingNow=useRef(false);const dragDepth=useRef(0);const unavailable=disabled||reading;
  async function choose(file?:File){
    if(disabled||readingNow.current)return;
    setError('');if(!file)return;
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>1048576){setError('Choose a PNG or JPG image up to 1 MB.');if(input.current)input.current.value='';return;}
    readingNow.current=true;setReading(true);onBusyChange(true);
    try{
      const bitmap=await createImageBitmap(file);const pixels=bitmap.width*bitmap.height;bitmap.close();if(pixels>4194304)throw Error('Choose an image with no more than 4 million pixels.');
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('This image could not be read.'));reader.readAsDataURL(file);});
      setFilename(file.name);onChange(data);if(input.current)input.current.value='';
    }catch(cause){setError(cause instanceof Error?cause.message:'Choose a valid PNG or JPG image.');if(input.current)input.current.value='';}
    finally{readingNow.current=false;setReading(false);onBusyChange(false);}
  }
  return <section className="image-upload" aria-label="Your artwork"><div className="upload-heading"><h2>Or use your own image.</h2><p>PNG or JPG · up to 1 MB · up to 4 million pixels</p></div>
    <div className={'upload-dropzone'+(dragging?' is-dragging':'')+(unavailable?' is-disabled':'')} aria-busy={reading}
      onDragEnter={event=>{event.preventDefault();if(unavailable)return;dragDepth.current++;setDragging(true);}}
      onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect=unavailable?'none':'copy';}}
      onDragLeave={event=>{event.preventDefault();dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDragging(false);}}
      onDrop={event=>{event.preventDefault();dragDepth.current=0;setDragging(false);if(unavailable)return;if(event.dataTransfer.files.length!==1){setError('Choose one artwork image at a time.');return;}void choose(event.dataTransfer.files[0]);}}>
      <svg className="upload-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/></svg>
      <div className="upload-drop-copy"><strong>{dragging?'Drop your artwork here':value?'Your artwork is ready':'Drop your artwork here'}</strong><p>{reading?'Checking your image…':value?(filename||'Selected image'):'Choose an image for your meme or NFT.'}</p></div>
      <button type="button" className="upload-button" disabled={unavailable} onClick={()=>input.current?.click()}>{reading?'Reading…':value?'Change artwork':'Upload artwork'}</button>
      <input ref={input} className="upload-input" tabIndex={-1} type="file" accept="image/png,image/jpeg" aria-label="Choose artwork" disabled={unavailable} onChange={event=>{void choose(event.target.files?.[0]);}}/>
    </div>
    {reading?<p className="upload-status" role="status">Reading your image…</p>:null}{value?<div className="upload-preview"><img src={value} alt="Your selected artwork preview"/><div><strong>Your artwork is selected.</strong><p>This image will appear in the token or NFT metadata. It is stored when you mint.</p><button type="button" className="text-button" disabled={unavailable} onClick={()=>{onChange(null);setFilename('');if(input.current)input.current.value='';}}>Use a preset instead</button></div></div>:null}{error?<p className="notice danger" role="alert">{error}</p>:null}</section>;
}
