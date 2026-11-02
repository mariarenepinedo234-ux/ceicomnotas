import {lstat,mkdir,readdir,rename,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {backupDatabase} from './scripts/backup.js';

const filenamePattern=/^ceicom-[a-zA-Z0-9-]+\.dump$/;
const failure=(message,status)=>Object.assign(new Error(message),{status});
export function createBackupStore({connectionString,schema='public',directory=fileURLToPath(new URL('./backups/',import.meta.url)),native='auto'}={}){
  const root=resolve(directory);let creating=false;
  async function file(filename){
    if(typeof filename!=='string'||!filenamePattern.test(filename))throw failure('Copia de seguridad no encontrada.',404);
    const path=resolve(root,filename);
    let info;try{info=await lstat(path);}catch(error){if(error.code==='ENOENT')throw failure('Copia de seguridad no encontrada.',404);throw error;}
    if(!info.isFile())throw failure('Copia de seguridad no encontrada.',404);
    return {path,filename,size:info.size,created_at:info.mtime.toISOString(),download_url:`/api/backups/${filename}`,saved_path:`backups/${filename}`};
  }
  async function list(){
    let names;try{names=await readdir(root);}catch(error){if(error.code==='ENOENT')return [];throw error;}
    const items=[];
    for(const name of names.filter(name=>filenamePattern.test(name))){try{const {path,...item}=await file(name);items.push(item);}catch(error){if(error.status!==404)throw error;}}
    return items.sort((a,b)=>b.created_at.localeCompare(a.created_at));
  }
  async function create(){
    if(creating)throw failure('Ya se está generando una copia. Espera a que termine.',409);
    creating=true;
    const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const filename=`ceicom-${stamp}-${randomBytes(6).toString('hex')}.dump`,partial=resolve(root,filename+'.partial');
    try{
      await mkdir(root,{recursive:true,mode:0o700});
      await backupDatabase(partial,{native,connectionString,schema});
      const info=await lstat(partial);if(info.size<5)throw new Error('Respaldo vacío.');
      await rename(partial,resolve(root,filename));
      const {path,...result}=await file(filename);return result;
    }catch(error){
      await unlink(partial).catch(()=>{});
      if(error.code==='ENOENT')throw failure('No se encontró pg_dump. Configura PG_BIN_DIR con la carpeta bin de PostgreSQL y reinicia el sistema.',503);
      throw failure('No se pudo generar la copia. Comprueba la conexión, los permisos de la carpeta backups y que pg_dump sea compatible con tu versión de PostgreSQL.',503);
    }finally{creating=false;}
  }
  return {create,list,file};
}
