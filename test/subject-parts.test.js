import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {testDatabase} from './helpers.js';
import {migrateDatabase} from '../db.js';
import {createApp} from '../server.js';
import {summarizeSeries,romanPart,partTitle} from '../public/part-summary.js';
import {summarizeAcademicHistory} from '../public/history-summary.js';
import {reportData,renderExcel,renderPdf} from '../reports.js';
import {planillaHTML} from '../public/planilla.js';
const attempt=(part_number,grade,extra={})=>({series_id:1,part_count:3,series_complete:true,part_number,grade,enrollment_id:part_number,end_date:`2026-0${part_number*3}-28`,subject_id:1,...extra});
test('migración desde versión 008 conserva usuarios, contraseñas, asignaciones e inscripciones con sus notas',async t=>{
  const db=await testDatabase();t.after(()=>db.cleanup());
  // Reconstruir únicamente el esquema anterior en esta base temporal aislada.
  await db.exec("ALTER TABLE offerings DROP COLUMN series_id CASCADE,DROP COLUMN part_number CASCADE,DROP COLUMN part_recovery CASCADE;DROP TABLE subject_series;DELETE FROM schema_migrations WHERE name='009_subject_parts.sql'");
  const users=await db.prepare('SELECT * FROM users ORDER BY id').all(),offerings=await db.prepare('SELECT * FROM offerings ORDER BY id').all(),notes=await db.prepare('SELECT * FROM enrollments ORDER BY id').all();
  await migrateDatabase(db);await migrateDatabase(db);
  assert.deepEqual(await db.prepare('SELECT * FROM users ORDER BY id').all(),users);assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),notes);
  assert.deepEqual(await db.prepare('SELECT * FROM offerings ORDER BY id').all(),offerings.map(o=>({...o,series_id:null,part_number:null,part_recovery:false})));
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM subject_series').get()).n,0);
});
test('promedio de todas las partes con igual peso, dos decimales y aprobación individual sin usar la mayor nota',()=>{
  const rows=[attempt(1,65),attempt(2,75),attempt(3,85)],before=structuredClone(rows),summary=summarizeSeries(rows);
  assert.equal(summary.grade,75);assert.equal(summary.state,'approved');assert.equal(summary.parts.length,3);assert.deepEqual(rows,before);
  const failed=summarizeSeries([attempt(1,40),attempt(2,100),attempt(3,100)]);assert.equal(failed.grade,80);assert.equal(failed.state,'failed');assert.match(failed.note,/PARTE I: POR RECUPERAR/);
  assert.equal(summarizeSeries([attempt(1,61),attempt(2,62),attempt(3,65)]).grade,62.67);
  assert.equal(summarizeSeries([attempt(1,60.99),attempt(2,100),attempt(3,100)]).state,'failed');
  assert.equal(romanPart(3),'III');assert.equal(romanPart(4),'IV');assert.equal(romanPart(14),'XIV');assert.equal(romanPart(40),'XL');assert.equal(partTitle({subject:'PROGRAMACIÓN I',series_id:1,part_number:2}),'PROGRAMACIÓN I · PARTE II');
});
test('partes sin nota, sin inscripción o materia aún abierta no producen una aprobación ni un promedio final',()=>{
  for(const rows of [[attempt(1,100)],[attempt(1,100),attempt(2,100),attempt(3,null)],[attempt(1,100,{series_complete:false}),attempt(2,100,{series_complete:false}),attempt(3,100,{series_complete:false})]]){
    const summary=summarizeSeries(rows,{today:'2026-11-19'});assert.equal(summary.grade,null);assert.notEqual(summary.state,'approved');
    const course=summarizeAcademicHistory([{id:1,name:'PROGRAMACIÓN I',active:true,level:1,career_id:1,catalog_order:1}],rows).courses[0];assert.notEqual(course.state,'approved');assert.equal(course.grade,null);
  }
});
test('una recuperación sustituye solo su parte; conserva intentos y no mezcla series',()=>{
  const rows=[attempt(1,90),attempt(1,70,{enrollment_id:4,end_date:'2026-12-20',part_recovery:true}),attempt(2,65),attempt(3,85)];
  const summary=summarizeSeries(rows);assert.equal(summary.grade,73.33);assert.equal(summary.parts[0].grade,70);assert.equal(summary.parts[0].attempts.length,2);
  const other=[attempt(1,100,{series_id:2,part_count:2}),attempt(2,null,{series_id:2,part_count:2})];
  const history=summarizeAcademicHistory([{id:1,name:'MATERIA',active:true,level:1,career_id:1}], [...rows,...other]);assert.equal(history.courses[0].grade,73.33);assert.equal(history.courses[0].series_summaries.length,2);assert.equal(history.summary.approved,1);
  const ordinary=summarizeAcademicHistory([{id:1,name:'MATERIA',active:true,level:1,career_id:1}],[attempt(1,80,{series_id:null}),...other]);assert.equal(ordinary.courses[0].state,'approved');assert.equal(ordinary.courses[0].grade,80);
});
async function setup(t){
  const db=await testDatabase();await db.exec('UPDATE users SET must_change=0');
  const subject=(await db.query("INSERT INTO subjects(name,career_id,level,code) VALUES ('PROGRAMACIÓN I DE PRUEBA',1,1,'PRU-101') RETURNING id")).rows[0];
  const source=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES ($1,1,1,2) RETURNING *',[subject.id])).rows[0];
  await db.query('INSERT INTO enrollments(student_id,offering_id,grade) VALUES (4,$1,65),(5,$1,50),(8,$1,NULL)',[source.id]);
  const server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await db.cleanup();});const base=`http://127.0.0.1:${server.address().port}`,cookies={};
  async function api(path,body,role='admin'){
    const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookies[role]?{Cookie:cookies[role]}:{})},body:body?JSON.stringify(body):undefined});
    if(response.headers.has('set-cookie'))cookies[role]=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};
  }
  for(const [role,ci,password] of [['admin','admin','Ceicom2026!'],['teacher','4567890','4567890'],['student','7000001','7000001'],['second-student','7000002','7000002']])assert.equal((await api('login',{ci,password},role)).status,200);
  const input={offering_id:source.id,mode:'continue',module_id:2,teacher_id:2,student_ids:[4,5]};return {db,api,subject,source,input};
}
test('continuar convierte solo la asignación elegida en parte I; II y III conservan notas, catálogo, perfiles y grupos',async t=>{
  const {db,api,subject,source,input}=await setup(t),notes=await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),profiles=await db.prepare('SELECT * FROM students ORDER BY user_id').all(),subjects=await db.prepare('SELECT * FROM subjects ORDER BY id').all();
  const previousOfferings=await db.prepare('SELECT * FROM offerings WHERE id<>? ORDER BY id').all(source.id);
  const second=await api('subject-parts',input);assert.equal(second.status,200,JSON.stringify(second.body));assert.equal(second.body.part_number,2);
  const third=await api('subject-parts',{...input,offering_id:second.body.offering_id,module_id:3,teacher_id:3,student_ids:[4]});assert.equal(third.status,200,JSON.stringify(third.body));assert.equal(third.body.part_number,3);
  const series=await db.prepare('SELECT * FROM subject_series WHERE id=?').get(second.body.series_id);assert.equal(series.part_count,3);assert.equal(series.completed,false);
  assert.equal((await db.prepare('SELECT part_number FROM offerings WHERE id=?').get(source.id)).part_number,1);
  for(const row of notes)assert.deepEqual(await db.prepare('SELECT * FROM enrollments WHERE id=?').get(row.id),row);
  assert.deepEqual(await db.prepare('SELECT * FROM offerings WHERE id<>? AND series_id IS NULL ORDER BY id').all(source.id),previousOfferings);
  assert.deepEqual(await db.prepare('SELECT * FROM students ORDER BY user_id').all(),profiles);assert.deepEqual(await db.prepare('SELECT * FROM subjects ORDER BY id').all(),subjects);
  const created=await db.prepare('SELECT * FROM enrollments WHERE offering_id=? ORDER BY student_id').all(second.body.offering_id);assert.deepEqual(created.map(e=>e.student_id),[4,5]);assert.ok(created.every(e=>e.grade===null&&e.saber===null&&e.hacer===null&&e.ser===null));
  const group=await db.prepare('SELECT * FROM academic_groups WHERE offering_id=?').get(second.body.offering_id);assert.ok(group);assert.equal((await db.prepare('SELECT COUNT(*) n FROM academic_group_students WHERE group_id=?').get(group.id)).n,2);
  const data=(await api('data')).body;assert.equal(data.offerings.find(o=>o.id===source.id).subject,'PROGRAMACIÓN I DE PRUEBA · PARTE I');assert.equal(data.offerings.find(o=>o.id===third.body.offering_id).subject,'PROGRAMACIÓN I DE PRUEBA · PARTE III');assert.equal(data.academic_groups.find(g=>g.offering_id===second.body.offering_id).subject,'PROGRAMACIÓN I DE PRUEBA · PARTE II');
  assert.equal((await api('academic-history',null,'student')).body.courses.find(c=>c.id===subject.id).state,'enrolled');
  const impact=(await api('academic-impact?type=module&id=1')).body;assert.equal((await api('module-delete',{module_id:1,revision:impact.revision,confirm:'ELIMINAR TRIMESTRE'})).status,409);assert.ok(await db.prepare('SELECT id FROM offerings WHERE id=?').get(source.id));
});
test('concluir, recuperar únicamente la parte reprobada y reabrir para parte IV produce el promedio correcto en historial privado',async t=>{
  const {db,api,subject,source,input}=await setup(t),second=(await api('subject-parts',input)).body,third=(await api('subject-parts',{...input,offering_id:second.offering_id,module_id:3,student_ids:[4]})).body;
  await db.prepare('UPDATE enrollments SET grade=50 WHERE offering_id=? AND student_id=4').run(second.offering_id);await db.prepare('UPDATE enrollments SET grade=85 WHERE offering_id=? AND student_id=4').run(third.offering_id);
  assert.equal((await api('subject-series/status',{series_id:second.series_id,part_count:2,completed:true})).status,409);
  assert.equal((await api('subject-series/status',{series_id:second.series_id,part_count:3,completed:true})).status,200);
  let history=(await api('academic-history?student_id=5',null,'student')).body,course=history.courses.find(c=>c.id===subject.id);assert.equal(history.student.user_id,4);assert.equal(course.grade,66.67);assert.equal(course.state,'failed');assert.ok(course.attempts.every(row=>row.student_id===4));
  const missing=(await api('academic-history',null,'second-student')).body.courses.find(c=>c.id===subject.id);assert.equal(missing.grade,null);assert.equal(missing.state,'failed');assert.equal(missing.series_summaries[0].parts[2].state,'not_enrolled');
  assert.equal((await api('subject-parts',{...input,offering_id:third.offering_id,module_id:4})).status,409);
  const recover=await api('subject-parts',{...input,mode:'recover',offering_id:second.offering_id,module_id:4,student_ids:[4]});assert.equal(recover.status,200,JSON.stringify(recover.body));assert.equal(recover.body.part_number,2);
  assert.equal((await db.prepare('SELECT grade FROM enrollments WHERE student_id=4 AND offering_id=?').get(second.offering_id)).grade,50);
  await db.prepare('UPDATE enrollments SET grade=80 WHERE student_id=4 AND offering_id=?').run(recover.body.offering_id);
  course=(await api('academic-history',null,'student')).body.courses.find(c=>c.id===subject.id);assert.equal(course.grade,76.67);assert.equal(course.state,'approved');assert.equal(course.series_summaries[0].parts[1].attempts.length,2);assert.equal(course.attempts.length,4);
  assert.equal((await api('subject-series/status',{series_id:second.series_id,part_count:3,completed:false})).status,200);course=(await api('academic-history',null,'student')).body.courses.find(c=>c.id===subject.id);assert.equal(course.grade,null);assert.equal(course.state,'enrolled');
  const year=(await db.query("INSERT INTO years(name) VALUES ('2027') RETURNING id")).rows[0],module=(await db.query("INSERT INTO modules(name,year_id,start_date,end_date) VALUES ('SIGUIENTE',$1,'2027-01-04','2027-03-31') RETURNING id",[year.id])).rows[0];
  const fourth=await api('subject-parts',{...input,offering_id:third.offering_id,module_id:module.id,student_ids:[4]});assert.equal(fourth.status,200,JSON.stringify(fourth.body));assert.equal(fourth.body.part_number,4);assert.equal((await db.prepare('SELECT part_count FROM subject_series WHERE id=?').get(second.series_id)).part_count,4);
});
test('peticiones inválidas o duplicadas son atómicas; solo administración continúa o concluye',async t=>{
  const {db,api,input}=await setup(t),notes=await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),offerings=await db.prepare('SELECT * FROM offerings ORDER BY id').all();
  for(const request of [{...input,student_ids:[4,4]},{...input,student_ids:[9]},{...input,student_ids:[99999]},{...input,student_ids:['no']},{...input,module_id:1},{...input,teacher_id:4},{...input,mode:'recover'},{...input,mode:'inventar'}])assert.equal((await api('subject-parts',request)).status>=400,true);
  assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),notes);assert.deepEqual(await db.prepare('SELECT * FROM offerings ORDER BY id').all(),offerings);assert.equal((await db.prepare('SELECT COUNT(*) n FROM subject_series').get()).n,0);
  for(const role of ['teacher','student','anonymous'])for(const [path,body] of [['subject-parts',input],['subject-series/status',{series_id:1,part_count:2,completed:true}]])assert.equal((await api(path,body,role)).status,role==='anonymous'?401:403);
  const results=await Promise.all([api('subject-parts',input),api('subject-parts',input)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await db.prepare('SELECT COUNT(*) n FROM subject_series').get()).n,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM offerings WHERE series_id IS NOT NULL').get()).n,2);
});
test('continuación respeta el calendario por ingreso y conserva el perfil de alumnos que recursan de un año superior',async t=>{
  const {db,api,input}=await setup(t);await db.prepare('UPDATE modules SET admission_year_id=2 WHERE id=2').run();
  const result=await api('subject-parts',input);assert.equal(result.status,400);assert.match(result.body.error,/calendario de ingreso/);assert.equal((await db.prepare('SELECT COUNT(*) n FROM subject_series').get()).n,0);
  await db.prepare('UPDATE students SET level=3,admission_year_id=1 WHERE user_id=4').run();const profile=await db.prepare('SELECT * FROM students WHERE user_id=4').get();
  const added=await api('subject-parts',{...input,student_ids:[4]});assert.equal(added.status,200,JSON.stringify(added.body));assert.equal((await db.prepare('SELECT is_retake FROM enrollments WHERE offering_id=? AND student_id=4').get(added.body.offering_id)).is_retake,true);assert.deepEqual(await db.prepare('SELECT * FROM students WHERE user_id=4').get(),profile);
});
test('planillas JSON, HTML, PDF y Excel identifican la parte y recuperación; no cambian notas guardadas',async t=>{
  const {db,api,source,input}=await setup(t),second=(await api('subject-parts',input)).body;
  const before=await db.prepare('SELECT * FROM enrollments ORDER BY id').all();
  const report=await reportData(db,source.id);assert.match(report.offering.subject,/PARTE I$/);assert.match(planillaHTML(report),/DE LA PARTE/);assert.match(planillaHTML(report),/PROGRAMACIÓN I DE PRUEBA · PARTE I/);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await renderExcel(report));assert.match(workbook.worksheets[0].getCell('D10').value,/PARTE I/);assert.equal(workbook.worksheets[0].getCell('I12').value,'NOTA DE LA PARTE');
  const pdf=await renderPdf(report);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  const recovery=(await api('subject-parts',{...input,offering_id:second.offering_id,module_id:3,mode:'recover',student_ids:[5]})).body;assert.match((await reportData(db,recovery.offering_id)).offering.subject,/PARTE II · RECUPERACIÓN/);
  for(const e of before)assert.deepEqual(await db.prepare('SELECT * FROM enrollments WHERE id=?').get(e.id),e);
  assert.match((await api('reports/'+source.id,null,'teacher')).body.offering.subject,/PARTE I/);
});
