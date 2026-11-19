import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers.js';
import {createApp} from '../server.js';
async function setup(t){
 const db=await testDatabase();await db.exec('UPDATE users SET must_change=0');const server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,cookies={};
 t.after(async()=>{await new Promise(r=>server.close(r));await db.cleanup();});
 async function api(path,body,role='admin'){const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookies[role]?{Cookie:cookies[role]}:{})},body:body?JSON.stringify(body):undefined});if(response.headers.has('set-cookie'))cookies[role]=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};}
 for(const [role,ci,password] of [['admin','admin','Ceicom2026!'],['teacher','4567890','4567890'],['student','7000001','7000001']])assert.equal((await api('login',{ci,password},role)).status,200);
 return {db,api};
}
test('retirar materia vacía de un módulo requiere revisión y conserva catálogo, personas y otros grupos',async t=>{
 const {db,api}=await setup(t),target=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES(1,1,1,2) RETURNING id')).rows[0];
 const people=await db.prepare('SELECT * FROM users ORDER BY id').all(),catalog=await db.prepare('SELECT * FROM subjects ORDER BY id').all(),modules=await db.prepare('SELECT * FROM modules ORDER BY id').all(),notes=await db.prepare('SELECT * FROM enrollments ORDER BY id').all();
 const impact=(await api(`academic-impact?type=offering&id=${target.id}`)).body;assert.equal(impact.enrollments,0);assert.equal(impact.notes,0);assert.match(impact.context,/SISTEMAS INFORMÁTICOS · 1º AÑO · MAÑANA/);
 assert.equal((await api('offering-delete',{offering_id:target.id,revision:impact.revision})).status,400);assert.equal((await api('offering-delete',{offering_id:target.id,revision:'obsoleta',confirm:'ELIMINAR ASIGNACION'})).status,409);
 assert.equal((await api('offering-delete',{offering_id:target.id,revision:impact.revision,confirm:'ELIMINAR ASIGNACION'})).status,200);assert.equal(await db.prepare('SELECT * FROM offerings WHERE id=?').get(target.id),undefined);
 assert.deepEqual(await db.prepare('SELECT * FROM users ORDER BY id').all(),people);assert.deepEqual(await db.prepare('SELECT * FROM subjects ORDER BY id').all(),catalog);assert.deepEqual(await db.prepare('SELECT * FROM modules ORDER BY id').all(),modules);assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),notes);
 assert.equal((await api('offering-delete',{offering_id:target.id,revision:impact.revision,confirm:'ELIMINAR ASIGNACION'})).status,404);
});
test('retirar asignación con alumnos elimina solo su lista y notas, detecta cambios y conserva otros trimestres',async t=>{
 const {db,api}=await setup(t);await db.exec('UPDATE enrollments SET saber=30,hacer=30,ser=15,grade=75 WHERE offering_id=1 AND student_id=4');
 await api('rosters',{career_id:1,level:1,subject_id:1,shift_id:1,admission_year_id:3,year_id:3,module_id:4,teacher_id:2,student_ids:[4,5]});
 const otherNotes=await db.prepare('SELECT * FROM enrollments WHERE offering_id<>1 ORDER BY id').all(),people=await db.prepare('SELECT * FROM users ORDER BY id').all();
 let impact=(await api('academic-impact?type=offering&id=1')).body;assert.equal(impact.enrollments,5);assert.equal(impact.notes,1);assert.equal(impact.groups,1);
 await db.exec('UPDATE enrollments SET grade=80 WHERE offering_id=1 AND student_id=4');assert.equal((await api('offering-delete',{offering_id:1,revision:impact.revision,confirm:'ELIMINAR ASIGNACION'})).status,409);
 impact=(await api('academic-impact?type=offering&id=1')).body;const group=(await db.prepare('SELECT id FROM academic_groups WHERE offering_id=1').get()).id;
 assert.equal((await api('offering-delete',{offering_id:1,revision:impact.revision,confirm:'ELIMINAR ASIGNACION'})).status,200);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM enrollments WHERE offering_id=1').get()).n,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM academic_groups WHERE offering_id=1').get()).n,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM academic_group_students WHERE group_id=?').get(group)).n,0);
 assert.deepEqual(await db.prepare('SELECT * FROM enrollments WHERE offering_id<>1 ORDER BY id').all(),otherNotes);assert.deepEqual(await db.prepare('SELECT * FROM users ORDER BY id').all(),people);assert.ok(await db.prepare('SELECT id FROM subjects WHERE id=1').get());assert.ok(await db.prepare('SELECT id FROM offerings WHERE id=6').get());assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='Materia retirada del módulo'").get()).n,1);
});
test('asignaciones de una materia por partes quedan protegidas y solo administración puede eliminar',async t=>{
 const {db,api}=await setup(t);
 for(const role of ['teacher','student','anonymous']){const status=role==='anonymous'?401:403;assert.equal((await api('academic-impact?type=offering&id=1',null,role)).status,status);assert.equal((await api('offering-delete',{offering_id:1,confirm:'ELIMINAR ASIGNACION'},role)).status,status);}
 assert.equal((await api('subject-parts/link',{offering_id:6,target_offering_id:1,expected_part_count:1})).status,200);
 const before=await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),impact=(await api('academic-impact?type=offering&id=1')).body;assert.match(impact.deletion_blocked,/partes/);
 assert.equal((await api('offering-delete',{offering_id:1,revision:impact.revision,confirm:'ELIMINAR ASIGNACION'})).status,409);assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),before);assert.ok(await db.prepare('SELECT id FROM offerings WHERE id=1').get());
});
test('lista vacía explica alumnos de años superiores y conserva perfiles al inscribirlos únicamente como pendientes',async t=>{
 const {db,api}=await setup(t);await db.exec('DELETE FROM enrollments WHERE offering_id=1;UPDATE students SET level=3,admission_year_id=1 WHERE career_id=1 AND shift_id=1');
 const profiles=await db.prepare('SELECT * FROM students ORDER BY user_id').all(),other=await db.prepare('SELECT * FROM enrollments ORDER BY id').all();
 const response=await api('offering-roster?offering_id=1');assert.equal(response.status,200);const review=response.body;assert.deepEqual(review.scope.levels,{'1':0,'2':0,'3':5});assert.equal(review.scope.level,1);assert.equal(review.scope.regular_eligible,0);assert.ok(review.students.every(s=>s.retake_candidate));
 const request={offering_id:1,revision:review.revision,student_ids:[4,5]};assert.equal((await api('offering-roster',request)).status,400);assert.equal((await api('offering-roster',{...request,allow_retake:true})).status,200);
 assert.deepEqual(await db.prepare('SELECT * FROM students ORDER BY user_id').all(),profiles);assert.ok((await db.prepare('SELECT * FROM enrollments WHERE offering_id=1').all()).every(e=>e.is_retake));for(const row of other)assert.deepEqual(await db.prepare('SELECT * FROM enrollments WHERE id=?').get(row.id),row);
});
test('diagnóstico distingue alumnos del año correcto excluidos por ingreso o calendario, sin ampliar su elegibilidad',async t=>{
 const {db,api}=await setup(t);await db.exec('DELETE FROM enrollments WHERE offering_id=1;UPDATE modules SET admission_year_id=2 WHERE id=4');
 const review=(await api('offering-roster?offering_id=1')).body;assert.deepEqual(review.scope.levels,{'1':5,'2':0,'3':0});assert.equal(review.scope.regular_eligible,0);assert.equal(review.students.length,0);
 assert.equal((await api('offering-roster',{offering_id:1,revision:review.revision,student_ids:[4]})).status,400);assert.equal((await db.prepare('SELECT COUNT(*) n FROM enrollments WHERE offering_id=1').get()).n,0);
});
