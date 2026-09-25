import {jsPDF} from 'jspdf';
import {autoTable, type CellInput, type Styles} from 'jspdf-autotable';
import {canvasSheet, sheetShiftsForGroup, sheetWorkerCanWork, calloutChargeStatus, canceledHoursReturned, localDate, compareSeniority, seniorityLabel, type State, type Shift} from './engine.ts';

export const CANVAS_PDF_SIZE = [1080, 792] as const;
const margin=26,tableWidth=1028;
const clock=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hour12:true});
const day=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short'});
function shiftHeading(e:Shift){
    const time=(ms:number)=>clock.format(ms).replace(/\s/g,'').replace('AM','A').replace('PM','P');
    return `${e.type==='Chip-out'?'COVERAGE':e.type.toUpperCase()}\n${day.format(e.start).toUpperCase()} ${localDate(e.start).slice(5).replace('-','/')}\n${time(e.start)}-${time(e.end)}${e.canceled?'\nCANCELED':''}`;
}

// Visible running hours follow only the columns shown, then add separately disclosed exceptions.
export function paperCanvasSheet(state:State,id:string,group:string,search='',allShifts=false){
    const report=canvasSheet(state,id),shifts=allShifts?report.shifts:sheetShiftsForGroup(state,id,group),visible=new Set(shifts.map(e=>e.id));
    const rows=report.rows.filter(r=>r.worker.rdo===group&&r.worker.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>compareSeniority(a.worker,b.worker)).map(r=>{
        let running=r.opening;
        const cells=shifts.map(e=>{
            const cell=r.cells.find(c=>c.shift===e.id)!;
            running+=cell.hours;
            const refused=cell.hours>0&&cell.entries.filter(c=>!c.reverses&&!state.charges.some(x=>x.reverses===c.id)).every(c=>c.kind==='Refused');
            const callouts=state.responses.filter(response=>response.worker===r.worker.id&&response.shift===e.id).map(response=>calloutChargeStatus(state,response.id)).filter(status=>status!==null);
            const pendingHours=callouts.reduce((n,status)=>n+status.pendingHours,0);
            const exceptional=cell.entries.some(c=>!['Accepted','Refused',...(callouts.length?['Absence penalty']:[])].includes(c.kind));
            const available=sheetWorkerCanWork(r.worker,e);
            const returned=canceledHoursReturned(state,e,r.worker.id);
            return {shift:e.id,hours:cell.hours,running,charged:cell.entries.length>0,available,
                mark:e.canceled&&returned!==0?String(returned):cell.entries.length?`${refused||callouts.length?'R':''}${cell.hours+pendingHours}${exceptional?'*':''}${!available?'!':''}${pendingHours?'\n('+pendingHours+' pending)':''}`:available?'':'X'};
        });
        const other=r.cells.filter(c=>!visible.has(c.shift)&&c.entries.length);
        return {...r,cells,other,otherHours:other.reduce((n,c)=>n+c.hours,0)};
    });
    return {...report,shifts,rows};
}

export function createCanvasPdf(state:State,id:string,group='all',search='') {
    const doc=new jsPDF({orientation:'landscape',unit:'pt',format:[...CANVAS_PDF_SIZE],compress:true});
    const canvas=canvasSheet(state,id).canvas;
    doc.setProperties({title:`Canvas ${canvas.date} - 11 x 15 landscape`,subject:'Overtime canvas sheet',creator:'Shop overtime canvas'});
    let firstPage=true;
    for(const g of ['FS','SM'].filter(g=>group==='all'||group===g)) {
        const report=paperCanvasSheet(state,id,g,search);
        const sections:Shift[][]=[];
        for(let i=0;i<report.shifts.length;i+=10)sections.push(report.shifts.slice(i,i+10));
        if(!sections.length)sections.push([]);
        for(const [part,section] of sections.entries()){
            if(!firstPage)doc.addPage([...CANVAS_PDF_SIZE],'landscape');firstPage=false;
            const startIndex=part*10,last=part===sections.length-1;
            const other=last&&report.rows.some(r=>r.other.length);
            const heading=()=>{
                doc.setTextColor(0).setFont('helvetica','bold').setFontSize(17);
                doc.text(`SHOP OVERTIME - ${g==='FS'?'FRIDAY-SATURDAY':'SUNDAY-MONDAY'} RDO`,540,37,{align:'center'});
                doc.setFont('helvetica','normal').setFontSize(9);
                doc.text(`Weekend: ${canvas.date} | Canvassed: ${canvas.canvassedOn||'Not recorded'} | Status: ${canvas.canceled?'Canceled':'Active'}${sections.length>1?` | Part ${part+1} of ${sections.length}`:''}`,540,53,{align:'center'});
                doc.setFontSize(8).text('Shift cell = charge notation | R = refusal/call-out | Pending hours post at review, not yet in TOTAL | X = unavailable | * = adjusted/reversed | ! = schedule exception',margin,70);
            };
            const head:CellInput[][]=[['SEN#','NAMES',part?'HOURS\nB/F':'HOURS',...section.flatMap(e=>[shiftHeading(e),'HOURS']),...(other?['OTHER\nCHARGES']:[]),last?'TOTAL':'CARRY\nFORWARD']];
            const body:CellInput[][]=report.rows.map(r=>[
                seniorityLabel(r.worker),r.worker.name.toUpperCase(),startIndex?r.cells[startIndex-1].running:r.opening,
                ...section.flatMap((e,i)=>{const cell=r.cells[startIndex+i];return [
                    {content:cell.mark,styles:{textColor:cell.mark.startsWith('R')?'#a52932':'#000000'}},cell.charged?cell.running:''
                ];}),...(other?[r.other.length?`${r.otherHours}*`:'']:[]),last?r.ending:r.cells[startIndex+section.length-1]?.running??r.opening
            ]);
            const fixed=42+142+52+54+(other?54:0),pairWidth=(tableWidth-fixed)/Math.max(1,section.length*2);
            const columns:Record<number,Partial<Styles>>={0:{cellWidth:42},1:{cellWidth:142,fontStyle:'bold',fontSize:9},2:{cellWidth:52},[3+section.length*2+(other?1:0)]:{cellWidth:54,fontStyle:'bold'}};
            if(other)columns[3+section.length*2]={cellWidth:54};
            for(let i=0;i<section.length;i++){
                columns[3+i*2]={cellWidth:pairWidth,fillColor:'#eeeeee'};
                columns[4+i*2]={cellWidth:pairWidth};
            }
            autoTable(doc,{head,body,startY:82,margin:{top:82,bottom:44,left:margin,right:margin},tableWidth:section.length?tableWidth:fixed,
                theme:'grid',showHead:'everyPage',rowPageBreak:'avoid',
                styles:{fontSize:10,cellPadding:3,minCellHeight:25,halign:'center',valign:'middle',lineColor:'#555555',lineWidth:0.6,textColor:'#000000',overflow:'linebreak'},
                headStyles:{fillColor:'#ffffff',textColor:'#000000',fontSize:section.length>=8?6.5:8,fontStyle:'bold',minCellHeight:52},
                columnStyles:columns,willDrawPage:heading});
            if(!report.rows.length)doc.setFontSize(11).text('No workers match the selected filter.',margin,160);
            if(other){
                // Do not silently omit historical charges on shifts outside this RDO's schedule.
                doc.addPage([...CANVAS_PDF_SIZE],'landscape');heading();
                doc.setFontSize(11).text('Other recorded charges - excluded from the available-work columns above',margin,95);
                autoTable(doc,{head:[['Worker','Recorded shift','Net hours','Explanation']],body:report.rows.flatMap(r=>r.other.map(c=>{
                    const e=state.shifts.find(e=>e.id===c.shift)!;
                    return [r.worker.name,shiftHeading(e).replace(/\n/g,' '),String(c.hours),'Not available under this RDO saved schedule; retained in TOTAL.'];
                })),startY:108,margin:{top:108,bottom:44,left:margin,right:margin},theme:'grid',styles:{fontSize:10},headStyles:{fillColor:'#eeeeee',textColor:'#000000'},willDrawPage:heading});
            }
        }
    }
    for(let page=1;page<=doc.getNumberOfPages();page++){
        doc.setPage(page);doc.setFont('helvetica','normal').setFontSize(8).setTextColor(70);
        doc.text('11 x 15 in landscape | Canceled cells show hours returned (older records: final reversal batch); HOURS/TOTAL use net charges, without subtracting refunds twice.',margin,766);
        doc.text(`Page ${page} of ${doc.getNumberOfPages()}`,1054,780,{align:'right'});
    }
    return doc;
}
export function canvasPdfFilename(state:State,id:string,group='all') {
    const canvas=state.canvases.find(c=>c.id===id);
    if(!canvas)throw new Error('Canvas not found.');
    return `canvas-${canvas.date}-${id}-${group}-11x15-landscape.pdf`;
}
