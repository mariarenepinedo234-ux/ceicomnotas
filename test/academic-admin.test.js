import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers.js';
import {createApp} from '../server.js';
import {verifyPassword} from '../lib.js';
async function setup(t){
  const db=await testDatabase();await db.exec('UPDATE users SET must_change=0');const server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,cookies={};
  t.after(async()=>{await new Promise(r=>server.close(r));await db.cleanup();});
  async function api(path,body,role='admin'){
    const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookies[role]?{Cookie:cookies[role]}:{})},body:body?JSON.stringify(body):undefined});
    if(response.headers.has('set-cookie'))cookies[role]=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};
  }
  for(const [role,ci,password] of [['admin','admin','Ceicom2026!'],['teacher','4567890','4567890'],['student','7000001','7000001']])assert.equal((await api('login',{ci,password},role)).status,200);
  const student=await db.prepare('SELECT s.*,u.name,u.ci FROM students s JOIN users u ON u.id=s.user_id WHERE u.ci=?').get('7000001');
  const offering=await db.prepare('SELECT o.*,s.career_id,s.level,m.year_id FROM offerings o JOIN subjects s ON s.id=o.subject_id JOIN modules m ON m.id=o.module_id WHERE o.id=1').get();
  const payload={career_id:offering.career_id,level:offering.level,subject_id:offering.subject_id,shift_id:offering.shift_id,admission_year_id:student.admission_year_id,year_id:offering.year_id,module_id:offering.module_id,teacher_id:offering.teacher_id,student_ids:[student.user_id]};
  return {db,api,student,offering,payload};
}

test('grupos usan solo IDs de estudiantes registrados, filtran perfil y no crean usuarios ni alteran notas',async t=>{
  const {db,api,student,payload}=await setup(t);const users=(await db.prepare('SELECT COUNT(*) n FROM users').get()).n;
  const notes=await db.prepare('SELECT * FROM enrollments ORDER BY id').all();
  const old=await api('rosters',{admission_year:'2024',groups:[{students:['Inventado']} ]});assert.equal(old.status,400);
  assert.equal((await api('rosters',{...payload,student_ids:[999999]})).status,400);
  const other=await db.prepare('SELECT user_id FROM students WHERE career_id<>? LIMIT 1').get(payload.career_id);assert.equal((await api('rosters',{...payload,student_ids:[other.user_id]})).status,400);
  assert.equal((await api('rosters',{...payload,student_ids:[student.user_id,student.user_id]})).status,400);
  assert.equal((await api('rosters',payload)).status,200);assert.equal((await api('rosters',payload)).body.enrollments_created,0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').get()).n,users);assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),notes);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM academic_group_students').get()).n,notes.filter(e=>e.offering_id===1).length);
  const y=await db.prepare('SELECT name FROM years WHERE id=?').get(payload.year_id);
  assert.equal((await api('modules',{name:'Trimestre adicional',year_id:payload.year_id,start_date:`${y.name}-01-01`,end_date:`${y.name}-02-01`})).status,400);
});

test('inscripción por casillas admite homónimos registrados y la misma materia en distintos trimestres',async t=>{
  const {db,api,payload}=await setup(t);
  for(let i=0;i<2;i++)assert.equal((await api('users',{name:'Estudiante homónimo',ci:'',role:'student',career_id:payload.career_id,shift_id:payload.shift_id,admission_year_id:payload.admission_year_id,level:payload.level})).status,200);
  const people=await db.prepare("SELECT id FROM users WHERE name='ESTUDIANTE HOMÓNIMO' ORDER BY id").all();
  assert.equal((await api('rosters',{...payload,student_ids:[people[0].id]})).status,200);
  assert.ok(await db.prepare('SELECT id FROM enrollments WHERE offering_id=1 AND student_id=?').get(people[0].id));assert.equal(await db.prepare('SELECT id FROM enrollments WHERE offering_id=1 AND student_id=?').get(people[1].id),undefined);
  const another=await db.prepare('SELECT id FROM modules WHERE year_id=? AND id<>? LIMIT 1').get(payload.year_id,payload.module_id);
  assert.equal((await api('rosters',{...payload,module_id:another.id,student_ids:[people[0].id]})).status,200);assert.equal((await db.prepare('SELECT COUNT(*) n FROM academic_groups WHERE subject_id=?').get(payload.subject_id)).n,2);
});

test('editar inscritos conserva las notas restantes y exige confirmación y revisión vigente al retirarlas',async t=>{
  const {db,api,payload,student}=await setup(t);await api('rosters',payload);const initial=await api('offering-roster?offering_id=1');assert.equal(initial.status,200);
  const graded=initial.body.student_ids[0];await db.prepare('UPDATE enrollments SET saber=25,hacer=25,ser=15,grade=65 WHERE offering_id=1 AND student_id=?').run(graded);
  assert.equal((await api('offering-roster',{offering_id:1,student_ids:initial.body.student_ids,revision:initial.body.revision})).status,409);
  let review=(await api('offering-roster?offering_id=1')).body;const selected=review.student_ids.filter(id=>id!==graded);
  assert.equal((await api('offering-roster',{offering_id:1,student_ids:selected,revision:review.revision})).status,409);
  assert.equal((await api('offering-roster',{offering_id:1,student_ids:selected,revision:review.revision,confirm_grades:'RETIRAR CON NOTAS'})).status,200);
  assert.equal(await db.prepare('SELECT id FROM enrollments WHERE offering_id=1 AND student_id=?').get(graded),undefined);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM academic_group_students').get()).n,selected.length);
  review=(await api('offering-roster?offering_id=1')).body;
  assert.equal((await api('offering-roster',{offering_id:1,student_ids:[...selected,graded],revision:review.revision})).status,200);
  assert.equal((await db.prepare('SELECT grade FROM enrollments WHERE offering_id=1 AND student_id=?').get(graded)).grade,null);
  assert.ok(await db.prepare('SELECT user_id FROM students WHERE user_id=?').get(student.user_id));
});

test('edición de datos y CI conserva clave, identidad e historial; restablecer revoca sesiones y obliga cambio',async t=>{
  const {db,api,student}=await setup(t);const before=await db.prepare('SELECT * FROM enrollments WHERE student_id=? ORDER BY id').all(student.user_id),user=await db.prepare('SELECT * FROM users WHERE id=?').get(student.user_id);
  const edit={student_id:student.user_id,name:'Muñoz ávila corregido',ci:'ab-CI123',career_id:2,shift_id:2,admission_year_id:1,level:2,name_pending:false};
  assert.equal((await api('student-edit',edit)).status,200);let after=await db.prepare('SELECT * FROM users WHERE id=?').get(student.user_id);assert.equal(after.name,'MUÑOZ ÁVILA CORREGIDO');assert.equal(after.ci,'ab-CI123');assert.equal(after.password,user.password);assert.equal((await api('me',null,'student')).status,401);assert.deepEqual(await db.prepare('SELECT * FROM enrollments WHERE student_id=? ORDER BY id').all(student.user_id),before);
  assert.equal((await api('student-password-reset',{student_id:student.user_id,password:'corta'})).status,400);
  assert.equal((await api('student-password-reset',{student_id:student.user_id,password:'Temporal123'})).status,200);after=await db.prepare('SELECT * FROM users WHERE id=?').get(student.user_id);assert.ok(verifyPassword('Temporal123',after.password));assert.equal(after.must_change,1);
  assert.equal((await api('login',{ci:'ab-CI123',password:'7000001'},'student')).status,401);assert.equal((await api('login',{ci:'ab-CI123',password:'Temporal123'},'student')).status,200);assert.equal((await api('data',null,'student')).status,403);
  assert.equal((await api('password',{current:'Temporal123',password:'Personal123'},'student')).status,200);assert.equal((await api('data',null,'student')).status,200);
  assert.equal(JSON.stringify(await db.prepare('SELECT * FROM audit').all()).includes('Temporal123'),false);
  assert.equal((await api('student-edit',{...edit,student_id:1})).status,404);assert.equal((await api('student-password-reset',{student_id:1,password:'Temporal123'})).status,404);
});

test('eliminar estudiante muestra impacto, detecta cambios y elimina solo sus registros con auditoría conservada',async t=>{
  const {db,api,student,payload}=await setup(t);await api('rosters',payload);
  const others=await db.prepare('SELECT * FROM enrollments WHERE student_id<>? ORDER BY id').all(student.user_id);
  let impact=(await api(`academic-impact?type=student&id=${student.user_id}`)).body;assert.ok(impact.enrollments>0);
  assert.equal((await api('student-delete',{student_id:student.user_id,revision:impact.revision})).status,400);
  await db.prepare('UPDATE enrollments SET grade=75 WHERE student_id=?').run(student.user_id);
  assert.equal((await api('student-delete',{student_id:student.user_id,revision:impact.revision,confirm:'ELIMINAR ESTUDIANTE'})).status,409);
  impact=(await api(`academic-impact?type=student&id=${student.user_id}`)).body;assert.ok(impact.notes>0);await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(student.user_id,'Acción previa','Se conserva la auditoría');
  assert.equal((await api('student-delete',{student_id:student.user_id,revision:impact.revision,confirm:'ELIMINAR ESTUDIANTE'})).status,200);
  assert.equal(await db.prepare('SELECT id FROM users WHERE id=?').get(student.user_id),undefined);assert.equal((await db.prepare('SELECT COUNT(*) n FROM academic_group_students WHERE student_id=?').get(student.user_id)).n,0);assert.deepEqual(await db.prepare('SELECT * FROM enrollments WHERE student_id<>? ORDER BY id').all(student.user_id),others);assert.equal((await db.prepare("SELECT actor_id FROM audit WHERE action='Acción previa'").get()).actor_id,null);
});

test('trimestres se editan sin perder notas; eliminación confirmada retira sus asignaciones y conserva personas y otros períodos',async t=>{
  const {db,api,payload}=await setup(t);await api('rosters',payload);const module=await db.prepare('SELECT * FROM modules WHERE id=?').get(payload.module_id),notes=await db.prepare('SELECT * FROM enrollments ORDER BY id').all();
  assert.equal((await api('module-edit',{module_id:module.id,name:'Trimestre corregido',year_id:module.year_id,start_date:module.start_date,end_date:module.end_date})).status,200);assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),notes);
  const otherModule=await db.prepare('SELECT * FROM modules WHERE year_id=? AND id<>? LIMIT 1').get(module.year_id,module.id);
  assert.equal((await api('module-edit',{module_id:module.id,name:'Inválido',year_id:module.year_id,start_date:otherModule.start_date,end_date:otherModule.end_date})).status,400);
  assert.equal((await api('rosters',{...payload,module_id:otherModule.id})).status,200);
  let impact=(await api(`academic-impact?type=module&id=${module.id}`)).body;await db.prepare('UPDATE enrollments SET ser=10 WHERE offering_id=1').run();
  assert.equal((await api('module-delete',{module_id:module.id,revision:impact.revision,confirm:'ELIMINAR TRIMESTRE'})).status,409);
  impact=(await api(`academic-impact?type=module&id=${module.id}`)).body;const users=(await db.prepare('SELECT COUNT(*) n FROM users').get()).n,otherRows=(await db.query('SELECT e.* FROM enrollments e JOIN offerings o ON o.id=e.offering_id WHERE o.module_id<>$1 ORDER BY e.id',[module.id])).rows;
  assert.ok(otherRows.length>0);
  assert.equal((await api('module-delete',{module_id:module.id,revision:impact.revision,confirm:'ELIMINAR TRIMESTRE'})).status,200);assert.equal(await db.prepare('SELECT id FROM modules WHERE id=?').get(module.id),undefined);assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').get()).n,users);assert.deepEqual((await db.query('SELECT e.* FROM enrollments e JOIN offerings o ON o.id=e.offering_id WHERE o.module_id<>$1 ORDER BY e.id',[module.id])).rows,otherRows);
});

test('solo administración puede administrar estudiantes, grupos y trimestres',async t=>{
  const {api,student,payload}=await setup(t);
  for(const role of ['teacher','student','anonymous']){
    const expected=role==='anonymous'?401:403;
    for(const path of ['academic-impact?type=student&id='+student.user_id,'offering-roster?offering_id=1'])assert.equal((await api(path,null,role)).status,expected);
    for(const [path,body] of [['rosters',payload],['student-edit',{}],['student-password-reset',{}],['student-delete',{}],['module-edit',{}],['module-delete',{}],['offering-roster',{}]])assert.equal((await api(path,body,role)).status,expected);
  }
});
