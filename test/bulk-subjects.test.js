import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers.js';
import {createApp} from '../server.js';

async function setup(t){
  const db=await testDatabase();await db.exec('UPDATE users SET must_change=0');
  const server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));await db.cleanup();});
  const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  const call=async(path,body)=>{const response=await fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};};
  assert.equal((await call('login',{ci:'admin',password:'Ceicom2026!'})).status,200);
  return {db,call};
}

test('creación múltiple de ORATORIA respeta carreras/año, conserva historial y omite coincidencias sin modificar',async t=>{
  const {db,call}=await setup(t),careers=[1,2,3,4,5,6];
  const notes=await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),offerings=await db.prepare('SELECT * FROM offerings ORDER BY id').all(),old=await db.prepare('SELECT * FROM subjects ORDER BY id').all();
  const payload={name:'Oratoria',code:'ora-301',career_ids:careers,level:3};
  const result=await call('subjects',payload);assert.equal(result.status,200);assert.equal(result.body.created,6);assert.equal(result.body.existing,0);assert.equal(result.body.subject_ids.length,6);
  const rows=await db.prepare("SELECT * FROM subjects WHERE name='ORATORIA' ORDER BY career_id").all();assert.deepEqual(rows.map(r=>r.career_id),careers);assert.ok(rows.every(r=>r.level===3&&r.code==='ORA-301'&&r.active&&r.catalog_order===null));
  await db.prepare('UPDATE subjects SET active=false WHERE id=?').run(rows[0].id);
  const repeat=await call('subjects',payload);assert.equal(repeat.status,200);assert.equal(repeat.body.created,0);assert.equal(repeat.body.existing,6);assert.deepEqual(repeat.body.subject_ids,result.body.subject_ids);assert.equal((await db.prepare('SELECT active FROM subjects WHERE id=?').get(rows[0].id)).active,false);
  assert.deepEqual(await db.prepare('SELECT * FROM subjects WHERE id<=5 ORDER BY id').all(),old);assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),notes);assert.deepEqual(await db.prepare('SELECT * FROM offerings ORDER BY id').all(),offerings);
});

test('validación y conflicto en una carrera revierten todo el lote y su auditoría',async t=>{
  const {db,call}=await setup(t);
  assert.equal((await call('subjects',{name:'Otra materia',code:'ORA-301',career_id:2,level:3})).status,200);
  const snapshot=await db.prepare('SELECT * FROM subjects ORDER BY id').all(),audit=await db.prepare('SELECT * FROM audit ORDER BY id').all();
  const payload={name:'Oratoria',code:'ORA-301',career_ids:[1,2],level:3};
  const conflict=await call('subjects',payload);assert.equal(conflict.status,400);assert.match(conflict.body.error,/ya existe.*Contaduría/i);
  for(const invalid of [{career_ids:[]},{career_ids:[1,1]},{career_ids:[1,99999]},{career_ids:'todas'},{career_ids:[0]},{level:4},{name:''},{code:'no es válido'}])assert.equal((await call('subjects',{...payload,...invalid})).status,400);
  assert.deepEqual(await db.prepare('SELECT * FROM subjects ORDER BY id').all(),snapshot);assert.deepEqual(await db.prepare('SELECT * FROM audit ORDER BY id').all(),audit);
});

test('solicitudes simultáneas sin código no duplican materias comunes; docentes y estudiantes no crean',async t=>{
  const {db,call}=await setup(t),payload={name:'Taller de oratoria',code:'',career_ids:[1,2,3],level:3};
  const results=await Promise.all([call('subjects',payload),call('subjects',payload)]);assert.ok(results.every(r=>r.status===200));assert.deepEqual(results.map(r=>r.body.created).sort(),[0,3]);assert.equal((await db.prepare("SELECT count(*) n FROM subjects WHERE name='TALLER DE ORATORIA'").get()).n,3);
  const sameName=await call('subjects',{...payload,code:'OTR-301'});assert.equal(sameName.status,400);
  for(const ci of ['4567890','7000001']){assert.equal((await call('login',{ci,password:ci})).status,200);assert.equal((await call('subjects',payload)).status,403);}
});
