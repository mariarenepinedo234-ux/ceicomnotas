import {academicUpper} from './public/academic-text.js';
import {moduleForAdmission} from './public/module-calendar.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const id=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>2147483647)fail('Selecciona una gestión registrada.');return n;};
const date=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('Fecha inválida.');return value;};
export async function saveCalendarModule(db,input,actor,{moduleId=null}={}){
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>160)fail('Indica un nombre de hasta 160 caracteres.');
  const name=academicUpper(input.name.trim().replace(/\s+/g,' ')),yearId=id(input.year_id),start=date(input.start_date),end=date(input.end_date);if(start>end)fail('La fecha final debe ser posterior al inicio.');
  return db.transaction(async()=>{
    await db.query('SELECT pg_advisory_xact_lock(731202606)');
    const old=moduleId?await db.prepare('SELECT * FROM modules WHERE id=? FOR UPDATE').get(id(moduleId)):null;if(moduleId&&!old)fail('Trimestre no encontrado.',404);
    const scope=input.admission_year_id===undefined?(old?.admission_year_id??null):input.admission_year_id===''||input.admission_year_id===null?null:id(input.admission_year_id);
    const year=await db.prepare('SELECT * FROM years WHERE id=? FOR UPDATE').get(yearId);if(!year||start.slice(0,4)!==year.name||end.slice(0,4)!==year.name)fail('Las fechas deben pertenecer a la gestión cursada.');
    const admission=scope?await db.prepare('SELECT * FROM years WHERE id=?').get(scope):null;if(scope&&(!admission||admission.name>year.name))fail('El ingreso debe estar registrado y no ser posterior a la gestión cursada.');
    if(old&&(old.year_id!==yearId||old.admission_year_id!==scope)&&await db.prepare('SELECT id FROM offerings WHERE module_id=? LIMIT 1').get(old.id))fail('El trimestre tiene asignaciones. Conserva su gestión y calendario de ingreso; puedes corregir nombre y fechas.',409);
    const peers=(await db.query('SELECT * FROM modules WHERE year_id=$1 AND admission_year_id IS NOT DISTINCT FROM $2::int AND id<>$3 ORDER BY start_date',[yearId,scope,old?.id||0])).rows;
    const conflict=peers.find(m=>m.start_date<=end&&m.end_date>=start),scopeName=admission?`ingreso ${admission.name}`:'calendario compartido';
    if(conflict)fail(`Las fechas coinciden con ${conflict.name} (${conflict.start_date} a ${conflict.end_date}) del ${scopeName}. Usa otro calendario de ingreso si corresponde.`);
    if(peers.length>=4)fail(`El ${scopeName} ya tiene cuatro módulos en la gestión ${year.name}.`);
    if(peers.some(m=>academicUpper(m.name)===name))fail('Ya existe un trimestre con ese nombre en este calendario.',409);
    let resultId;
    if(old){await db.prepare('UPDATE modules SET name=?,year_id=?,start_date=?,end_date=?,admission_year_id=? WHERE id=?').run(name,yearId,start,end,scope,old.id);resultId=old.id;}
    else resultId=(await db.query('INSERT INTO modules(name,year_id,start_date,end_date,admission_year_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',[name,yearId,start,end,scope])).rows[0].id;
    await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(actor,old?'Trimestre editado':'Módulo creado',`Módulo ${resultId}: ${name} · ${scopeName} · gestión ${year.name} · ${start} a ${end}${old?`; antes ${old.start_date} a ${old.end_date}; notas conservadas.`:''}`);
    return {ok:true,module_id:resultId};
  });
}
export async function moduleAdmissionRule(db,moduleId){
  const module=await db.prepare('SELECT * FROM modules WHERE id=?').get(moduleId);if(!module)return ()=>false;
  const calendars=await db.prepare('SELECT * FROM modules WHERE year_id=?').all(module.year_id);
  return admissionId=>moduleForAdmission(module,calendars,admissionId);
}
export async function moduleAcceptsAdmission(db,moduleId,admissionId){return (await moduleAdmissionRule(db,moduleId))(admissionId);}
