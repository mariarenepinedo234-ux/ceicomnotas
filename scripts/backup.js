import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,unlink,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';
import {openDatabase} from '../db.js';

export async function backupDatabase(filename,{restore=false,native=false}={}){
  const target=resolve(filename);
  const url=new URL(process.env.DATABASE_URL||'');
  let command,args,environment={...process.env};
  if(native){
    command=restore?'pg_restore':'pg_dump';
    environment={...environment,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};
    if(url.searchParams.has('sslmode'))environment.PGSSLMODE=url.searchParams.get('sslmode');
    args=restore?['--single-transaction','--exit-on-error','--no-owner','--no-acl','--clean','--if-exists','--schema=public','--dbname',environment.PGDATABASE]:['--format=custom','--no-owner','--no-acl','--schema=public'];
  }else{
    if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/[a-zA-Z_][a-zA-Z0-9_]*$/.test(url.pathname)||decodeURIComponent(url.username)!=='ceicom'||(url.port||'5432')!==(process.env.POSTGRES_PORT||'5432'))throw new Error('Para una conexión externa usa --native con herramientas PostgreSQL instaladas.');
    command='docker';args=['compose','exec','-T','db',restore?'pg_restore':'pg_dump','-U','ceicom','-d',decodeURIComponent(url.pathname.slice(1)),...(restore?['--single-transaction','--exit-on-error','--no-owner','--no-acl','--clean','--if-exists','--schema=public']:['--format=custom','--no-owner','--no-acl','--schema=public'])];
  }
  if(restore){
    await stat(target);
    const db=await openDatabase({migrate:false});
    try{const result=await db.query("SELECT (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')+(SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')+(SELECT COUNT(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS n");if(result.rows[0].n)throw new Error('La restauración exige una base vacía. No borra ni reemplaza una base existente.');}
    finally{await db.close();}
  }else await mkdir(dirname(target),{recursive:true});
  let stream;
  if(!restore){
    stream=createWriteStream(target,{flags:'wx',mode:0o600});
    await new Promise((accept,reject)=>{stream.once('open',accept);stream.once('error',reject);});
  }
  const child=spawn(command,args,{env:environment,stdio:[restore?'pipe':'ignore',restore?'ignore':'pipe','pipe']});
  // No se reenvían mensajes del proveedor que puedan incluir detalles privados.
  child.stderr.resume();
  const completed=new Promise((accept,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?accept():reject(new Error(`${restore?'Restauración':'Respaldo'} falló. Comprueba la conexión y las herramientas PostgreSQL.`)));});
  try{
    await Promise.all([completed,restore?pipeline(createReadStream(target),child.stdin):pipeline(child.stdout,stream)]);
  }catch(error){child.kill();if(!restore){stream.destroy();await unlink(target).catch(()=>{});}throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),restore=args.includes('--restore'),filename=args.find(a=>!a.startsWith('--'));
  try{
    if(restore&&!filename)throw new Error('Uso: npm run db:restore -- ruta/respaldo.dump (solo base vacía).');
    const file=filename||`backups/ceicom-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`;
    await backupDatabase(file,{restore,native:args.includes('--native')});console.log(`${restore?'Restauración':'Respaldo'} completado: ${file}`);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
