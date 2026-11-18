import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {testDatabase} from './helpers.js';
import {createApp} from '../server.js';
import {reportData,renderPdf,renderExcel} from '../reports.js';
import {planillaHTML} from '../public/planilla.js';
import {retakeStudentLabel} from '../public/enrollment-rules.js';

test('planilla identifica año actual e ingreso del alumno pendiente en API, vista previa y Excel sin modificar notas',async t=>{
  const db=await testDatabase();t.after(()=>db.cleanup());await db.exec(`UPDATE users SET must_change=0;UPDATE students SET level=3,admission_year_id=1 WHERE user_id=4;UPDATE enrollments SET is_retake=true,saber=30,hacer=25,ser=10,grade=65 WHERE student_id=4 AND offering_id=1;`);
  const notes=await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),students=await db.prepare('SELECT * FROM students ORDER BY user_id').all();
  const report=await reportData(db,1),pending=report.rows.find(r=>r.ci==='7000001'),regular=report.rows.find(r=>r.ci==='7000002');
  assert.equal(pending.student_level,3);assert.equal(pending.admission_year,'2024');assert.equal(pending.is_retake,true);assert.equal(pending.status,'APROBADO');assert.equal(report.offering.course,'PRIMERO');
  const label='MATERIA PENDIENTE · 3º AÑO ACTUAL · INGRESO 2024';assert.equal(retakeStudentLabel(pending),label);assert.equal(retakeStudentLabel(regular),'');
  const html=planillaHTML(report);assert.ok(html.includes(label));assert.equal((html.match(/class="sheet-student-context"/g)||[]).length,1);
  const book=new ExcelJS.Workbook();await book.xlsx.load(await renderExcel(report));const sheet=book.worksheets[0],r=14+pending.number;
  assert.equal(sheet.getCell(r,3).value,pending.student+'\n'+label);assert.ok(sheet.getRow(r).height>sheet.getRow(14+regular.number).height);assert.equal(sheet.getCell(r,9).value.result,65);assert.equal(sheet.getCell(r,10).value.result,'APROBADO');assert.equal(sheet.getCell('D11').value,'PRIMERO');
  const server=createApp(db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}`;
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ci:'4567890',password:'4567890'})}),cookie=login.headers.get('set-cookie').split(';')[0];
  const data=await (await fetch(base+'/api/data',{headers:{Cookie:cookie}})).json(),enrollment=data.enrollments.find(e=>e.id===pending.id);assert.equal(retakeStudentLabel(enrollment),label);
  assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),notes);assert.deepEqual(await db.prepare('SELECT * FROM students ORDER BY user_id').all(),students);
});

test('planillas con muchos pendientes conservan identificadores y paginan sin perder alumnos ni alterar el estado',async t=>{
  const db=await testDatabase();t.after(()=>db.cleanup());const report=await reportData(db,1);
  report.rows=Array.from({length:43},(_,i)=>({...report.rows[0],number:i+1,student:`ALUMNO ${String(i+1).padStart(2,'0')} APELLIDO COMPUESTO`,is_retake:true,student_level:3,admission_year:'2024'}));
  const html=planillaHTML(report);assert.equal((html.match(/class="sheet-student-context"/g)||[]).length,43);assert.equal((html.match(/class="letter-sheet"/g)||[]).length,4);assert.ok(html.includes('ALUMNO 43 APELLIDO COMPUESTO'));
  const pdf=await renderPdf(report);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>=3);
  const book=new ExcelJS.Workbook();await book.xlsx.load(await renderExcel(report));assert.match(book.worksheets[0].getCell('C57').value,/ALUMNO 43.*\nMATERIA PENDIENTE/);assert.equal(book.worksheets[0].getCell('J57').value.result,report.rows[42].status);
});
