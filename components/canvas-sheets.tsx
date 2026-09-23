"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {canvasSheet,sheetShiftSectionsForGroup,label,compareSeniority,seniorityLabel,type State} from '@/lib/engine';

export function CanvasSheets({state,act,busy,initialCanvas=''}:{initialCanvas?:string;state:State;act:(command:any)=>Promise<boolean>;busy:boolean}) {
 const [chosen,setChosen]=useState(initialCanvas),[group,setGroup]=useState('all'),[search,setSearch]=useState(''),[date,setDate]=useState('');
 const id=(state.canvases.some(c=>c.id===chosen)?chosen:'')||state.current||state.canvases.at(-1)?.id;
 if(!id)return <section><h2>Dated canvas sheets</h2><p>Create a canvas to start its hours sheet.</p></section>;
 const report=canvasSheet(state,id),c=report.canvas;
 const fmt=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
 const code=(kind:string)=>({'Accepted':'A','Refused':'R','Replacement':'Rep','Absence penalty':'P','Reversal':'Rev','Correction':'Adj'}[kind]||kind);
 const shiftIndex=new Map(report.shifts.map((e,i)=>[e.id,i] as const));
 const groups=['FS','SM'].filter(g=>group==='all'||group===g);
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
    <Button variant="outline" onClick={()=>window.print()}>Print sheet / Save PDF</Button>
    <label className="field"><span>Find worker</span><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Worker name"/></label>
   </div>
   <p>Saved automatically with the canvas. Later corrections revise this period’s sheet and remain in History. Print/PDF view splits each RDO into sections of up to four shifts so names and totals remain readable.</p>
  </div>
  {groups.map(g=>{
   const sections=sheetShiftSectionsForGroup(state,id,g,4);
   const rows=report.rows.filter(r=>r.worker.rdo===g&&r.worker.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>compareSeniority(a.worker,b.worker));
   if(!sections.length)return <div className="sheet-group" key={g}><h2>Shop overtime · {g==='FS'?'Friday–Saturday':'Sunday–Monday'} RDO</h2><p className="empty">No applicable overtime shifts for this RDO group.</p></div>;
   return <div className="sheet-group" key={g}>
    {sections.map((section,sectionIndex)=>{
     const firstIndex=shiftIndex.get(section[0].id)??0,lastIndex=shiftIndex.get(section.at(-1)!.id)??firstIndex;
     const first=sectionIndex===0,last=sectionIndex===sections.length-1;
     return <div className="sheet-page" key={section.map(e=>e.id).join(':')}>
      <div className="sheet-page-heading">
       <div><h2>Shop overtime · {g==='FS'?'Friday–Saturday':'Sunday–Monday'} RDO</h2><p><b>Status: {c.canceled?'Canceled':'Active'} · Overtime: {fmt(report.start)} – {fmt(report.end)}</b> · Canvassed: {c.canvassedOn?fmt(c.canvassedOn):'Not recorded — enter above'}</p></div>
       <b className="sheet-part">Part {sectionIndex+1} of {sections.length}</b>
      </div>
      <p className="sheet-legend">A = accepted · R = refused · Rep = replacement · P = absence penalty · Rev = reversal · Adj = correction · — = no charge. Each shift shows net hours charged and the running total, in canvassing order.</p>
      <div className="sheet-scroll"><table className="hours-sheet"><colgroup><col className="sheet-col-seniority"/><col className="sheet-col-worker"/><col className="sheet-col-running"/>{section.flatMap(e=>[<col className="sheet-col-charge" key={e.id+"charge-col"}/>,<col className="sheet-col-running" key={e.id+"total-col"}/>])}<col className="sheet-col-running"/></colgroup><thead><tr>
       <th rowSpan={2}>Seniority</th><th rowSpan={2}>Worker</th><th rowSpan={2}>{first?'Starting hours':'Brought forward'}</th>
       {section.map(e=><th colSpan={2} key={e.id}>{e.type}<br/>{label(e)}{e.canceled&&<><br/>CANCELED</>}</th>)}
       <th rowSpan={2}>{last?'Ending total':'After section'}</th>
      </tr><tr>{section.flatMap(e=>[<th key={e.id+'charge'}>Charged</th>,<th key={e.id+'total'}>Hours</th>])}</tr></thead>
      <tbody>{rows.map(r=>{
       const before=firstIndex===0?r.opening:r.cells[firstIndex-1].running;
       const after=last?r.ending:r.cells[lastIndex].running;
       return <tr key={r.worker.id}><td>{seniorityLabel(r.worker)}</td><th scope="row">{r.worker.name}</th><td>{before}</td>
        {section.flatMap(e=>{const cell=r.cells[shiftIndex.get(e.id)!];return [<td key={e.id+'charge'} className={cell.entries.some(x=>x.kind==='Refused')?'red':''}><b>{cell.entries.length?cell.hours:'—'}</b>{cell.entries.map(x=><small key={x.id}>{code(x.kind)} {x.hours>0?'+':''}{x.hours}</small>)}</td>,<td key={e.id+'total'}>{cell.running}</td>]})}
        <td><b>{after}</b></td></tr>
      })}</tbody></table></div>
     </div>;
    })}
   </div>;
  })}
 </section>;
}
