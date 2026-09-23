"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {canvasSheet,type State} from '@/lib/engine';

export function CanvasSheets({state,act,busy,initialCanvas=''}:{initialCanvas?:string;state:State;act:(command:any)=>Promise<boolean>;busy:boolean}) {
 const [chosen,setChosen]=useState(initialCanvas),[group,setGroup]=useState('all'),[search,setSearch]=useState(''),[date,setDate]=useState('');
 const [pdf,setPdf]=useState<{url:string;filename:string;state:State;id:string;group:string;search:string}|null>(null);
 const [error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const preview=useRef<HTMLIFrameElement>(null);
 const id=(state.canvases.some(c=>c.id===chosen)?chosen:'')||state.current||state.canvases.at(-1)?.id;
 useEffect(()=>{
  let disposed=false,url='';setPdf(null);setLoaded(false);setError('');
  if(id)void import('@/lib/canvas-pdf').then(({createCanvasPdf,canvasPdfFilename})=>{
   if(disposed)return;
   url=URL.createObjectURL(createCanvasPdf(state,id,group,search).output('blob'));
   setPdf({url,filename:canvasPdfFilename(state,id,group),state,id,group,search});
  }).catch(()=>{if(!disposed)setError('Unable to prepare the PDF. Reload the canvas sheets and try again.');});
  return ()=>{disposed=true;if(url)URL.revokeObjectURL(url);};
 },[state,id,group,search]);
 if(!id)return <section><h2>Dated canvas sheets</h2><p>Create a canvas to start its hours sheet.</p></section>;
 const c=canvasSheet(state,id).canvas;
 const ready=pdf&&pdf.state===state&&pdf.id===id&&pdf.group===group&&pdf.search===search;
 const fmt=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
 function savePdf(){
  if(!ready||!pdf)return;
  const link=document.createElement('a');link.href=pdf.url;link.download=pdf.filename;
  document.body.appendChild(link);link.click();link.remove();
 }
 function printPdf(){
  if(!ready||!loaded)return;
  try{preview.current?.contentWindow?.focus();preview.current?.contentWindow?.print();}
  catch{setError('Your browser blocked direct printing. Use the printer icon in the PDF preview, or save the PDF and print it from your PDF viewer.');}
 }
 return <section className="canvas-sheet">
  <div className="sheet-controls">
   <h2>Dated canvas sheets</h2>
   <div className="columns">
    <label className="field"><span>Saved overtime period</span><select value={id} onChange={e=>{setChosen(e.target.value);setDate('');}}>{[...state.canvases].reverse().map(c=>{const r=canvasSheet(state,c.id);return <option value={c.id} key={c.id}>{fmt(r.start)} – {fmt(r.end)} · {c.canceled?'Canceled':'Active'} · Canvas {c.canvassedOn?fmt(c.canvassedOn):'date not recorded'}</option>})}</select></label>
    <label className="field"><span>RDO sheet</span><select value={group} onChange={e=>setGroup(e.target.value)}><option value="all">Both RDO groups</option><option value="FS">Friday–Saturday</option><option value="SM">Sunday–Monday</option></select></label>
   </div>
   <div className="actions">
    <label className="field"><span>Canvas performed on</span><Input type="date" disabled={!!c.canceled} value={date||c.canvassedOn||''} onInput={e=>setDate(e.currentTarget.value)}/></label>
    <Button variant="outline" disabled={busy||!date||!!c.canceled} onClick={()=>act({type:'canvasDate',canvas:id,date})}>Save canvas date</Button>
    <Button disabled={!ready} onClick={savePdf}>Save PDF</Button>
    <Button variant="outline" disabled={!ready||!loaded} onClick={printPdf}>Print</Button>
    <label className="field"><span>Find worker</span><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Worker name"/></label>
   </div>
   <p><b>11 × 15 landscape:</b> every PDF page is 15 inches wide × 11 inches tall. Save PDF downloads a file to your computer without opening the print dialog. Print opens the printer dialog for this same PDF; select matching paper and Actual size / 100% for full-size printing.</p>
   <p>The preview below is the actual PDF, in the paper-sheet layout: seniority, names, starting hours, eligible shifts with charged and running hours, and total. Each RDO gets its own sheet; extra pages are added only when needed. The selected RDO group and worker filter apply to both buttons. Saved canvas records remain unchanged.</p>
  </div>
  {error&&<p role="alert" className="error">{error}</p>}
  {!ready?<p role="status">Preparing landscape PDF…</p>:<iframe ref={preview} className="canvas-pdf-preview" title="Canvas PDF preview — 11 × 15 landscape" src={`${pdf.url}#view=FitH`} onLoad={()=>setLoaded(true)}/>}
 </section>;
}
