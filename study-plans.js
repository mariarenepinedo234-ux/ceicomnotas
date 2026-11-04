import Busboy from 'busboy';
import {academicUpper} from './public/academic-text.js';

export const MAX_PLAN_SIZE=20*1024*1024;
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
const integer=(value,label)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>2147483647)throw failure(`Selecciona ${label}.`);return n;};
const summarySql=`SELECT p.id,p.title,p.career_id,upper(c.name) AS career,p.level,p.original_name,p.size_bytes,p.created_at
  FROM study_plans p JOIN careers c ON c.id=p.career_id`;
const links=plan=>({...plan,view_url:`/api/study-plans/${plan.id}/file`,download_url:`/api/study-plans/${plan.id}/file?download=1`});

export function readPlanUpload(req){
  if(Number(req.headers['content-length'])>MAX_PLAN_SIZE+65536){req.resume();return Promise.reject(failure('El PDF debe pesar como máximo 20 MB.',413));}
  return new Promise((resolve,reject)=>{
    let parser;try{parser=Busboy({headers:req.headers,defParamCharset:'utf8',limits:{files:1,fileSize:MAX_PLAN_SIZE+1,fields:3,fieldSize:1024,parts:5}});}catch{reject(failure('Envía el formulario con un archivo PDF.'));return;}
    const fields=Object.create(null);let file=null,problem=null,total=0;
    const mark=(message,status=400)=>{problem??=failure(message,status);};
    const count=chunk=>{total+=chunk.length;if(total>MAX_PLAN_SIZE+65536)mark('El PDF debe pesar como máximo 20 MB.',413);};
    req.on('data',count);
    parser.on('field',(name,value,info)=>{
      if(!['title','career_id','level'].includes(name)||Object.hasOwn(fields,name)||info.valueTruncated)mark('Datos del plan inválidos.');
      else fields[name]=value;
    });
    parser.on('file',(name,stream,info)=>{
      if(name!=='file'||file){mark('Selecciona un único PDF.');stream.resume();return;}
      const chunks=[];file={filename:info.filename,mimeType:info.mimeType,content:null};
      stream.on('limit',()=>mark('El PDF debe pesar como máximo 20 MB.',413));
      stream.on('data',chunk=>{if(!problem)chunks.push(chunk);});
      stream.on('end',()=>{if(!problem)file.content=Buffer.concat(chunks);});
      stream.on('error',()=>mark('No se pudo recibir el PDF.'));
    });
    parser.on('filesLimit',()=>mark('Selecciona un único PDF.'));
    parser.on('fieldsLimit',()=>mark('Datos del plan inválidos.'));
    parser.on('partsLimit',()=>mark('Datos del plan inválidos.'));
    parser.on('error',()=>mark('El archivo no se recibió completo.'));
    const aborted=()=>{mark('La carga del archivo se interrumpió.');parser.destroy();};
    req.once('aborted',aborted);req.once('error',aborted);
    parser.once('close',()=>{
      req.off('data',count);req.off('aborted',aborted);req.off('error',aborted);
      if(problem)reject(problem);else if(!file?.content)reject(failure('Selecciona un PDF.'));else resolve({...fields,...file});
    });
    req.pipe(parser);
  });
}

export async function listStudyPlans(db,params){
  const clauses=[],values=[];
  const career=params.get('career_id'),level=params.get('level'),search=(params.get('search')||'').trim();
  if(career){values.push(integer(career,'una carrera'));clauses.push(`p.career_id=$${values.length}`);}
  if(level){const n=integer(level,'un año académico');if(n>3)throw failure('El año académico debe ser 1, 2 o 3.');values.push(n);clauses.push(`p.level=$${values.length}`);}
  if(search.length>160)throw failure('La búsqueda admite hasta 160 caracteres.');
  if(search){values.push(search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('es'));clauses.push(`strpos(translate(upper(p.title||' '||p.original_name||' '||c.name),'ÁÉÍÓÚÜÑ','AEIOUUN'),$${values.length})>0`);}
  const result=await db.query(summarySql+(clauses.length?' WHERE '+clauses.join(' AND '):'')+' ORDER BY upper(c.name),p.level,p.created_at DESC,p.id DESC',values);
  return result.rows.map(links);
}

export async function createStudyPlan(db,input,actorId){
  const title=academicUpper(typeof input.title==='string'?input.title.trim():'');
  if(!title||title.length>160)throw failure('Indica el título del plan (máximo 160 caracteres).');
  const careerId=integer(input.career_id,'una carrera'),level=integer(input.level,'un año académico');
  if(level>3)throw failure('El año académico debe ser 1, 2 o 3.');
  const filename=String(input.filename||'').split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g,'').trim();
  if(!filename||filename.length>200||!filename.toLowerCase().endsWith('.pdf'))throw failure('El archivo debe tener extensión .pdf.',415);
  if(!['application/pdf','application/octet-stream'].includes(input.mimeType))throw failure('Solo se admiten archivos PDF.',415);
  const content=input.content;
  if(!Buffer.isBuffer(content)||content.length<16)throw failure('El PDF está vacío o incompleto.',422);
  if(content.length>MAX_PLAN_SIZE)throw failure('El PDF debe pesar como máximo 20 MB.',413);
  if(!/^%PDF-[12]\.\d/.test(content.subarray(0,8).toString('ascii'))||!content.subarray(-4096).includes(Buffer.from('%%EOF')))throw failure('El archivo no tiene un formato PDF válido.',422);
  return db.transaction(async()=>{
    if(!await db.prepare('SELECT id FROM careers WHERE id=?').get(careerId))throw failure('La carrera no está registrada.');
    const row=(await db.query('INSERT INTO study_plans(title,career_id,level,original_name,content,size_bytes,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[title,careerId,level,filename,content,content.length,actorId])).rows[0];
    await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(actorId,'Plan de estudio publicado',`Plan ${row.id}: ${title} · carrera ${careerId} · ${level}º año`);
    return links((await db.query(summarySql+' WHERE p.id=$1',[row.id])).rows[0]);
  });
}

export async function studyPlanFile(db,id){
  const plan=await db.prepare('SELECT id,title,content,size_bytes FROM study_plans WHERE id=?').get(id);
  if(!plan)throw failure('El plan ya no está disponible. Actualiza la lista.',404);
  return plan;
}
export async function deleteStudyPlan(db,id,actorId){
  await db.transaction(async()=>{
    const result=await db.query('DELETE FROM study_plans WHERE id=$1 RETURNING title',[id]);
    if(!result.rowCount)throw failure('El plan ya no está disponible. Actualiza la lista.',404);
    await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(actorId,'Plan de estudio eliminado',`Plan ${id}: ${result.rows[0].title}`);
  });
}
