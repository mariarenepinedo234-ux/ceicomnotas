import {createStudyPlan} from '../study-plans.js';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {testDatabase} from './helpers.js';
import {createApp} from '../server.js';
import {createBackupStore} from '../backups.js';
import {openDatabase} from '../db.js';

let db,server,base,directory;
const cookies={};
async function request(path,{body,role='admin'}={}){
  return fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookies[role]?{Cookie:cookies[role]}:{})},body:body?JSON.stringify(body):undefined});
}
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'ceicom-backups-'));db=await testDatabase();
  server=createApp(db,{backupDirectory:directory});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
  for(const [role,ci,password] of [['admin','admin','Ceicom2026!'],['teacher','4567890','4567890'],['student','7000001','7000001']]){
    const response=await request('/api/login',{body:{ci,password},role});assert.equal(response.status,200);cookies[role]=response.headers.get('set-cookie').split(';')[0];
  }
});
after(async()=>{await new Promise(r=>server.close(r));await db.cleanup();await rm(directory,{recursive:true,force:true});});

test('solo administradores con contraseña actualizada pueden crear, listar y descargar respaldos',async()=>{
  for(const path of ['/api/backups','/api/backups/ceicom-noexiste.dump'])assert.equal((await request(path,{role:'anonymous'})).status,401);
  assert.equal((await request('/api/backups',{body:{}})).status,403);
  await db.exec('UPDATE users SET must_change=0');
  for(const role of ['teacher','student']){
    assert.equal((await request('/api/backups',{role})).status,403);
    assert.equal((await request('/api/backups',{body:{},role})).status,403);
    assert.equal((await request('/api/backups/ceicom-noexiste.dump',{role})).status,403);
  }
  assert.deepEqual(await readdir(directory),[]);
});

test('el respaldo es restaurable, conserva notas y contraseñas, se descarga íntegro y no cambia el origen',async t=>{
  const enrollments=await db.prepare('SELECT * FROM enrollments ORDER BY id').all();
  const passwords=await db.prepare('SELECT id,password FROM users ORDER BY id').all();
  const schema=(await db.query('SELECT current_schema() AS name')).rows[0].name;
  const planBytes=Buffer.from(await (await request('/api/reports/1?format=pdf&draft=true')).arrayBuffer());
  const plan=await createStudyPlan(db,{title:'Plan de prueba',career_id:1,level:1,mimeType:'application/pdf',filename:'plan.pdf',content:planBytes},1);
  const response=await request('/api/backups',{body:{filename:'../../no-usar.dump',schema:'public'}});assert.equal(response.status,201);
  const backup=await response.json();assert.match(backup.filename,/^ceicom-\d{8}T\d{6}Z-[a-f0-9]{12}\.dump$/);assert.equal(backup.saved_path,`backups/${backup.filename}`);
  assert.equal(Object.hasOwn(backup,'path'),false);
  const bytes=await readFile(join(directory,backup.filename));assert.equal(bytes.subarray(0,5).toString(),'PGDMP');assert.equal(bytes.length,backup.size);
  const download=await request(backup.download_url);assert.equal(download.status,200);assert.equal(download.headers.get('cache-control'),'no-store');assert.match(download.headers.get('content-disposition'),/attachment/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
  const list=await (await request('/api/backups')).json();assert.equal(list.backups.length,1);assert.equal(list.backups[0].filename,backup.filename);
  assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),enrollments);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='Copia de seguridad creada'").get()).n,1);
  // Restaurar en una base temporal distinta comprueba el contenido real del archivo.
  const destination=`ceicom_restore_${Date.now()}_${Math.random().toString(16).slice(2,10)}`;
  await db.exec(`CREATE DATABASE "${destination}"`);
  t.after(async()=>{await db.exec(`DROP DATABASE "${destination}" WITH (FORCE)`);});
  const child=spawn('docker',['compose','exec','-T','db','pg_restore','-U','ceicom','-d',destination,'--no-owner','--no-acl','--exit-on-error'],{stdio:['pipe','ignore','pipe']});
  child.stderr.resume();const restored=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('No se pudo restaurar el respaldo de prueba.')));});child.stdin.end(bytes);await restored;
  const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/'+destination;
  const target=await openDatabase({connectionString:url.href,schema,migrate:false});
  try{assert.deepEqual((await target.prepare('SELECT content FROM study_plans WHERE id=?').get(plan.id)).content,planBytes);assert.deepEqual(await target.prepare('SELECT * FROM enrollments ORDER BY id').all(),enrollments);assert.deepEqual(await target.prepare('SELECT id,password FROM users ORDER BY id').all(),passwords);assert.ok((await target.prepare('SELECT COUNT(*) n FROM schema_migrations').get()).n>0);}finally{await target.close();}
  assert.equal((await request('/'+backup.saved_path)).status,404);
  assert.equal((await request('/api/backups/no-existe.dump')).status,404);
  assert.equal((await request('/api/backups/..%5C.env')).status,404);
});

test('no se publican archivos parciales, rutas ajenas ni enlaces y una falla permite reintentar',async()=>{
  await writeFile(join(directory,'ceicom-incompleto.dump.partial'),'parcial');
  await writeFile(join(directory,'privado.txt'),'privado');
  await symlink(join(directory,'privado.txt'),join(directory,'ceicom-enlace.dump'));
  const list=await (await request('/api/backups')).json();assert.equal(list.backups.length,1);
  assert.equal((await request('/api/backups/ceicom-enlace.dump')).status,404);
  assert.equal((await request('/api/backups/privado.txt')).status,404);
  const failedDir=join(directory,'fallido');const store=createBackupStore({...db.backupConfig,directory:failedDir,native:true});
  const previous=process.env.PG_BIN_DIR;process.env.PG_BIN_DIR=join(directory,'sin-herramientas');
  try{for(let i=0;i<2;i++)await assert.rejects(store.create(),error=>error.status===503&&error.message.includes('PG_BIN_DIR'));assert.deepEqual(await readdir(failedDir),[]);}finally{if(previous===undefined)delete process.env.PG_BIN_DIR;else process.env.PG_BIN_DIR=previous;}
});

test('una generación simultánea se rechaza y las copias siguientes conservan las anteriores',async()=>{
  const root=join(directory,'concurrente');const store=createBackupStore({...db.backupConfig,directory:root});
  const running=store.create();await assert.rejects(store.create(),error=>error.status===409);
  const first=await running,original=await readFile(join(root,first.filename));
  const second=await store.create();assert.notEqual(first.filename,second.filename);
  assert.deepEqual(await readFile(join(root,first.filename)),original);
  assert.equal((await store.list()).length,2);assert.ok((await readdir(root)).every(name=>name.endsWith('.dump')));
});
