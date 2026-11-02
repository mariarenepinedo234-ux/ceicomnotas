import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {testDatabase} from './helpers.js';
import {createApp} from '../server.js';
import {verifyPassword} from '../lib.js';
import {reportData,renderExcel} from '../reports.js';
import {uppercaseAcademicData} from '../public/academic-text.js';

test('se normalizan nombres académicos, sin alterar carnets, contraseñas ni campos técnicos',()=>{
  const data=uppercaseAcademicData({students:[{name:'Muñoz Ávila',ci:'ab-123',password:'ClaveMixta',name_pending:true}],offerings:[{subject:'Informática (Power Bi)',shift:'Mañana',module:'Tercer trimestre',id:1}],error:'Mensaje intacto'});
  assert.equal(data.students[0].name,'MUÑOZ ÁVILA');assert.equal(data.students[0].ci,'ab-123');assert.equal(data.students[0].password,'ClaveMixta');assert.equal(data.students[0].name_pending,true);assert.equal(data.offerings[0].shift,'MAÑANA');assert.equal(data.error,'Mensaje intacto');
});

test('nuevos registros en mayúsculas y registros antiguos uniformes en API y Excel, sin cambiar identidades ni notas',async t=>{
  const db=await testDatabase();t.after(()=>db.cleanup());await db.exec('UPDATE users SET must_change=0');
  await db.prepare('UPDATE subjects SET name=? WHERE id=1').run('Informática (Power Bi)');
  const before=await db.prepare('SELECT * FROM enrollments ORDER BY id').all();
  const server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  async function api(path,body){return fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
  const login=await api('login',{ci:'admin',password:'Ceicom2026!'});cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('subjects',{name:'Diseño gráfico ñ',code:'NEW-101',career_id:1,level:1})).status,200);
  assert.equal((await db.prepare("SELECT name FROM subjects WHERE code='NEW-101'").get()).name,'DISEÑO GRÁFICO Ñ');
  assert.equal((await api('users',{role:'student',name:'Muñoz Ávila Elena',ci:'ci-Ab123',career_id:1,shift_id:1,admission_year_id:1,level:1})).status,200);
  const student=await db.prepare('SELECT * FROM users WHERE ci=?').get('ci-Ab123');assert.equal(student.name,'MUÑOZ ÁVILA ELENA');assert.ok(verifyPassword('ci-Ab123',student.password));assert.equal(verifyPassword('CI-AB123',student.password),false);
  const data=await (await api('data')).json();assert.equal(data.subjects.find(s=>s.id===1).name,'INFORMÁTICA (POWER BI)');assert.equal(data.offerings.find(o=>o.subject_id===1).subject,'INFORMÁTICA (POWER BI)');
  assert.equal((await db.prepare('SELECT name FROM subjects WHERE id=1').get()).name,'Informática (Power Bi)');
  assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),before);
  const report=await reportData(db,1);assert.equal(report.offering.subject,'INFORMÁTICA (POWER BI)');assert.equal(report.offering.shift,'MAÑANA');assert.ok(report.rows.every(row=>row.student===row.student.toLocaleUpperCase('es')));
  report.rows[0]={...report.rows[0],saber:20,hacer:30,ser:11,grade:61,status:'APROBADO'};
  const book=new ExcelJS.Workbook();await book.xlsx.load(await renderExcel(report));
  book.worksheets[0].eachRow(row=>row.eachCell(cell=>{if(typeof cell.value==='string')assert.equal(cell.value,cell.value.toLocaleUpperCase('es'));}));
  assert.equal(book.worksheets[0].getCell('D10').value,'INFORMÁTICA (POWER BI)');assert.equal(typeof book.worksheets[0].getCell('I15').value.formula,'string');
});
