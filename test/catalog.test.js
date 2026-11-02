import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {testDatabase} from './helpers.js';
import {parseCatalog,applyCatalog,activateTeacher} from '../catalog.js';
import {createApp} from '../server.js';
import {verifyPassword} from '../lib.js';

async function example(){
  const b=new ExcelJS.Workbook(),s=b.addWorksheet('BASE DE DATOS');
  s.getCell('B4').value='CARRERAS';s.getCell('B5').value='SISTEMAS INFORMÁTICOS';s.getCell('B6').value='CONTADURÍA GENERAL';s.getCell('B7').value='ELECTRÓNICA';s.getCell('B8').value='TURNO';
  for(const [address,value] of Object.entries({D4:'SISTEMAS INFORMÁTICOS 1ER AÑO',E4:'CODIGO',D5:'INGLÉS TÉCNICO',E5:'INT-102',G4:'CONTADURÍA GENERAL 1ER AÑO',H4:'CODIGO',G5:'INGLÉS TÉCNICO',H5:'INT-102',D10:'SISTEMAS INFORMÁTICOS 2DO AÑO',E10:'CODIGO',D11:'PROGRAMACIÓN II',E11:'PRG-202',B15:'DOCENTE',B16:'LIC. DOCENTE DE PRUEBA'}))s.getCell(address).value=value;
  b.addWorksheet('PLANILLA DE NOTAS').getCell('A1').value='Ejemplo que no se importa como estudiante ni nota';
  return Buffer.from(await b.xlsx.writeBuffer());
}
test('lector Excel conserva códigos compartidos por carrera, años y docentes sin inventar CI',async()=>{
  const p=await parseCatalog(await example());assert.equal(p.careers.length,3);assert.equal(p.subjects.length,3);assert.equal(p.teachers.length,1);assert.deepEqual(p.missing,['ELECTRÓNICA']);
  assert.equal(p.subjects.filter(s=>s.code==='INT-102').length,2);assert.equal(p.subjects.find(s=>s.code==='PRG-202').level,2);
  await assert.rejects(parseCatalog(Buffer.from('no es un excel')),/vacío|válido/);
  const wrong=new ExcelJS.Workbook();wrong.addWorksheet('OTRA');await assert.rejects(parseCatalog(Buffer.from(await wrong.xlsx.writeBuffer())),/BASE DE DATOS/);
});
test('importación idempotente, cuentas pendientes y activación con CI real',async t=>{
  const db=await testDatabase({demo:false});t.after(()=>db.cleanup());
  const payload=await parseCatalog(await example()),result=await applyCatalog(db,payload);
  assert.equal(result.subjects_created,3);assert.equal(result.teachers_pending,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').get()).n,0);
  const again=await applyCatalog(db,payload);assert.equal(again.subjects_created,0);assert.equal(again.teachers_pending,0);
  const entry=await db.prepare('SELECT * FROM teacher_directory').get();
  await assert.rejects(activateTeacher(db,{directory_id:entry.id,ci:''},null),/CI/);
  const id=await activateTeacher(db,{directory_id:entry.id,ci:'11112222'},null),user=await db.prepare('SELECT * FROM users WHERE id=?').get(id);
  assert.equal(user.ci,'11112222');assert.equal(user.must_change,1);assert.ok(verifyPassword('11112222',user.password));
  await assert.rejects(activateTeacher(db,{directory_id:entry.id,ci:'99998888'},null),/ya tiene/);
});
test('API administra catálogo, protege carrera/año con historial y restringe importaciones',async()=>{
  const db=await testDatabase();await db.exec('UPDATE users SET must_change=0');const server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  const call=async(path,body)=>fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
  try{
    let login=await call('login',{ci:'admin',password:'Ceicom2026!'});cookie=login.headers.get('set-cookie').split(';')[0];
    const previewResponse=await call('catalog-excel/preview',{file:(await example()).toString('base64')});assert.equal(previewResponse.status,200);const preview=await previewResponse.json();
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM subjects').get()).n,5);
    assert.equal((await call('catalog-excel/apply',{token:preview.token})).status,200);assert.equal((await call('catalog-excel/apply',{token:preview.token})).status,400);
    assert.equal((await call('subjects',{id:1,name:'Programación I corregida',code:'PRG-104',career_id:1,level:1,active:false})).status,200);
    assert.equal((await call('offerings',{subject_id:1,career_id:1,teacher_id:2,module_id:2,shift_id:1})).status,400);
    assert.equal((await call('subjects',{id:1,name:'Cambio indebido',code:'PRG-104',career_id:2,level:1})).status,400);
    assert.equal((await db.prepare('SELECT career_id FROM subjects WHERE id=1').get()).career_id,1);
    assert.equal((await call('subjects',{name:'Nueva materia',code:'NUE-101',career_id:1,level:1})).status,200);
    login=await call('login',{ci:'4567890',password:'4567890'});cookie=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await call('catalog-excel/preview',{file:(await example()).toString('base64')})).status,403);
  }finally{await new Promise(r=>server.close(r));await db.cleanup();}
});
