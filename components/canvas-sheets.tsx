"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {paperCanvasSheet} from '@/lib/canvas-pdf';
import {canvasSheet,total,label,type State} from '@/lib/engine';

export function CanvasSheets({state,act,busy,initialCanvas=''}:{initialCanvas?:string;state:State;act:(command:any)=>Promise<boolean>;busy:boolean}) {
 const [chosen,setChosen]=useState(initialCanvas),[group,setGroup]=useState('all'),[search,setSearch]=useState(''),[date,setDate]=useState('');
 const [pdf,setPdf]=useState<{url:string;filename:string;state:State;id:string;group:string;search:string}|null>(null);
 const [error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const [allShifts,setAllShifts]=useState(false);
 const [editing,setEditing]=useState<{worker:string;shift:string}|null>(null);
 const [amount,setAmount]=useState('8'),[direction,setDirection]=useState('add'),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[editError,setEditError]=useState('');
 const saveLock=useRef(false);
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
 const editedWorker=state.workers.find(w=>w.id===editing?.worker),editedShift=state.shifts.find(e=>e.id===editing?.shift);
 const delta=(direction==='take'?-1:1)*Number(amount);
 const valid=Number.isFinite(delta)&&delta!==0&&Number(amount)>0&&Math.abs(delta)<=10000;
 function editHours(worker:string,shift:string){setEditing({worker,shift});setAmount('8');setDirection('add');setReason('');setEditError('');}
 async function saveHours(){
  if(!editing||!editedWorker||!editedShift||editedShift.canceled||c.canceled||!valid||!reason.trim()||saveLock.current)return;
  saveLock.current=true;setSaving(true);setEditError('');
  try{if(await act({type:'correction',worker:editing.worker,shift:editing.shift,hours:delta,reason}))setEditing(null);
  else setEditError('The change was not saved. Check the app error, reload if records changed, and try again.');}
  finally{saveLock.current=false;setSaving(false);}
 }
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
   <p>The preview below is the actual PDF, in the paper-sheet layout: seniority, names, starting hours, eligible shifts with charged and running hours, and total. Each RDO gets its own sheet; extra pages are added only when needed. The selected RDO group and worker filter apply to both buttons. Use the editable grid below to adjust posted hours; saved changes update totals throughout the app and regenerate this PDF.</p>
  </div>
  <div className="sheet-editor sheet-controls">
   <h3>Edit shift hours</h3>
   <p>Click a charge cell, choose Add or Take away, and save with a reason. Balances update immediately after saving. Canceled work remains read-only. A negative number on canceled work shows hours returned; the running balance already includes that reversal.</p>
   <label className="check"><input type="checkbox" checked={allShifts} onChange={e=>setAllShifts(e.target.checked)}/>Show all canvas shifts for editing, including other RDO dates</label>
   {['FS','SM'].filter(g=>group==='all'||group===g).map(g=>{const sheet=paperCanvasSheet(state,id,g,search,allShifts);return <div key={g}>
    <h3>{g==='FS'?'Friday–Saturday':'Sunday–Monday'} RDO</h3>
    <div className="editable-sheet-scroll"><table className="editable-hours-sheet"><thead><tr><th>Worker</th><th>Starting hours</th>{sheet.shifts.map(sh=><th key={sh.id}>{sh.type}<br/>{label(sh)}{sh.canceled&&<><br/>Canceled · hours returned</>}</th>)}<th>Canvas total</th><th>Current total · all work</th></tr></thead>
    <tbody>{sheet.rows.map(row=><tr key={row.worker.id}><th scope="row">{row.worker.name}</th><td>{row.opening}</td>{sheet.shifts.map((sh,i)=>{const cell=row.cells[i];return <td key={sh.id}><button className="sheet-charge-button" disabled={busy||saving||!!c.canceled||sh.canceled||!state.workers.some(w=>w.id===row.worker.id)} aria-label={`Edit hours for ${row.worker.name} on ${sh.type} ${label(sh)}`} onClick={()=>editHours(row.worker.id,sh.id)}>{cell.mark||'—'}</button><small>Balance: {cell.running}</small></td>;})}<td><b>{row.ending}</b>{row.other.length>0&&<small>Includes {row.otherHours} on other shifts</small>}</td><td><b>{state.workers.some(w=>w.id===row.worker.id)?total(state,row.worker.id):'—'}</b></td></tr>)}</tbody></table></div>
    {!sheet.rows.length&&<p>No workers match the filter.</p>}
   </div>;})}
  </div>
  <Dialog open={!!editing} onOpenChange={open=>{if(!open&&!saving)setEditing(null);}}><DialogContent><DialogHeader><DialogTitle>Adjust shift hours</DialogTitle><DialogDescription>{editedWorker?.name} · {editedShift&&label(editedShift)}. This records an hours correction, without changing coverage or starting hours.</DialogDescription></DialogHeader>
   <form onSubmit={e=>{e.preventDefault();void saveHours();}}>
    <label className="field"><span>Change</span><select aria-label="Change" value={direction} onChange={e=>setDirection(e.target.value)}><option value="add">Add hours</option><option value="take">Take away hours</option></select></label>
    <label className="field"><span>Hours</span><Input aria-label="Hours to adjust" type="number" required min="0.01" max="10000" step="any" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <label className="field"><span>Reason</span><Input aria-label="Adjustment reason" required value={reason} onChange={e=>setReason(e.target.value)}/></label>
    {editedWorker&&valid&&<p role="status">Current total: {total(state,editedWorker.id)} → {total(state,editedWorker.id)+delta} hours ({delta>0?'+':''}{delta})</p>}
    <Button type="submit" disabled={busy||saving||!valid||!reason.trim()}>{saving?'Saving…':'Save hours change'}</Button>
    {editError&&<p role="alert" className="error">{editError}</p>}
   </form>
  </DialogContent></Dialog>
  <h3 className="sheet-controls">PDF preview</h3>
  {error&&<p role="alert" className="error">{error}</p>}
  {!ready?<p role="status">Preparing landscape PDF…</p>:<iframe ref={preview} className="canvas-pdf-preview" title="Canvas PDF preview — 11 × 15 landscape" src={`${pdf.url}#view=FitH`} onLoad={()=>setLoaded(true)}/>}
 </section>;
}
