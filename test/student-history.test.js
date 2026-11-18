import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAcademicHistory} from '../public/history-summary.js';
import {testDatabase} from './helpers.js';
import {createApp} from '../server.js';
import {updateReviewedSubjectCatalog} from '../subject-catalog-update.js';

test('avance por materia: una aprobación supera intentos reprobados, pendientes no son reprobados y extras no suman',()=>{
  const subjects=[1,2,3,7,8].map((id,i)=>({id,name:'MATERIA '+id,career_id:1,level:i<3?1:3,code:'MAT-'+(101+i),active:true,catalog_order:i+1}));subjects.push({id:4,name:'POWER BI',career_id:1,level:3,active:true,catalog_order:null});
  const make=(subject_id,grade,end_date,enrollment_id)=>({subject_id,subject:'MATERIA '+subject_id,level:1,career_id:subject_id===6?2:1,grade,end_date,enrollment_id});
  const attempts=[make(1,35,'2024-03-31',1),make(1,65,'2026-09-30',2),make(1,null,'2026-12-18',3),make(2,45,'2026-09-30',4),make(3,null,'2026-12-18',5),make(8,null,'2026-06-30',6),make(4,80,'2026-09-30',7),make(5,45,'2025-09-30',8),make(6,99,'2025-09-30',9)];
  const original=structuredClone({subjects,attempts}),result=summarizeAcademicHistory(subjects,attempts,{today:'2026-11-18'});
  assert.equal(result.plan_source,'official');assert.deepEqual(result.courses.map(c=>c.id),[1,2,3,7,8]);assert.deepEqual(result.courses.map(c=>c.state),['approved','failed','enrolled','not_enrolled','awaiting_grade']);assert.equal(result.courses[0].grade,65);assert.equal(result.courses[0].attempts.length,3);
  assert.deepEqual(result.summary,{total:5,approved:1,remaining:4,not_enrolled:1,failed:1,enrolled:1,awaiting_grade:1,progress:20,extras:3});assert.equal(result.extras.length,3);assert.deepEqual({subjects,attempts},original);
});
test('se usa el catálogo registrado si no hay orden oficial; sin intentos no se inventan notas ni aprobaciones',()=>{
  const subjects=[{id:1,name:'B',career_id:1,level:1,code:'B-102',active:true,catalog_order:null},{id:2,name:'A',career_id:1,level:1,code:'A-101',active:true,catalog_order:null},{id:3,name:'INACTIVA',career_id:1,level:3,active:false,catalog_order:1}];
  const result=summarizeAcademicHistory(subjects,[]);assert.equal(result.plan_source,'registered');assert.equal(result.summary.total,2);assert.equal(result.summary.not_enrolled,2);assert.equal(result.summary.approved,0);assert.deepEqual(result.courses.map(c=>c.id),[2,1]);assert.ok(result.courses.every(c=>c.grade===null&&c.attempts.length===0));assert.equal(summarizeAcademicHistory([],[]).summary.progress,0);
});
test('la nota del intento más reciente determina reprobada o pendiente cuando no hay ninguna aprobación',()=>{
  const subject={id:1,name:'MATERIA',career_id:1,level:1,active:true,catalog_order:1},old={subject_id:1,enrollment_id:1,end_date:'2025-03-31',grade:null},latest={subject_id:1,enrollment_id:2,end_date:'2026-09-30',grade:50};
  assert.equal(summarizeAcademicHistory([subject],[old,latest]).courses[0].state,'failed');
  assert.equal(summarizeAcademicHistory([subject],[{...old,grade:35},{...latest,grade:null}],{today:'2026-11-18'}).courses[0].state,'awaiting_grade');
});
test('API de historial usa solo el alumno autenticado y su carrera, conserva registros de otros planes y protege acceso',async t=>{
  const db=await testDatabase();await db.exec('UPDATE users SET must_change=0');await updateReviewedSubjectCatalog(db);
  const official=await db.prepare('SELECT * FROM subjects WHERE career_id=1 AND catalog_order IS NOT NULL ORDER BY level,catalog_order LIMIT 1').get();
  const offerings=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES ($1,2,1,2),($1,4,1,2) RETURNING id,module_id',[official.id])).rows;
  await db.query('INSERT INTO enrollments(student_id,offering_id,grade,is_retake) VALUES (4,$1,35,false),(4,$2,65,true),(5,$2,99,false)',[offerings[0].id,offerings[1].id]);await db.exec('UPDATE students SET level=3,admission_year_id=1 WHERE user_id=4');
  await db.exec('INSERT INTO enrollments(student_id,offering_id,grade) VALUES (4,4,90)');
  const before=await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),profiles=await db.prepare('SELECT * FROM students ORDER BY user_id').all(),server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await db.cleanup();});const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  async function request(path,body){const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};}
  assert.equal((await request('academic-history')).status,401);
  for(const [ci,password] of [['admin','Ceicom2026!'],['4567890','4567890']]){assert.equal((await request('login',{ci,password})).status,200);assert.equal((await request('academic-history')).status,403);}
  assert.equal((await request('login',{ci:'7000001',password:'7000001'})).status,200);const response=await request('academic-history?student_id=5');assert.equal(response.status,200);const history=response.body;
  assert.equal(history.student.user_id,4);assert.equal(history.student.level,3);assert.equal(history.student.admission_year,'2024');assert.ok(history.courses.every(c=>c.career_id===1));assert.ok([...history.courses,...history.extras].flatMap(c=>c.attempts).every(a=>a.student_id===4));
  const approved=history.courses.find(c=>c.id===official.id);assert.equal(approved.state,'approved');assert.equal(approved.grade,65);assert.deepEqual(approved.attempts.map(a=>a.grade),[65,35]);assert.ok(history.extras.some(c=>c.career_id===2));assert.ok(history.courses.some(c=>c.state==='not_enrolled'));assert.ok(!JSON.stringify(history).includes('password'));
  await db.exec('UPDATE users SET blocked=1 WHERE id=4');assert.equal((await request('academic-history')).status,403);await db.exec('UPDATE users SET blocked=0,must_change=1 WHERE id=4');assert.equal((await request('academic-history')).status,403);
  assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),before);assert.deepEqual(await db.prepare('SELECT * FROM students ORDER BY user_id').all(),profiles);
});
