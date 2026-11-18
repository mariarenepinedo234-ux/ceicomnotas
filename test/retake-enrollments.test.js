import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers.js';
import {createApp} from '../server.js';
async function setup(t){
  const db=await testDatabase();await db.exec(`UPDATE users SET must_change=0;UPDATE students SET level=3,admission_year_id=1 WHERE user_id=4;DELETE FROM enrollments WHERE student_id=4 AND offering_id=1;UPDATE enrollments SET grade=35 WHERE student_id=4 AND offering_id=6;`);
  const server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await db.cleanup();});
  const cookies={},base=`http://127.0.0.1:${server.address().port}`;
  async function api(path,body,role='admin'){const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),Cookie:cookies[role]||''},body:body?JSON.stringify(body):undefined});if(response.headers.has('set-cookie'))cookies[role]=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};}
  assert.equal((await api('login',{ci:'admin',password:'Ceicom2026!'})).status,200);
  const payload={career_id:1,level:1,subject_id:1,admission_year_id:3,year_id:3,shift_id:1,module_id:4,teacher_id:2,student_ids:[5]};assert.equal((await api('rosters',payload)).status,200);
  const previous=await db.prepare('SELECT * FROM enrollments WHERE student_id=4 AND offering_id=6').get(),profile=await db.prepare('SELECT * FROM students WHERE user_id=4').get();
  return {db,api,payload,previous,profile};
}
test('alumno de 3º/ingreso 2024 recursa 1º con otro ingreso, opt-in explícito y nota anterior intacta',async t=>{
  const {db,api,previous,profile}=await setup(t),request={student_id:4,offering_id:1};
  assert.equal((await api('enrollments',request)).status,400);assert.equal((await api('enrollments',{...request,allow_retake:'false'})).status,400);
  assert.equal((await api('enrollments',{...request,allow_retake:true})).status,200);const added=await db.prepare('SELECT * FROM enrollments WHERE student_id=4 AND offering_id=1').get();assert.equal(added.is_retake,true);assert.equal(added.grade,null);
  assert.equal((await api('enrollments',{...request,allow_retake:true})).status,400);
  assert.deepEqual(await db.prepare('SELECT * FROM enrollments WHERE id=?').get(previous.id),previous);assert.deepEqual(await db.prepare('SELECT * FROM students WHERE user_id=4').get(),profile);
  const group=await db.prepare('SELECT * FROM academic_groups WHERE offering_id=1').get();assert.equal(group.admission_year_id,3);assert.ok(await db.prepare('SELECT * FROM academic_group_students WHERE group_id=? AND student_id=4').get(group.id));assert.equal((await api('data')).body.academic_groups.find(g=>g.id===group.id).retake_count,1);
  assert.ok(await db.prepare("SELECT id FROM audit WHERE action='Materia pendiente inscrita'").get());
  await api('login',{ci:'7000001',password:'7000001'},'student');const record=(await api('data',null,'student')).body;assert.equal(record.enrollments.find(e=>e.id===previous.id).grade,35);assert.equal(record.enrollments.find(e=>e.id===added.id).is_retake,true);
});
test('pendientes no permiten otra carrera/turno, adelantar año ni cambiar ingreso de alumnos regulares',async t=>{
  const {db,api}=await setup(t);
  const second=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES (3,2,1,2) RETURNING id')).rows[0].id;
  assert.equal((await api('enrollments',{student_id:4,offering_id:second,allow_retake:true})).status,200);
  for(const request of [{student_id:4,offering_id:4},{student_id:4,offering_id:3},{student_id:5,offering_id:second}])assert.equal((await api('enrollments',{...request,allow_retake:true})).status,400);
  await db.exec('DELETE FROM enrollments WHERE student_id=8 AND offering_id=1;UPDATE students SET admission_year_id=1 WHERE user_id=8');assert.equal((await api('enrollments',{student_id:8,offering_id:1,allow_retake:true})).status,400);
});
test('registrar grupo admite pendientes de ingreso distinto, sin cambiar grupo base ni duplicar intentos',async t=>{
  const {db,api,payload,previous,profile}=await setup(t),pending={...payload,student_ids:[4],admission_year_id:1};
  assert.equal((await api('rosters',pending)).status,400);const result=await api('rosters',{...pending,allow_retake:'true'});assert.equal(result.status,200);assert.equal(result.body.enrollments_created,1);
  assert.equal((await api('rosters',{...pending,allow_retake:true})).body.enrollments_created,0);assert.equal((await db.prepare('SELECT * FROM enrollments WHERE student_id=4 AND offering_id=1').get()).is_retake,true);
  assert.deepEqual(await db.prepare('SELECT * FROM enrollments WHERE id=?').get(previous.id),previous);assert.deepEqual(await db.prepare('SELECT * FROM students WHERE user_id=4').get(),profile);assert.equal((await db.prepare('SELECT admission_year_id FROM academic_groups WHERE offering_id=1').get()).admission_year_id,3);
  assert.equal((await api('rosters',{...pending,allow_retake:true,admission_year_id:2})).status,400);
});
test('editar inscritos filtra pendientes, exige opt-in solo al agregarlos y conserva notas/revisión',async t=>{
  const {db,api,previous}=await setup(t);let review=(await api('offering-roster?offering_id=1')).body;const candidate=review.students.find(s=>s.user_id===4);assert.equal(candidate.retake_candidate,true);assert.equal(candidate.admission_year,'2024');
  const request={offering_id:1,student_ids:[...review.student_ids,4],revision:review.revision};assert.equal((await api('offering-roster',request)).status,400);assert.equal((await api('offering-roster',{...request,allow_retake:true})).status,200);
  review=(await api('offering-roster?offering_id=1')).body;assert.equal((await api('offering-roster',{offering_id:1,student_ids:review.student_ids,revision:review.revision})).status,200);assert.equal((await db.prepare('SELECT * FROM enrollments WHERE student_id=4 AND offering_id=1').get()).is_retake,true);assert.deepEqual(await db.prepare('SELECT * FROM enrollments WHERE id=?').get(previous.id),previous);
  for(const [role,ci] of [['teacher','4567890'],['student','7000001']]){await api('login',{ci,password:ci},role);assert.equal((await api('enrollments',{student_id:4,offering_id:1,allow_retake:true},role)).status,403);assert.equal((await api('offering-roster',request,role)).status,403);}
});
