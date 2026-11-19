import {test} from 'node:test';import assert from 'node:assert/strict';
import {testDatabase} from './helpers.js';import {createApp} from '../server.js';import {moduleForAdmission} from '../public/module-calendar.js';import {deadlineFor} from '../lib.js';
async function setup(t){
 const db=await testDatabase();await db.exec('UPDATE users SET must_change=0');const server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await db.cleanup();});const base=`http://127.0.0.1:${server.address().port}`,cookies={};
 async function api(path,body,role='admin'){const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookies[role]||''},body:body?JSON.stringify(body):undefined});if(response.headers.has('set-cookie'))cookies[role]=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};}
 await api('login',{ci:'admin',password:'Ceicom2026!'});return {db,api};
}
const fourth={name:'CUARTO TRIMESTRE PRIMER AÑO 2026',year_id:3,admission_year_id:3,start_date:'2026-09-07',end_date:'2026-11-30'};
test('calendario 2026 coincide con compartido y otros ingresos sin cambiar notas, módulos anteriores ni plazos',async t=>{
 const {db,api}=await setup(t),old=await db.prepare('SELECT * FROM modules ORDER BY id').all(),notes=await db.prepare('SELECT * FROM enrollments ORDER BY id').all();
 assert.equal((await api('modules',fourth)).status,200);assert.equal((await api('modules',{...fourth,admission_year_id:2})).status,200);
 const all=await db.prepare('SELECT * FROM modules ORDER BY id').all(),short=all.find(m=>m.admission_year_id===3);
 assert.deepEqual(all.filter(m=>m.id<=4),old);assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),notes);
 assert.equal(moduleForAdmission(short,all,3),true);assert.equal(moduleForAdmission(short,all,1),false);assert.equal(moduleForAdmission(old[3],all,3),false);assert.equal(moduleForAdmission(old[3],all,1),true);assert.equal(moduleForAdmission(old[2],all,3),false);assert.equal(moduleForAdmission(old[0],all,3),true);
 assert.notEqual(deadlineFor(short.end_date),deadlineFor(old[3].end_date));assert.equal(short.end_date,'2026-11-30');
});
test('cuatro módulos y superposición se validan dentro del calendario elegido, incluso con peticiones simultáneas',async t=>{
 const {db,api}=await setup(t);assert.equal((await api('modules',fourth)).status,200);
 const overlap=await api('modules',{...fourth,name:'SUPERPUESTO',start_date:'2026-09-15'});assert.equal(overlap.status,400);assert.match(overlap.body.error,/2026-09-07.*2026-11-30/);
 for(const [name,start,end] of [['PRIMERO','2026-01-01','2026-03-31'],['SEGUNDO','2026-04-01','2026-06-30'],['TERCERO','2026-07-01','2026-09-06']])assert.equal((await api('modules',{...fourth,name,start_date:start,end_date:end})).status,200);
 assert.equal((await api('modules',{...fourth,name:'QUINTO',start_date:'2026-12-01',end_date:'2026-12-18'})).status,400);
 const attempts=await Promise.all(['A','B'].map(name=>api('modules',{...fourth,admission_year_id:1,name})));assert.deepEqual(attempts.map(r=>r.status).sort(),[200,400]);
 assert.equal((await api('modules',{...fourth,admission_year_id:9999})).status,400);
});
test('inscripción, grupo y edición respetan calendario propio y admiten la excepción de materia pendiente',async t=>{
 const {db,api}=await setup(t);await api('modules',fourth);const module=await db.prepare('SELECT * FROM modules WHERE admission_year_id=3').get();
 assert.equal((await api('offerings',{subject_id:1,career_id:1,module_id:module.id,shift_id:1,teacher_id:2})).status,200);const offering=await db.prepare('SELECT * FROM offerings WHERE module_id=?').get(module.id);
 await db.exec('UPDATE students SET admission_year_id=1 WHERE user_id=6;UPDATE students SET level=3,admission_year_id=1 WHERE user_id=4;DELETE FROM enrollments WHERE student_id=5 AND offering_id=1');
 assert.equal((await api('enrollments',{student_id:5,offering_id:1})).status,400);assert.equal((await api('enrollments',{student_id:5,offering_id:offering.id})).status,200);assert.equal((await api('enrollments',{student_id:6,offering_id:offering.id})).status,400);
 assert.equal((await api('enrollments',{student_id:4,offering_id:offering.id,allow_retake:true})).status,200);assert.equal((await db.prepare('SELECT is_retake FROM enrollments WHERE student_id=4 AND offering_id=?').get(offering.id)).is_retake,true);
 let review=(await api('offering-roster?offering_id='+offering.id)).body;assert.ok(!review.students.some(s=>s.user_id===6));assert.ok(review.students.some(s=>s.user_id===4));
 assert.equal((await api('offering-roster',{offering_id:offering.id,student_ids:[...review.student_ids,6],revision:review.revision})).status,400);
 const payload={career_id:1,level:1,subject_id:1,admission_year_id:1,year_id:3,module_id:module.id,shift_id:1,teacher_id:2,student_ids:[6]};assert.equal((await api('rosters',payload)).status,400);
 assert.equal((await api('rosters',{...payload,admission_year_id:3,student_ids:[7]})).status,200);
 const record=await db.prepare('SELECT * FROM modules WHERE id=?').get(module.id);assert.equal((await api('module-edit',{...fourth,module_id:record.id,admission_year_id:1})).status,409);assert.equal((await db.prepare('SELECT admission_year_id FROM modules WHERE id=?').get(module.id)).admission_year_id,3);
});
test('editar calendario vacío conserva IDs y notas; únicamente administración crea o modifica calendarios',async t=>{
 const {db,api}=await setup(t),notes=await db.prepare('SELECT * FROM enrollments ORDER BY id').all();await api('modules',fourth);let module=await db.prepare('SELECT * FROM modules WHERE admission_year_id=3').get();
 assert.equal((await api('module-edit',{...fourth,module_id:module.id,end_date:'2026-11-29'})).status,200);assert.equal((await db.prepare('SELECT end_date FROM modules WHERE id=?').get(module.id)).end_date,'2026-11-29');assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),notes);
 for(const [role,ci] of [['teacher','4567890'],['student','7000001']]){await api('login',{ci,password:ci},role);assert.equal((await api('modules',fourth,role)).status,403);assert.equal((await api('module-edit',{...fourth,module_id:module.id},role)).status,403);}
});
