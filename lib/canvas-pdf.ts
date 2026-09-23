import {jsPDF} from 'jspdf';
import {autoTable, type CellInput} from 'jspdf-autotable';
import {canvasSheet, sheetShiftSectionsForGroup, label, compareSeniority, seniorityLabel, type State} from './engine.ts';

// PDF points are physical units: 72 points per inch, independent of browser print defaults.
export const CANVAS_PDF_SIZE = [1080, 792] as const;
const margin=26;
const text=(value:string)=>value.replace(/[–—]/g,'-');
const code=(kind:string)=>({Accepted:'A',Refused:'R',Replacement:'Rep','Absence penalty':'P',Reversal:'Rev',Correction:'Adj'}[kind]||kind);

export function createCanvasPdf(state:State,id:string,group='all',search='') {
    const report=canvasSheet(state,id),canvas=report.canvas;
    const doc=new jsPDF({orientation:'landscape',unit:'pt',format:[...CANVAS_PDF_SIZE],compress:true});
    doc.setProperties({title:`Canvas ${canvas.date} - 11 x 15 landscape`,subject:'Overtime canvas sheet',creator:'Shop overtime canvas'});
    const indices=new Map(report.shifts.map((e,i)=>[e.id,i]));
    let firstPage=true;
    for(const g of ['FS','SM'].filter(g=>group==='all'||group===g)) {
        const sections=sheetShiftSectionsForGroup(state,id,g,4);
        const rows=report.rows.filter(r=>r.worker.rdo===g&&r.worker.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>compareSeniority(a.worker,b.worker));
        for(const [part,section] of sections.entries()) {
            if(!firstPage)doc.addPage([...CANVAS_PDF_SIZE],'landscape');
            firstPage=false;
            const firstIndex=indices.get(section[0].id)!,lastIndex=indices.get(section.at(-1)!.id)!;
            const first=part===0,last=part===sections.length-1;
            const heading=()=>{
                doc.setFont('helvetica','bold').setFontSize(17).setTextColor(25,47,63);
                doc.text(`Shop overtime - ${g==='FS'?'Friday-Saturday':'Sunday-Monday'} RDO`,margin,38);
                doc.setFontSize(10).text(`Part ${part+1} of ${sections.length}`,1054,38,{align:'right'});
                doc.setFont('helvetica','normal').setFontSize(10);
                doc.text(`Status: ${canvas.canceled?'Canceled':'Active'} | Overtime: ${report.start} to ${report.end} | Canvassed: ${canvas.canvassedOn||'Not recorded'}`,margin,57);
                doc.setFontSize(8).text('A = accepted | R = refused | Rep = replacement | P = absence penalty | Rev = reversal | Adj = correction | - = no charge',margin,73);
            };
            const head:CellInput[][]=[[
                {content:'Seniority',rowSpan:2},{content:'Worker',rowSpan:2},
                {content:first?'Starting\nhours':'Brought\nforward',rowSpan:2},
                ...section.map(e=>({content:`${e.type}\n${text(label(e))}${e.canceled?'\nCANCELED':''}`,colSpan:2})),
                {content:last?'Ending\ntotal':'After\nsection',rowSpan:2}
            ],section.flatMap(()=>['Charged','Hours'])];
            const body:CellInput[][]=rows.map(r=>[
                seniorityLabel(r.worker),r.worker.name,firstIndex===0?r.opening:r.cells[firstIndex-1].running,
                ...section.flatMap(e=>{const cell=r.cells[indices.get(e.id)!];return [
                    {content:cell.entries.length?`${cell.hours}\n${cell.entries.map(c=>`${code(c.kind)} ${c.hours>0?'+':''}${c.hours}`).join('\n')}`:'-',styles:{textColor:cell.entries.some(c=>c.kind==='Refused')?'#a52932':'#192f3f'}},cell.running
                ];}),last?r.ending:r.cells[lastIndex].running
            ].map(v=>typeof v==='number'?String(v):v));
            const pairWidth=(1028-58-166-65-65)/(section.length*2);
            autoTable(doc,{
                head,body,startY:85,margin:{top:85,bottom:38,left:margin,right:margin},tableWidth:1028,
                theme:'grid',showHead:'everyPage',rowPageBreak:'avoid',
                styles:{fontSize:10,cellPadding:4,halign:'center',valign:'middle',lineColor:'#c8d1d8',lineWidth:0.5,textColor:'#192f3f',overflow:'linebreak'},
                headStyles:{fillColor:'#e7eef2',textColor:'#192f3f',fontSize:9,fontStyle:'bold'},
                alternateRowStyles:{fillColor:'#f7f9fa'},
                columnStyles:{0:{cellWidth:58},1:{cellWidth:166,halign:'left',fontStyle:'bold'},2:{cellWidth:65},
                    ...Object.fromEntries(section.flatMap((_,i)=>[[3+i*2,{cellWidth:pairWidth}],[4+i*2,{cellWidth:pairWidth}]])),
                    [3+section.length*2]:{cellWidth:65,fontStyle:'bold'}},
                willDrawPage:heading,
            });
            if(!rows.length)doc.setFontSize(11).text('No workers match the selected filter.',margin,160);
        }
    }
    if(firstPage)doc.setFontSize(14).text('No overtime shifts for the selected RDO group.',margin,40);
    for(let page=1;page<=doc.getNumberOfPages();page++){
        doc.setPage(page);doc.setFont('helvetica','normal').setFontSize(9).setTextColor(82,101,116);
        doc.text('11 x 15 in - Landscape (15 in wide x 11 in tall)',margin,772);
        doc.text(`Page ${page} of ${doc.getNumberOfPages()}`,1054,772,{align:'right'});
    }
    return doc;
}
export function canvasPdfFilename(state:State,id:string,group='all') {
    const canvas=state.canvases.find(c=>c.id===id);
    if(!canvas)throw new Error('Canvas not found.');
    return `canvas-${canvas.date}-${id}-${group}-11x15-landscape.pdf`;
}
