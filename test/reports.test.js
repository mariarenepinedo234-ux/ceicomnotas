import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ExcelJS from 'exceljs';
import {openDatabase} from '../db.js';
import {createApp} from '../server.js';
import {dimensionGrades} from '../lib.js';
import {reportData,renderPdf,renderExcel} from '../reports.js';

let db,server,base,dir;
const cookies={};
async function call(path,body,role='teacher') {
  return fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookies[role]?{Cookie:cookies[role]}:{})},body:body?JSON.stringify(body):undefined});
}
before(async()=>{
  dir=mkdtempSync(join(tmpdir(),'ceicom-reports-'));db=openDatabase(join(dir,'test.sqlite'));
  db.exec('UPDATE users SET must_change=0');
  server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
  for(const [role,ci,password] of [['admin','admin','Ceicom2026!'],['teacher','4567890','4567890'],['other','5678901','5678901'],['student','7000001','7000001']]) {
    const r=await call('login',{ci,password},role);assert.equal(r.status,200);cookies[role]=r.headers.get('set-cookie').split(';')[0];
  }
});
after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});});

test('el total se calcula sin confiar en una nota final enviada por el cliente',()=>{
  assert.equal(dimensionGrades({saber:40,hacer:40,ser:20}).grade,100);
  assert.throws(()=>dimensionGrades({saber:20,hacer:41,ser:10}),/Hacer/);
  assert.deepEqual(dimensionGrades({saber:20,hacer:30,ser:11,grade:100}),{saber:20,hacer:30,ser:11,grade:61});
  assert.equal(dimensionGrades({saber:0,hacer:40,ser:20}).grade,60);
  assert.equal(dimensionGrades({saber:20.15,hacer:30.25,ser:10.1}).grade,60.5);
  assert.equal(dimensionGrades({saber:0,hacer:null,ser:20}).grade,null);
  assert.throws(()=>dimensionGrades({saber:41,hacer:30,ser:10}),/Saber/);
  assert.throws(()=>dimensionGrades({saber:20,hacer:-1,ser:10}),/Hacer/);
  assert.throws(()=>dimensionGrades({saber:20,hacer:40,ser:21}),/Ser/);
  assert.throws(()=>dimensionGrades({saber:20.001,hacer:40,ser:10}),/decimales/);
  assert.throws(()=>dimensionGrades({saber:20,hacer:40}),/Ser/);
  assert.throws(()=>dimensionGrades({saber:0,hacer:0,ser:0}),/final/);
});

test('migrar la escala anterior conserva las notas y permite Saber 40',()=>{
  const path=join(dir,'previous-scale.sqlite');let previous=openDatabase(path);
  const e=previous.prepare('SELECT id FROM enrollments LIMIT 1').get();
  previous.prepare('UPDATE enrollments SET saber=30,hacer=45,ser=25,grade=100 WHERE id=?').run(e.id);
  previous.exec(`CREATE TABLE previous_enrollments (
    id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(user_id),
    offering_id INTEGER NOT NULL REFERENCES offerings(id), grade REAL CHECK(grade BETWEEN 1 AND 100), updated_at TEXT,
    saber REAL CHECK(saber BETWEEN 0 AND 30), hacer REAL CHECK(hacer BETWEEN 0 AND 45), ser REAL CHECK(ser BETWEEN 0 AND 25),
    UNIQUE(student_id,offering_id));
    INSERT INTO previous_enrollments SELECT * FROM enrollments;
    DROP TABLE enrollments; ALTER TABLE previous_enrollments RENAME TO enrollments;`);
  const before=previous.prepare('SELECT * FROM enrollments ORDER BY id').all();previous.close();
  previous=openDatabase(path);
  assert.deepEqual(previous.prepare('SELECT * FROM enrollments ORDER BY id').all(),before);
  const row=previous.prepare('SELECT offering_id FROM enrollments WHERE id=?').get(e.id);
  assert.equal(reportData(previous,row.offering_id).needs_review,1);
  previous.prepare('UPDATE enrollments SET saber=40,hacer=40,ser=20,grade=100 WHERE id=?').run(e.id);
  assert.equal(reportData(previous,row.offering_id).needs_review,0);
  previous.close();previous=openDatabase(path);
  assert.equal(previous.prepare('SELECT saber FROM enrollments WHERE id=?').get(e.id).saber,40);
  assert.equal(previous.prepare('PRAGMA foreign_key_check').all().length,0);previous.close();
});

test('las notas por dimensión persisten, los borradores no son reprobados y los lotes son atómicos',async()=>{
  const es=db.prepare('SELECT id FROM enrollments WHERE offering_id=1 ORDER BY id').all();
  let r=await call('grades',{offering_id:1,grades:[{id:es[0].id,saber:0,hacer:40,ser:null}]});assert.equal(r.status,200);
  let saved=db.prepare('SELECT * FROM enrollments WHERE id=?').get(es[0].id);assert.equal(saved.saber,0);assert.equal(saved.grade,null);
  assert.equal((await call('reports/1?format=pdf')).status,409);
  r=await call('grades',{offering_id:1,grades:[{id:es[0].id,saber:20,hacer:30,ser:11,grade:100},{id:es[1].id,saber:41,hacer:20,ser:10}]});assert.equal(r.status,400);
  assert.equal(db.prepare('SELECT grade FROM enrollments WHERE id=?').get(es[0].id).grade,null);
  const grades=es.map((e,i)=>({id:e.id,saber:20,hacer:30,ser:i===0?10:i===1?11:20}));
  r=await call('grades',{offering_id:1,grades});assert.equal(r.status,200);
  assert.equal(db.prepare('SELECT grade FROM enrollments WHERE id=?').get(es[0].id).grade,60);
  assert.equal(db.prepare('SELECT grade FROM enrollments WHERE id=?').get(es[1].id).grade,61);
  const report=await (await call('reports/1')).json();assert.equal(report.pending,0);assert.equal(report.rows.length,5);
  assert.equal(report.rows.find(e=>e.id===es[0].id).status,'REPROBADO');assert.equal(report.rows.find(e=>e.id===es[1].id).status,'APROBADO');
  assert.deepEqual(report.rows.map(e=>e.student),report.rows.map(e=>e.student).sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})));
});

test('las descargas son archivos reales, con carta y fórmulas editables en Excel',async()=>{
  const pdf=await call('reports/1?format=pdf');assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.match(pdf.headers.get('content-disposition'),/attachment; filename=".*\.pdf"/);
  const buffer=Buffer.from(await pdf.arrayBuffer());assert.equal(buffer.subarray(0,5).toString(),'%PDF-');assert.match(buffer.toString('latin1'),/\/MediaBox \[0 0 612 792\]/);
  const excel=await call('reports/1?format=xlsx');assert.equal(excel.status,200);assert.match(excel.headers.get('content-type'),/spreadsheetml/);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await excel.arrayBuffer()));
  const sheet=workbook.worksheets[0];assert.equal(sheet.pageSetup.paperSize,1);assert.equal(sheet.pageSetup.orientation,'portrait');assert.match(sheet.getCell('A4').value,/SISTEMAS INFORMÁTICOS/);
  assert.match(sheet.getCell('F11').value.formula,/ROUND\(SUM\(C11:E11\),2\)/);assert.equal(typeof sheet.getCell('F11').value.result,'number');
  assert.match(sheet.getCell('G11').value.formula,/>=61/);assert.equal(sheet.getCell('C11').dataValidation.formulae[1],40);assert.equal(sheet.getCell('D11').dataValidation.formulae[1],40);assert.equal(sheet.getCell('E11').dataValidation.formulae[1],20);
  assert.equal(sheet.getCell('F30').value,null); // No se calcula cero ni reprobado en filas vacías.
  assert.equal(sheet.conditionalFormattings[0].rules[0].formulae[0],'AND(ISNUMBER($F11),$F11<61)');
  assert.ok(db.prepare("SELECT id FROM audit WHERE action='Planilla exportada'").all().length>=2);
});

test('solo administración o el docente asignado pueden ver o descargar la planilla',async()=>{
  for(const format of ['json','pdf','xlsx']){
    assert.equal((await call(`reports/1?format=${format}`,null,'student')).status,403);
    assert.equal((await call(`reports/1?format=${format}`,null,'other')).status,403);
    assert.equal((await call(`reports/1?format=${format}`,null,'anonymous')).status,401);
    assert.equal((await call(`reports/1?format=${format}`,null,'admin')).status,200);
  }
  assert.equal((await call('reports/99999')).status,404);
  assert.equal((await call('reports/1?format=csv')).status,400);
  db.prepare("UPDATE modules SET end_date='2020-01-01' WHERE id=4").run();
  const e=db.prepare('SELECT id FROM enrollments WHERE offering_id=1').get();
  assert.equal((await call('grades',{offering_id:1,grades:[{id:e.id,saber:20,hacer:30,ser:15}]})).status,403);
  assert.equal((await call('reports/1?format=pdf')).status,200); // Consultar no reabre edición.
});

test('notas antiguas y migración aditiva: ningún total se pierde ni se inventa desglose',async()=>{
  const path=join(dir,'old.sqlite');let old=openDatabase(path);
  const before=old.prepare('SELECT id,grade FROM enrollments ORDER BY id').all();
  for(const key of ['saber','hacer','ser'])old.exec(`ALTER TABLE enrollments DROP COLUMN ${key}`);
  old.close();old=openDatabase(path);
  assert.deepEqual(old.prepare('SELECT id,grade FROM enrollments ORDER BY id').all(),before);
  const report=reportData(old,6);assert.equal(report.legacy,5);assert.equal(report.rows[0].saber,null);assert.ok(report.rows.every(r=>r.grade!==null));
  const book=new ExcelJS.Workbook();await book.xlsx.load(await renderExcel(report));const sheet=book.worksheets[0];assert.equal(typeof sheet.getCell('F11').value,'number');assert.equal(sheet.getCell('C11').value,null);
  old.close();old=openDatabase(path);assert.equal(old.prepare('SELECT count(*) n FROM enrollments').get().n,before.length);old.close();
});

test('planillas largas conservan a todos los estudiantes y repiten encabezados en páginas carta',async()=>{
  const report=reportData(db,1);report.rows=Array.from({length:43},(_,i)=>({...report.rows[i%5],number:i+1,student:`Estudiante ${String(i+1).padStart(2,'0')} ${'Apellido compuesto '.repeat(i===0?6:1)}`}));
  const pdf=await renderPdf(report);assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,3);
  const book=new ExcelJS.Workbook();await book.xlsx.load(await renderExcel(report));const sheet=book.worksheets[0];assert.match(sheet.getCell('B53').value,/43/);assert.match(sheet.pageSetup.printTitlesRow,/1.*10/);
});
