import {test} from 'node:test';import assert from 'node:assert/strict';
import {testDatabase} from './helpers.js';import {createApp} from '../server.js';
async function setup(t){
 const db=await testDatabase();await db.exec('UPDATE users SET must_change=0');const server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,cookies={};t.after(async()=>{await new Promise(r=>server.close(r));await db.cleanup();});
 async function api(path,body,role='admin'){const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookies[role]?{Cookie:cookies[role]}:{})},body:body?JSON.stringify(body):undefined});if(response.headers.has('set-cookie'))cookies[role]=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};}
 for(const [role,ci,password] of [['admin','admin','Ceicom2026!'],['teacher','4567890','4567890'],['student','7000001','7000001']])assert.equal((await api('login',{ci,password},role)).status,200);
 const newCareer=async name=>{const r=await api('catalog',{type:'career',name});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.career_id;};
 return {db,api,newCareer};
}
async function snapshot(db,tables){const result={};for(const table of tables)result[table]=await db.prepare(`SELECT * FROM ${table} ORDER BY ${table==='students'?'user_id':table==='academic_group_students'?'group_id,student_id':'id'}`).all();return result;}
async function assertSnapshot(db,before){for(const [table,rows] of Object.entries(before))assert.deepEqual((await snapshot(db,[table]))[table],rows,table);}
const confirm='ELIMINAR CARRERA';

test('editar nombres por gestión preserva la identidad, otras gestiones, notas, planillas e historial',async t=>{
 const {db,api}=await setup(t);
 const oldModule=(await db.query("INSERT INTO modules(name,year_id,start_date,end_date) VALUES('HISTÓRICO',1,'2024-01-01','2024-03-31') RETURNING id")).rows[0];
 const oldOffering=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES(1,$1,1,2) RETURNING id',[oldModule.id])).rows[0];
 await db.query('INSERT INTO enrollments(student_id,offering_id,grade) VALUES(4,$1,75)',[oldOffering.id]);
 const before=await snapshot(db,['users','students','subjects','offerings','enrollments','academic_groups','academic_group_students','study_plans']);
 let response=await api('career-edit',{career_id:1,year_id:1,expected_name:'SISTEMAS INFORMÁTICOS',name:'  Analista  de Sistemas  '});assert.equal(response.status,200,JSON.stringify(response.body));
 assert.equal((await db.prepare('SELECT name FROM careers WHERE id=1').get()).name,'Sistemas Informáticos');await assertSnapshot(db,before);
 for(const role of ['admin','teacher','student']){const data=(await api('data',null,role)).body;assert.equal(data.career_names.find(c=>c.career_id===1&&c.year_id===1).name,'ANALISTA DE SISTEMAS');assert.ok(data.offerings.filter(o=>o.career_id===1&&o.year_id===3).every(o=>o.career==='SISTEMAS INFORMÁTICOS'));assert.equal(data.offerings.find(o=>o.id===oldOffering.id).career,'ANALISTA DE SISTEMAS');}
 assert.equal((await api('academic-history',null,'student')).body.student.career,'SISTEMAS INFORMÁTICOS');assert.equal((await api('reports/'+oldOffering.id)).body.offering.career,'ANALISTA DE SISTEMAS');assert.equal((await api('reports/1')).body.offering.career,'SISTEMAS INFORMÁTICOS');
 assert.equal((await api('career-edit',{career_id:1,year_id:1,expected_name:'SISTEMAS INFORMÁTICOS',name:'OTRO NOMBRE'})).status,409);
 response=await api('career-edit',{career_id:1,year_id:3,expected_name:'SISTEMAS INFORMÁTICOS',name:'INFORMÁTICA ACTUAL'});assert.equal(response.status,200,JSON.stringify(response.body));
 assert.equal((await api('reports/'+oldOffering.id)).body.offering.career,'ANALISTA DE SISTEMAS');assert.equal((await api('reports/1')).body.offering.career,'INFORMÁTICA ACTUAL');
 const history=(await api('academic-history',null,'student')).body;assert.equal(history.student.career,'INFORMÁTICA ACTUAL');assert.equal([...history.courses,...history.extras].flatMap(c=>c.attempts).find(a=>a.year==='2024').career,'ANALISTA DE SISTEMAS');await assertSnapshot(db,before);
 assert.equal((await api('career-edit',{career_id:1,expected_name:'SISTEMAS INFORMÁTICOS',name:'SIN GESTIÓN'})).status,400);
 assert.equal((await api('career-edit',{career_id:1,year_id:999999,expected_name:'SISTEMAS INFORMÁTICOS',name:'GESTIÓN INEXISTENTE'})).status,400);
});

test('crear y editar normalizan mayúsculas y espacios, evitan duplicados y rechazan campos inválidos',async t=>{
 const {db,api,newCareer}=await setup(t),id=await newCareer('  Carrera   de prueba  ');assert.equal((await db.prepare('SELECT name FROM careers WHERE id=?').get(id)).name,'CARRERA DE PRUEBA');
 assert.equal((await api('catalog',{type:'career',name:'sistemas  informáticos'})).status,409);assert.equal((await api('catalog',{type:'career',name:'carrera de prueba'})).status,409);
 for(const name of ['',null,'x'.repeat(161)])assert.equal((await api('career-edit',{career_id:id,year_id:3,expected_name:'CARRERA DE PRUEBA',name})).status,400);
 assert.equal((await api('career-edit',{career_id:id,year_id:3,expected_name:'CARRERA DE PRUEBA',name:' sistemas informáticos '})).status,409);
 assert.equal((await api('career-edit',{career_id:999999,year_id:3,expected_name:'A',name:'B'})).status,404);
 assert.equal((await api('career-edit',{career_id:'1 OR 1=1',year_id:3,expected_name:'A',name:'B'})).status,400);
 assert.equal((await db.prepare('SELECT name FROM careers WHERE id=?').get(id)).name,'CARRERA DE PRUEBA');
});

test('eliminar carrera vacía retira todas sus materias, asignaciones, series y PDF; otras carreras y cuentas se conservan',async t=>{
 const {db,api,newCareer}=await setup(t),career=await newCareer('CARRERA ERRÓNEA');
 const subjects=(await db.query("INSERT INTO subjects(name,career_id,level) VALUES('MATERIA A',$1,1),('MATERIA B',$1,2) RETURNING id",[career])).rows;
 const offering=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES($1,1,1,2) RETURNING id',[subjects[0].id])).rows[0];
 assert.equal((await api('subject-parts',{mode:'continue',offering_id:offering.id,module_id:2,teacher_id:2,student_ids:[]})).status,200);
 await db.query('INSERT INTO academic_groups(subject_id,year_id,admission_year_id,shift_id) VALUES($1,3,3,1)',[subjects[1].id]);
 const pdf=Buffer.from('%PDF-1.4\nDEMO\n%%EOF\n');await db.query("INSERT INTO study_plans(title,career_id,level,original_name,content,size_bytes,uploaded_by) VALUES('PLAN DEMO',$1,1,'demo.pdf',$2,$3,1)",[career,pdf,pdf.length]);
 await db.query("INSERT INTO career_names(career_id,year_id,name) VALUES($1,1,'NOMBRE ANTIGUO')",[career]);
 const before=await snapshot(db,['users','students','enrollments','modules']),otherSubjects=await db.prepare('SELECT * FROM subjects WHERE career_id<>? ORDER BY id').all(career),otherOfferings=await db.prepare('SELECT * FROM offerings WHERE series_id IS NULL AND id<>? ORDER BY id').all(offering.id);
 const review=(await api('career-review?career_id='+career)).body;assert.equal(review.can_delete,true);assert.equal(review.subjects,2);assert.equal(review.series,1);assert.equal(review.study_plans,1);assert.equal(review.offerings,2);
 assert.equal((await api('career-delete',{career_id:career,revision:review.revision})).status,400);
 const deleted=await api('career-delete',{career_id:career,revision:review.revision,confirm});assert.equal(deleted.status,200,JSON.stringify(deleted.body));assert.equal(await db.prepare('SELECT id FROM careers WHERE id=?').get(career),undefined);assert.equal((await db.prepare('SELECT COUNT(*) n FROM subjects WHERE career_id=?').get(career)).n,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM study_plans WHERE career_id=?').get(career)).n,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM subject_series').get()).n,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM career_names WHERE career_id=?').get(career)).n,0);
 await assertSnapshot(db,before);assert.deepEqual(await db.prepare('SELECT * FROM subjects ORDER BY id').all(),otherSubjects);assert.deepEqual(await db.prepare('SELECT * FROM offerings ORDER BY id').all(),otherOfferings);
});

test('cualquier inscripción de cualquier gestión bloquea la carrera hasta retirar al estudiante de la materia',async t=>{
 const {db,api,newCareer}=await setup(t),career=await newCareer('CARRERA ANTERIOR'),subject=(await db.query("INSERT INTO subjects(name,career_id,level) VALUES('MATERIA HISTÓRICA',$1,1) RETURNING id",[career])).rows[0],module=(await db.query("INSERT INTO modules(name,year_id,start_date,end_date) VALUES('PRIMERO 2024',1,'2024-01-01','2024-03-31') RETURNING id")).rows[0],offering=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES($1,$2,1,2) RETURNING id',[subject.id,module.id])).rows[0];
 await db.query('INSERT INTO enrollments(student_id,offering_id,grade) VALUES(4,$1,70),(5,$1,NULL)',[offering.id]);const before=await snapshot(db,['users','students','enrollments','subjects']);
 let review=(await api('career-review?career_id='+career)).body;assert.equal(review.can_delete,false);assert.equal(review.assigned_students,2);assert.equal(review.student_profiles,0);assert.equal(review.blocking_offerings[0].year,'2024');assert.equal((await api('career-delete',{career_id:career,revision:review.revision,confirm})).status,409);await assertSnapshot(db,before);
 const roster=(await api('offering-roster?offering_id='+offering.id)).body;assert.equal((await api('offering-roster',{offering_id:offering.id,student_ids:[],revision:roster.revision})).status,409);assert.equal((await api('offering-roster',{offering_id:offering.id,student_ids:[],revision:roster.revision,confirm_grades:'RETIRAR CON NOTAS'})).status,200);
 review=(await api('career-review?career_id='+career)).body;assert.equal(review.can_delete,true);assert.equal((await api('career-delete',{career_id:career,revision:review.revision,confirm})).status,200);assert.ok(await db.prepare('SELECT id FROM users WHERE id=4').get());
});

test('grupos pendientes sin asignación también bloquean; vaciarlos conserva alumnos y notas de otras materias',async t=>{
 const {db,api,newCareer}=await setup(t),career=await newCareer('CARRERA PENDIENTE'),subject=(await db.query("INSERT INTO subjects(name,career_id,level) VALUES('PENDIENTE',$1,1) RETURNING id",[career])).rows[0],group=(await db.query('INSERT INTO academic_groups(subject_id,year_id,admission_year_id,shift_id) VALUES($1,3,3,1) RETURNING id',[subject.id])).rows[0];await db.query('INSERT INTO academic_group_students(group_id,student_id) VALUES($1,4)',[group.id]);const before=await snapshot(db,['users','students','enrollments']);
 const review=(await api('career-review?career_id='+career)).body;assert.equal(review.can_delete,false);assert.equal(review.enrollments,0);assert.equal(review.pending_groups[0].students,1);assert.equal((await api('career-delete',{career_id:career,revision:review.revision,confirm})).status,409);
 let pending=(await api('pending-group-review?group_id='+group.id)).body;assert.equal((await api('pending-group-clear',{group_id:group.id,revision:pending.revision})).status,400);await db.query('INSERT INTO academic_group_students(group_id,student_id) VALUES($1,5)',[group.id]);assert.equal((await api('pending-group-clear',{group_id:group.id,revision:pending.revision,confirm:'VACIAR GRUPO'})).status,409);
 pending=(await api('pending-group-review?group_id='+group.id)).body;assert.equal((await api('pending-group-clear',{group_id:group.id,revision:pending.revision,confirm:'VACIAR GRUPO'})).status,200);await assertSnapshot(db,before);assert.equal((await api('career-review?career_id='+career)).body.can_delete,true);
});

test('perfiles sin inscripciones requieren un destino explícito, conservando año, turno, ingreso, cuenta y otras notas',async t=>{
 const {db,api,newCareer}=await setup(t),career=await newCareer('CARRERA EQUIVOCADA');await db.prepare('UPDATE students SET career_id=? WHERE user_id=4').run(career);const profile=await db.prepare('SELECT * FROM students WHERE user_id=4').get(),before=await snapshot(db,['users','enrollments']);
 const review=(await api('career-review?career_id='+career)).body;assert.equal(review.can_delete,true);assert.equal(review.student_profiles,1);
 for(const destination of [undefined,career,999999])assert.ok((await api('career-delete',{career_id:career,revision:review.revision,confirm,destination_career_id:destination})).status>=400);
 assert.deepEqual(await db.prepare('SELECT * FROM students WHERE user_id=4').get(),profile);
 const result=await api('career-delete',{career_id:career,revision:review.revision,confirm,destination_career_id:2});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.profiles_moved,1);assert.deepEqual(await db.prepare('SELECT * FROM students WHERE user_id=4').get(),{...profile,career_id:2});await assertSnapshot(db,before);
});

test('la revisión se invalida si se agregan materias; una inscripción nueva vuelve a bloquear la eliminación',async t=>{
 const {db,api,newCareer}=await setup(t),career=await newCareer('CARRERA CAMBIANTE');let review=(await api('career-review?career_id='+career)).body;
 const subject=(await db.query("INSERT INTO subjects(name,career_id,level) VALUES('NUEVA',$1,1) RETURNING id",[career])).rows[0];assert.equal((await api('career-delete',{career_id:career,revision:review.revision,confirm})).status,409);
 review=(await api('career-review?career_id='+career)).body;const offering=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES($1,4,1,2) RETURNING id',[subject.id])).rows[0];await db.query('INSERT INTO enrollments(student_id,offering_id) VALUES(4,$1)',[offering.id]);assert.equal((await api('career-delete',{career_id:career,revision:review.revision,confirm})).status,409);assert.ok(await db.prepare('SELECT id FROM careers WHERE id=?').get(career));assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='Carrera eliminada'").get()).n,0);
});

test('solo administración con contraseña actualizada puede revisar, editar, vaciar grupos o eliminar carreras',async t=>{
 const {db,api}=await setup(t);for(const role of ['teacher','student','anonymous']){const expected=role==='anonymous'?401:403;for(const path of ['career-review?career_id=1','pending-group-review?group_id=1'])assert.equal((await api(path,null,role)).status,expected);for(const path of ['career-edit','career-delete','pending-group-clear'])assert.equal((await api(path,{},role)).status,expected);}
 await db.exec('UPDATE users SET must_change=1 WHERE id=1');assert.equal((await api('career-review?career_id=1')).status,403);assert.equal((await api('career-delete',{})).status,403);
});

test('una inscripción concurrente y la eliminación no pueden dejar estudiantes huérfanos ni borrar su nota',async t=>{
 const {db,api,newCareer}=await setup(t),career=await newCareer('CARRERA CONCURRENTE');await db.prepare('UPDATE students SET career_id=? WHERE user_id=4').run(career);
 const subject=(await db.query("INSERT INTO subjects(name,career_id,level) VALUES('MATERIA CONCURRENTE',$1,1) RETURNING id",[career])).rows[0],offering=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES($1,4,1,2) RETURNING id',[subject.id])).rows[0];
 const review=(await api('career-review?career_id='+career)).body,roster=(await api('offering-roster?offering_id='+offering.id)).body;
 const [enrolled,deleted]=await Promise.all([api('offering-roster',{offering_id:offering.id,student_ids:[4],revision:roster.revision}),api('career-delete',{career_id:career,revision:review.revision,confirm,destination_career_id:2})]);
 if(enrolled.status===200){assert.equal(deleted.status,409);assert.ok(await db.prepare('SELECT id FROM careers WHERE id=?').get(career));assert.ok(await db.prepare('SELECT id FROM enrollments WHERE offering_id=? AND student_id=4').get(offering.id));}
 else{assert.equal(deleted.status,200,JSON.stringify(deleted.body));assert.equal(enrolled.status,404);assert.equal(await db.prepare('SELECT id FROM careers WHERE id=?').get(career),undefined);assert.equal((await db.prepare('SELECT career_id FROM students WHERE user_id=4').get()).career_id,2);}
 assert.equal((await db.prepare('SELECT grade FROM enrollments WHERE student_id=4 AND offering_id=6').get()).grade,65);
});

test('los nombres propios de una gestión no se confunden con otras carreras ni con revisiones anteriores',async t=>{
 const {api,newCareer}=await setup(t),career=await newCareer('CARRERA CON OTRO NOMBRE');
 assert.equal((await api('career-edit',{career_id:1,year_id:1,name:'ANALISTA DE SISTEMAS',expected_name:'SISTEMAS INFORMÁTICOS'})).status,200);
 assert.equal((await api('catalog',{type:'career',name:'analista de sistemas'})).status,409);
 assert.equal((await api('career-edit',{career_id:career,year_id:1,name:'analista de sistemas',expected_name:'CARRERA CON OTRO NOMBRE'})).status,409);
 assert.equal((await api('career-edit',{career_id:career,year_id:2,name:'analista de sistemas',expected_name:'CARRERA CON OTRO NOMBRE'})).status,200);
 assert.equal((await api('career-edit',{career_id:career,year_id:2,name:'NOMBRE OBSOLETO',expected_name:'CARRERA CON OTRO NOMBRE'})).status,409);
});
