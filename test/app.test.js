import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { testDatabase } from './helpers.js';
import { createApp, staticFileTarget } from '../server.js';
import { deadlineFor, canGrade, validGrade } from '../lib.js';

let server, db, base, directory;
const cookies={};
async function request(path,body,role='admin') {
  const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookies[role]?{Cookie:cookies[role]}:{})},body:body?JSON.stringify(body):undefined});
  if(r.headers.has('set-cookie'))cookies[role]=r.headers.get('set-cookie').split(';')[0];
  return {status:r.status,body:await r.json()};
}
async function signIn(role,ci,password){assert.equal((await request('login',{ci,password},role)).status,200);}
before(async()=>{
  directory=mkdtempSync(join(tmpdir(),'ceicom-test-'));db=await testDatabase();server=createApp(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.cleanup();rmSync(directory,{recursive:true,force:true});});

test('72 horas excluyen fines de semana y respetan el límite exacto',()=>{
  assert.equal(deadlineFor('2026-10-30'),'2026-11-05T03:59:59.000Z');
  assert.equal(deadlineFor('2026-10-26'),'2026-10-30T03:59:59.000Z');
  assert.equal(canGrade('2026-10-26',null,new Date('2026-10-30T03:59:59Z')),true);
  assert.equal(canGrade('2026-10-26',null,new Date('2026-10-30T04:00:00Z')),false);
  assert.equal(canGrade('2026-10-26','2026-11-01T00:00:00Z',new Date('2026-10-31T00:00:00Z')),true);
  assert.equal(validGrade(0),false);assert.equal(validGrade(101),false);assert.equal(validGrade(61),true);
});
test('las rutas de la interfaz funcionan en Windows y POSIX y rechazan salir de public',()=>{
  for(const paths of [posix,win32]) {
    for(const [url,file] of [['/','index.html'],['/app.js','app.js'],['/style.css','style.css'],['/planilla.js','planilla.js']]) {
      assert.equal(staticFileTarget(url,paths),paths.resolve('public',file));
    }
    for(const url of ['/../server.js','/../public-extra/archivo.txt','/..']) assert.equal(staticFileTarget(url,paths),null);
  }
  assert.equal(staticFileTarget('/..\\server.js',win32),null);
});
test('flujo académico completo y permisos por rol',async()=>{
  assert.equal((await request('data')).status,401);
  assert.equal((await request('login',{ci:'admin',password:'incorrecta'})).status,401);
  await signIn('admin','admin','Ceicom2026!');
  assert.equal((await request('data')).status,403);
  assert.equal((await request('password',{current:'Ceicom2026!',password:'AdminPrueba2026!'})).status,200);
  let a=(await request('data')).body;
  assert.equal(a.careers.length,9);assert.equal(a.shifts.length,4);
  assert.equal((await request('users',{name:'Estudiante Prueba',ci:'8888888',role:'student',career_id:1,shift_id:1,admission_year_id:3,level:1})).status,200);
  assert.equal((await request('users',{name:'Duplicado',ci:'8888888',role:'teacher'})).status,409);
  a=(await request('data')).body;const student=a.students.find(s=>s.ci==='8888888');
  assert.equal((await request('enrollments',{student_id:student.user_id,offering_id:1})).status,200);
  assert.equal((await request('enrollments',{student_id:student.user_id,offering_id:4})).status,400);
  await signIn('teacher','4567890','4567890');
  assert.equal((await request('password',{current:'4567890',password:'DocentePrueba2026!'},'teacher')).status,200);
  const t=(await request('data',null,'teacher')).body;
  assert.equal(t.students.length,0);assert.equal(t.teachers.length,0);
  assert.ok(t.offerings.every(o=>o.teacher_id===2));
  assert.equal((await request('users',{name:'Intruso'},'teacher')).status,403);
  const e=t.enrollments.find(e=>e.student_id===student.user_id);
  assert.equal((await request('grades',{offering_id:4,grades:[{id:e.id,grade:99}]},'teacher')).status,403);
  assert.equal((await request('grades',{offering_id:1,grades:[{id:e.id,grade:101}]},'teacher')).status,400);
  // Fijar fechas vencidas para que las pruebas no dependan del reloj del sistema.
  (await db.prepare("UPDATE modules SET start_date='2019-10-01',end_date='2020-01-01' WHERE id=4").run());
  assert.equal((await request('grades',{offering_id:1,grades:[{id:e.id,grade:61}]},'teacher')).status,403);
  assert.equal((await request('unlock',{offering_id:1,hours:72,reason:'Autorización de prueba'})).status,200);
  assert.equal((await request('grades',{offering_id:1,grades:[{id:e.id,grade:61}]},'teacher')).status,200);
  // La transacción rechaza un lote completo si contiene una inscripción ajena.
  assert.equal((await request('grades',{offering_id:1,grades:[{id:e.id,grade:99},{id:99999,grade:85}]},'teacher')).status,400);
  assert.equal((await db.prepare('SELECT grade FROM enrollments WHERE id=?').get(e.id)).grade,61);
  await signIn('student','8888888','8888888');
  assert.equal((await request('password',{current:'8888888',password:'EstudiantePrueba2026!'},'student')).status,200);
  let s=(await request('data',null,'student')).body;
  assert.equal(s.enrollments.length,1);assert.equal(s.enrollments[0].grade,61);
  assert.ok(s.enrollments.every(e=>e.student_id===student.user_id));
  assert.equal((await request('grades',{offering_id:1,grades:[{id:e.id,grade:100}]},'student')).status,403);
  assert.equal((await request('student-status',{student_id:student.user_id,blocked:true})).status,200);
  assert.deepEqual((await request('data',null,'student')).body,{blocked:true});
  assert.equal((await request('student-status',{student_id:student.user_id,blocked:false})).status,200);
  assert.equal((await request('transfer',{student_id:student.user_id,shift_id:4,level:2,reason:'Cambio por trabajo'})).status,200);
  s=(await request('data',null,'student')).body;
  assert.equal(s.enrollments[0].grade,61);assert.equal(s.offerings[0].shift,'Mañana');
  assert.equal((await db.prepare('SELECT shift_id FROM students WHERE user_id=?').get(student.user_id)).shift_id,4);
  assert.ok((await request('data')).body.audit.some(a=>a.action==='Traslado / actualización académica'));
  assert.equal((await request('logout',{},'student')).status,200);
  assert.equal((await request('data',null,'student')).status,401);
});
test('creación de catálogos, módulos y asignaciones, con validación de períodos',async()=>{
  assert.equal((await request('catalog',{type:'year',name:'2027'})).status,200);
  const y=(await request('data')).body.years.find(y=>y.name==='2027');
  assert.equal((await request('modules',{name:'Módulo 1',year_id:y.id,start_date:'2027-01-01',end_date:'2027-03-31'})).status,200);
  assert.equal((await request('modules',{name:'Superpuesto',year_id:y.id,start_date:'2027-03-01',end_date:'2027-04-01'})).status,400);
  assert.equal((await request('modules',{name:'Fecha inválida',year_id:y.id,start_date:'2027-02-30',end_date:'2027-04-01'})).status,400);
  assert.equal((await request('subjects',{name:'Redes I',career_id:1,level:1})).status,200);
  assert.equal((await request('subjects',{name:'Redes I',career_id:2,level:1})).status,200);
  const a=(await request('data')).body;
  const assignment={subject_id:a.subjects.find(s=>s.name==='Redes I'&&s.career_id===1).id,module_id:a.modules.find(m=>m.year_id===y.id).id,shift_id:1,teacher_id:2,career_id:1};
  assert.equal((await request('offerings',{...assignment,career_id:2})).status,400);
  assert.equal((await request('offerings',assignment)).status,200);
  assert.equal((await request('offerings',{...assignment,career_id:2,subject_id:a.subjects.find(s=>s.name==='Redes I'&&s.career_id===2).id})).status,200);
  assert.equal((await request('offerings',{subject_id:1,module_id:1,shift_id:1,teacher_id:4})).status,400);
  assert.equal((await request('catalog',{type:'year',name:'2028'})).status,200);
  const concurrentYear=(await request('data')).body.years.find(y=>y.name==='2028');
  const concurrent=await Promise.all(['Primero','Segundo'].map(name=>request('modules',{name,year_id:concurrentYear.id,start_date:'2028-01-01',end_date:'2028-03-31'})));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,400]);
});
test('la interfaz y sus recursos se sirven con encabezados de seguridad',async()=>{
  for(const path of ['/','/app.js','/style.css','/favicon.svg']){const r=await fetch(base+path);assert.equal(r.status,200);assert.ok(r.headers.get('content-security-policy'));assert.ok((await r.text()).length>50);}
  assert.equal((await fetch(base+'/no-existe')).status,404);
  const r=await fetch(base+'/api/logout',{method:'POST',headers:{Origin:'https://otro-sitio.example','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);
});
