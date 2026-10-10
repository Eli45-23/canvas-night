'use client';
import {useState} from 'react';
import {Button} from './ui/button';
export function BackupControls({shared,canImport,revision,onImported}:{shared:boolean;canImport:boolean;revision:number;onImported:()=>void}) {
    const [file,setFile]=useState<File|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
    async function importFile(){if(!file)return;setBusy(true);setMessage('Importing and verifying…');try{
        const snapshot=JSON.parse(await file.text());
        const response=await fetch('/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,snapshot})});
        const result:any=await response.json();if(!response.ok||!result.verified)throw new Error(result.error||'Verification failed.');
        setMessage(`Verified import: ${result.workers??snapshot.state.workers.length} workers, ${result.canvases??snapshot.state.canvases.length} canvases. All saved records match the backup.`);onImported();
    }catch(e){setMessage(e instanceof Error?e.message:'Import failed.');}finally{setBusy(false);}}
    return <section><h3>Backup & migration</h3><p>Download a complete backup including worker hours, assignments, history, and saved checkpoints.</p><a className="app-action" href="/api/backup" download>Download full backup</a>{shared&&canImport&&<><p>This shared site contains sample data only. Import your latest local backup once. Import locks after operational records are present.</p><input aria-label="Local canvas backup" type="file" accept=".json,application/json" onChange={e=>setFile(e.target.files?.[0]||null)}/><Button disabled={!file||busy} onClick={importFile}>Import & verify local backup</Button></>}{message&&<p role="status">{message}</p>}</section>;
}
