import { useRef, useState } from 'react';
export default function ImageUpload({value,disabled,onChange,onBusyChange}:{value:string|null;disabled:boolean;onChange:(image:string|null)=>void;onBusyChange:(busy:boolean)=>void}) {
  const input=useRef<HTMLInputElement>(null);
  const [error,setError]=useState('');const [reading,setReading]=useState(false);
  async function choose(file?:File){
    setError('');if(!file)return;
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>1048576){setError('Choose a PNG or JPG image up to 1 MB.');if(input.current)input.current.value='';return;}
    setReading(true);onBusyChange(true);
    try{
      const bitmap=await createImageBitmap(file);const pixels=bitmap.width*bitmap.height;bitmap.close();if(pixels>4194304)throw Error('Choose an image with no more than 4 million pixels.');
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('This image could not be read.'));reader.readAsDataURL(file);});
      onChange(data);
    }catch(cause){setError(cause instanceof Error?cause.message:'Choose a valid PNG or JPG image.');if(input.current)input.current.value='';}
    finally{setReading(false);onBusyChange(false);}
  }
  return <section className="image-upload" aria-label="Your artwork"><div className="upload-heading"><h2>Or use your own image.</h2><p>PNG or JPG · up to 1 MB · up to 4 million pixels</p></div><label className="upload-picker">Choose artwork<input ref={input} type="file" accept="image/png,image/jpeg" disabled={disabled||reading} onChange={event=>{void choose(event.target.files?.[0]);}}/></label>{reading?<p role="status">Reading your image…</p>:null}{value?<div className="upload-preview"><img src={value} alt="Your selected artwork preview"/><div><strong>Your artwork is selected.</strong><p>This image will appear in the token or NFT metadata. It is stored when you mint.</p><button type="button" className="text-button" disabled={disabled||reading} onClick={()=>{onChange(null);if(input.current)input.current.value='';}}>Use a preset instead</button></div></div>:null}{error?<p className="notice danger" role="alert">{error}</p>:null}</section>;
}
