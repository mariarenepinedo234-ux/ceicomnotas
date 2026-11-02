import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {testDatabase} from './helpers.js';
import {loadRosters,updateStudentProfile} from '../rosters.js';
import {activateTeacher} from '../catalog.js';
import {reportData} from '../reports.js';
import {createApp} from '../server.js';
import {verifyPassword} from '../lib.js';

const systems=['Estudiante Alfa','Estudiante Beta',{name:'Pendiente',name_pending:true}];
const payload={admission_year:'2024',academic_year:'2026',level:3,shift:'Mañana',teacher:'Docente Prueba',module:{name:'Tercer trimestre',start_date:'2026-07-01',end_date:'2026-09-25'},groups:[
  {career:'Sistemas Informáticos',subject:'Informática (Power BI)',students:systems},
  {career:'Contaduría General',subject:'Informática (Power BI)',students:['Estudiante Gamma']},
  {career:'Sistemas Informáticos',subject:'Diseño y Programación Web III',code:'DPW-303',students:systems},
]};
async function setup(){const db=await testDatabase();await db.prepare('INSERT INTO teacher_directory(name,name_key) VALUES (?,?)').run('ING. DOCENTE PRUEBA','DOCENTE PRUEBA');return db;}

test('grupos separados por carrera, ingreso 2024 y cursada 2026; sin duplicar estudiantes ni inventar accesos',async t=>{
  const db=await setup();t.after(()=>db.cleanup());
  const result=await loadRosters(db,payload);assert.equal(result.students_created,4);assert.equal(result.groups_created,3);assert.equal(result.enrollments_created,7);
  const groups=await db.prepare('SELECT * FROM academic_groups ORDER BY id').all();assert.equal(groups.length,3);
  const counts=[];for(const group of groups){const report=await reportData(db,group.offering_id);counts.push(report.rows.length);assert.equal(report.offering.year,'2026');assert.equal(report.offering.end_date,'2026-09-25');assert.equal(report.offering.shift,'MAÑANA');assert.ok(report.rows.every(row=>row.grade===null&&row.ci===null));}
  assert.deepEqual(counts,[3,1,3]);
  const identities=await db.prepare('SELECT u.* FROM users u JOIN students s ON s.user_id=u.id WHERE u.ci IS NULL').all();assert.equal(identities.length,4);assert.ok(identities.every(u=>u.password===null));
  const repeat=await loadRosters(db,payload);assert.equal(repeat.students_created,0);assert.equal(repeat.enrollments_created,0);assert.equal(repeat.groups_created,0);
  const dir=await db.prepare('SELECT * FROM teacher_directory WHERE name_key=?').get('DOCENTE PRUEBA');const teacher=await db.prepare('SELECT * FROM users WHERE id=?').get(dir.user_id);
  assert.equal(teacher.ci,null);assert.equal(teacher.password,null);assert.equal(verifyPassword('cualquierclave',teacher.password),false);
  await activateTeacher(db,{directory_id:dir.id,ci:'55550000'},null);
  const after=await db.prepare('SELECT * FROM users WHERE id=?').get(dir.user_id);assert.ok(verifyPassword('55550000',after.password));
  assert.equal((await db.prepare('SELECT teacher_id FROM offerings WHERE id=?').get(groups[0].offering_id)).teacher_id,teacher.id);
});
test('completar nombre y CI conserva inscripciones y notas; un error de carga revierte el lote',async t=>{
  const db=await setup();t.after(()=>db.cleanup());await loadRosters(db,payload);
  const s=await db.prepare("SELECT s.* FROM students s JOIN users u ON u.id=s.user_id WHERE u.name='PENDIENTE'").get();
  await assert.rejects(updateStudentProfile(db,{student_id:s.user_id,ci:'11112222'},null),/nombre/);
  await db.prepare('UPDATE enrollments SET grade=75 WHERE student_id=?').run(s.user_id);
  await updateStudentProfile(db,{student_id:s.user_id,name:'Nombre Completo Confirmado',ci:'11112222',name_pending:false},null);
  const user=await db.prepare('SELECT * FROM users WHERE id=?').get(s.user_id);assert.equal(user.ci,'11112222');assert.equal(user.must_change,1);assert.ok(verifyPassword('11112222',user.password));
  const grades=await db.prepare('SELECT grade FROM enrollments WHERE student_id=?').all(s.user_id);assert.equal(grades.length,2);assert.ok(grades.every(g=>g.grade===75));
  const count=(await db.prepare('SELECT COUNT(*) n FROM users').get()).n;
  await assert.rejects(loadRosters(db,{...payload,groups:[{...payload.groups[0],subject:'Materia que debe revertirse',students:['Repetido','Repetido']}]}),/dos veces/);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').get()).n,count);assert.equal(await db.prepare('SELECT id FROM subjects WHERE name=?').get('MATERIA QUE DEBE REVERTIRSE'),undefined);
});
test('exportación de borradores explícitos y bloqueo de acceso para perfiles sin CI',async()=>{
  const db=await setup();await db.exec('UPDATE users SET must_change=0');const result=await loadRosters(db,payload),group=await db.prepare('SELECT * FROM academic_groups WHERE id=?').get(result.group_ids[0]);
  const server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ci:'admin',password:'Ceicom2026!'})});const cookie=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base+`/api/reports/${group.offering_id}?format=pdf`,{headers:{Cookie:cookie}})).status,409);
    const pdf=await fetch(base+`/api/reports/${group.offering_id}?format=pdf&draft=true`,{headers:{Cookie:cookie}});assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-disposition'),/borrador-/);
    const excel=await fetch(base+`/api/reports/${group.offering_id}?format=xlsx&draft=true`,{headers:{Cookie:cookie}});assert.equal(excel.status,200);const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await excel.arrayBuffer()));assert.match(book.worksheets[0].getCell('F6').value,/BORRADOR/);
    const pending=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ci:'Estudiante Alfa',password:'Estudiante Alfa'})});assert.equal(pending.status,401);
    const data=await (await fetch(base+'/api/data',{headers:{Cookie:cookie}})).json();assert.equal(data.academic_groups.length,3);assert.equal(data.students.filter(s=>s.ci===null).length,4);
  }finally{await new Promise(r=>server.close(r));await db.cleanup();}
});
