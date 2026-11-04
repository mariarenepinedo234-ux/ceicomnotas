import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import {testDatabase} from './helpers.js';
import {createApp} from '../server.js';
import {MAX_PLAN_SIZE} from '../study-plans.js';

let db,server,base,pdf;const cookies={};
async function request(path,{body,role='admin',headers={}}={}){
  return fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(cookies[role]?{Cookie:cookies[role]}:{}),...headers},body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined});
}
function upload({title='Plan de avance · Programación ñ',career_id='1',level='3',filename='Avance académico.pdf',content=pdf,mime='application/pdf',extraFile=false}={}){
  const form=new FormData();form.set('title',title);form.set('career_id',career_id);form.set('level',level);form.set('file',new Blob([content],{type:mime}),filename);if(extraFile)form.append('file',new Blob([content],{type:mime}),'segundo.pdf');return form;
}
before(async()=>{
  db=await testDatabase();server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
  const document=new PDFDocument();const chunks=[];pdf=await new Promise((resolve,reject)=>{document.on('data',c=>chunks.push(c));document.on('end',()=>resolve(Buffer.concat(chunks)));document.on('error',reject);document.text('PLAN DE AVANCE ACADEMICO DE PRUEBA');document.end();});
  for(const [role,ci,password] of [['admin','admin','Ceicom2026!'],['teacher','4567890','4567890'],['other','5678901','5678901'],['student','7000001','7000001']]){
    const result=await request('login',{body:{ci,password},role});assert.equal(result.status,200);cookies[role]=result.headers.get('set-cookie').split(';')[0];
  }
});
after(async()=>{await new Promise(r=>server.close(r));await db.cleanup();});

test('planes: se exige sesión y cambio de contraseña; estudiantes no acceden y docentes no modifican',async()=>{
  for(const role of ['anonymous','admin','teacher','student']){const expected=role==='anonymous'?401:403;assert.equal((await request('study-plans',{role})).status,expected);assert.equal((await request('study-plans/upload',{role,body:upload()})).status,expected);}
  await db.exec('UPDATE users SET must_change=0');
  for(const path of ['study-plans','study-plans/1/file','study-plans/1/file?download=1'])assert.equal((await request(path,{role:'student'})).status,403);
  for(const role of ['student','teacher','other']){
    assert.equal((await request('study-plans/upload',{role,body:upload()})).status,403);
    assert.equal((await request('study-plans/1/delete',{role,body:{}})).status,403);
  }
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM study_plans').get()).n,0);
});

test('planes: PDF real, organización por carrera/año, búsqueda sin tildes y descargas privadas intactas',async()=>{
  const first=await request('study-plans/upload',{body:upload()});assert.equal(first.status,201);const plan=await first.json();
  assert.equal(plan.title,'PLAN DE AVANCE · PROGRAMACIÓN Ñ');assert.equal(plan.original_name,'Avance académico.pdf');assert.equal(Object.hasOwn(plan,'content'),false);
  assert.equal((await request('study-plans/upload',{body:upload({title:'Segundo año',level:'2'})})).status,201);
  assert.equal((await request('study-plans/upload',{body:upload({title:'Contabilidad',career_id:'2',level:'1'})})).status,201);
  const full=await (await request('study-plans',{role:'teacher'})).json();assert.equal(full.plans.length,3);assert.ok(full.plans.every(p=>!Object.hasOwn(p,'content')));
  for(const role of ['teacher','other','admin'])for(const suffix of ['', '?download=1']){
    const response=await request(`study-plans/${plan.id}/file${suffix}`,{role});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-disposition'),suffix?/attachment/:/inline/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
  }
  const filtered=await (await request('study-plans?career_id=1&level=3&search=programacion',{role:'teacher'})).json();assert.deepEqual(filtered.plans.map(p=>p.id),[plan.id]);
  assert.equal((await (await request('study-plans?career_id=2&level=3')).json()).plans.length,0);
  assert.equal((await (await request('study-plans?search=academico')).json()).plans.length,3);
  assert.equal((await (await request('study-plans?search=%25')).json()).plans.length,0);
  assert.equal((await request('study-plans?level=4')).status,400);assert.equal((await request('study-plans?career_id=abc')).status,400);assert.equal((await request('study-plans?career_id=2147483648')).status,400);assert.equal((await request('study-plans/2147483648/file')).status,404);
  assert.equal((await request('study-plans/999999/file',{role:'teacher'})).status,404);
  assert.equal((await request('study-plans/1/file',{role:'anonymous'})).status,401);
  const staticFile=await fetch(base+'/study-plans/1.pdf');assert.equal(staticFile.status,404);
});

test('planes: archivo vacío, simulado, incompleto, tipo incorrecto, tamaño excesivo y campos inválidos se rechazan sin crear filas',async()=>{
  const before=(await db.prepare('SELECT COUNT(*) n FROM study_plans').get()).n;
  for(const [input,status] of [[{content:Buffer.alloc(0)},422],[{content:Buffer.from('<html>esto no es PDF</html>')},422],[{content:pdf.subarray(0,pdf.length-30)},422],[{filename:'plan.exe'},415],[{mime:'text/html'},415],[{level:'4'},400],[{career_id:'999999'},400],[{title:''},400],[{extraFile:true},400],[{content:Buffer.alloc(MAX_PLAN_SIZE+1,65)},413]]){
    const result=await request('study-plans/upload',{body:upload(input)});assert.equal(result.status,status,JSON.stringify(input,(k,v)=>k==='content'?'bytes':v));
  }
  const missing=new FormData();missing.set('title','Sin archivo');assert.equal((await request('study-plans/upload',{body:missing})).status,400);
  const repeated=upload();repeated.append('level','1');assert.equal((await request('study-plans/upload',{body:repeated})).status,400);
  const badOrigin=await request('study-plans/upload',{body:upload(),headers:{Origin:'https://sitio-ajeno.example'}});assert.equal(badOrigin.status,403);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM study_plans').get()).n,before);
});

test('planes: eliminar retira el PDF y su contenido; publicar versión actualizada funciona y queda auditado',async()=>{
  const plans=await (await request('study-plans')).json(),plan=plans.plans[0];
  assert.equal((await request(`study-plans/${plan.id}/delete`,{body:{},role:'teacher'})).status,403);
  assert.equal((await request(`study-plans/${plan.id}/delete`,{body:{}})).status,200);
  assert.equal((await request(`study-plans/${plan.id}/file`,{role:'teacher'})).status,404);
  assert.equal((await request(`study-plans/${plan.id}/delete`,{body:{}})).status,404);
  assert.equal(await db.prepare('SELECT id FROM study_plans WHERE id=?').get(plan.id),undefined);
  const response=await request('study-plans/upload',{body:upload({title:plan.title,career_id:String(plan.career_id),level:String(plan.level)})});assert.equal(response.status,201);assert.notEqual((await response.json()).id,plan.id);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='Plan de estudio eliminado'").get()).n,1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='Plan de estudio publicado'").get()).n,4);
});

test('planes: un PDF de exactamente 20 MB se admite y se puede eliminar',async()=>{
  const content=Buffer.alloc(MAX_PLAN_SIZE,32);pdf.copy(content);Buffer.from('%%EOF').copy(content,content.length-5);
  const response=await request('study-plans/upload',{body:upload({title:'Límite de tamaño',content})});assert.equal(response.status,201);
  const plan=await response.json();assert.equal(plan.size_bytes,MAX_PLAN_SIZE);
  assert.equal((await request(`study-plans/${plan.id}/delete`,{body:{}})).status,200);
});
