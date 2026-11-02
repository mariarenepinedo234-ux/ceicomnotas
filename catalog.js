import ExcelJS from 'exceljs';
import {hashPassword} from './lib.js';

export const keyOf=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const careerKey=value=>keyOf(value)==='COMERCIO INTERNACIONAL'?'COMERCIO INTERNACIONAL Y ADMINISTRACION ADUANERA':keyOf(value);
export const teacherKey=value=>keyOf(value).replace(/^(LIC|ING|DR|DRA|MSC|TEC)\.?\s+/,'');
function text(cell){
  const v=cell.isMerged?cell.master.value:cell.value;
  if(v===null||v===undefined)return '';
  if(typeof v==='string'||typeof v==='number')return String(v).replace(/\s+/g,' ').trim();
  if(v.richText)return v.richText.map(t=>t.text).join('').replace(/\s+/g,' ').trim();
  return ''; // No se ejecutan fórmulas ni se usan instrucciones de otras hojas.
}
function checkZip(buffer){
  if(buffer.length>2*1024*1024||buffer.readUInt32LE(0)!==0x04034b50)throw new Error('Adjunta un archivo .xlsx válido de hasta 2 MB.');
  let total=0,entries=0;
  for(let i=0;i<=buffer.length-46;i++)if(buffer.readUInt32LE(i)===0x02014b50){
    total+=buffer.readUInt32LE(i+24);entries++;
    if(total>40*1024*1024||entries>250)throw new Error('El Excel supera el tamaño permitido al descomprimir.');
    i+=45+buffer.readUInt16LE(i+28)+buffer.readUInt16LE(i+30)+buffer.readUInt16LE(i+32);
  }
  if(!entries)throw new Error('No se pudo reconocer el archivo Excel.');
}
export async function parseCatalog(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<46)throw new Error('El archivo está vacío o no es un Excel válido.');
  checkZip(buffer);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);
  const sheet=workbook.worksheets.find(s=>keyOf(s.name)==='BASE DE DATOS');
  if(!sheet)throw new Error('Falta la hoja BASE DE DATOS. Usa el formato de la planilla institucional.');
  if(sheet.rowCount>5000||sheet.columnCount>60)throw new Error('La hoja supera el límite de filas o columnas.');
  const careers=[],teachers=[],subjects=[],warnings=[],heads=new Map(),seen=new Map();let section='';
  for(let row=1;row<=sheet.rowCount;row++){
    const label=text(sheet.getCell(row,2)),key=keyOf(label);
    if(key==='CARRERAS'||key==='DOCENTE'||key==='DOCENTES'){section=key;continue;}
    if(['TURNO','CURSO','TRIMESTRE'].includes(key)){section='';continue;}
    if(label&&section==='CARRERAS'&&!careers.some(c=>careerKey(c)===careerKey(label)))careers.push(label);
    if(label&&['DOCENTE','DOCENTES'].includes(section)&&!teachers.some(t=>teacherKey(t)===teacherKey(label)))teachers.push(label);
  }
  if(!careers.length)throw new Error('No se encontró la lista de carreras en la columna B.');
  for(let row=1;row<=sheet.rowCount;row++)for(let column=4;column<=sheet.columnCount;column++){
    const name=text(sheet.getCell(row,column));if(!name)continue;
    if(keyOf(text(sheet.getCell(row,column+1)))==='CODIGO'){
      const match=keyOf(name).match(/^(.*?)\s+(1ER|2DO|3ER|PRIMER|PRIMERO|SEGUNDO|TERCER|TERCERO)\s+ANO$/);
      if(!match)throw new Error(`No se reconoce carrera/año en ${sheet.getCell(row,column).address}.`);
      const career=careers.find(c=>careerKey(c)===careerKey(match[1]));
      if(!career)throw new Error(`El encabezado de ${sheet.getCell(row,column).address} no coincide con la lista de carreras.`);
      const level=/^(1|PRIM)/.test(match[2])?1:/^(2|SEG)/.test(match[2])?2:3;
      heads.set(column,{career,level});continue;
    }
    if(!heads.has(column))continue;
    const code=text(sheet.getCell(row,column+1)).toUpperCase();
    if(!code){warnings.push(`Sin código en ${sheet.getCell(row,column).address}; no se importó esa celda.`);continue;}
    if(name.length>160||!/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(code))throw new Error(`Materia o código inválido en fila ${row}.`);
    const subject={...heads.get(column),name,code},identity=`${careerKey(subject.career)}|${subject.level}|${code}`;
    if(seen.has(identity)){if(keyOf(seen.get(identity))!==keyOf(name))throw new Error(`Código repetido con distinto nombre en fila ${row}.`);continue;}
    seen.set(identity,name);subjects.push(subject);
  }
  if(!subjects.length)throw new Error('No se encontraron materias con códigos.');
  if(teachers.some(name=>name.length>160)||careers.some(name=>name.length>160))throw new Error('Un nombre excede 160 caracteres.');
  const summary=careers.map(name=>({name,levels:[1,2,3].map(level=>({level,count:subjects.filter(s=>s.career===name&&s.level===level).length}))}));
  const missing=summary.filter(c=>c.levels.every(l=>!l.count)).map(c=>c.name);
  return {careers,subjects,teachers,summary,missing,warnings};
}

export async function applyCatalog(db,payload,actorId=null,{withinTransaction=false}={}){
  const work=async()=>{
    await db.query('SELECT pg_advisory_xact_lock(731202604)');
    const result={careers_created:0,careers_renamed:0,subjects_created:0,subjects_updated:0,teachers_pending:0,teachers_linked:0};
    const existingCareers=await db.prepare('SELECT * FROM careers').all(),ids=new Map();
    for(const name of payload.careers){
      const matches=existingCareers.filter(c=>careerKey(c.name)===careerKey(name));
      if(matches.length>1)throw new Error('Hay dos carreras equivalentes registradas. Revisa el catálogo antes de importar.');
      let career=matches[0];
      if(!career){career=(await db.query('INSERT INTO careers(name) VALUES ($1) RETURNING id,name',[name])).rows[0];result.careers_created++;}
      else if(career.name!==name){await db.prepare('UPDATE careers SET name=? WHERE id=?').run(name,career.id);result.careers_renamed++;}
      ids.set(careerKey(name),career.id);
    }
    for(const s of payload.subjects){
      const careerId=ids.get(careerKey(s.career));
      const byCode=await db.prepare('SELECT * FROM subjects WHERE career_id=? AND level=? AND upper(code)=? FOR UPDATE').get(careerId,s.level,s.code);
      const candidates=byCode?[byCode]:(await db.prepare('SELECT * FROM subjects WHERE career_id=? AND level=? AND code IS NULL FOR UPDATE').all(careerId,s.level)).filter(old=>keyOf(old.name)===keyOf(s.name));
      if(candidates.length>1)throw new Error('Una materia sin código coincide con varios registros. Revísala antes de importar.');
      const old=candidates[0];
      if(old){if(old.name!==s.name||old.code!==s.code){await db.prepare('UPDATE subjects SET name=?,code=? WHERE id=?').run(s.name,s.code,old.id);result.subjects_updated++;}}
      else{await db.prepare('INSERT INTO subjects(name,career_id,level,code) VALUES (?,?,?,?)').run(s.name,careerId,s.level,s.code);result.subjects_created++;}
    }
    const users=await db.prepare("SELECT id,name FROM users WHERE role='teacher'").all();
    for(const name of payload.teachers){
      const key=teacherKey(name);
      const existing=await db.prepare('SELECT id FROM teacher_directory WHERE name_key=?').get(key);if(existing)continue;
      const matches=users.filter(u=>teacherKey(u.name)===key),userId=matches.length===1?matches[0].id:null;
      await db.prepare('INSERT INTO teacher_directory(name,name_key,user_id) VALUES (?,?,?)').run(name,key,userId);
      result[userId?'teachers_linked':'teachers_pending']++;
    }
    await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(actorId,'Catálogo Excel importado',JSON.stringify(result));
    return result;
  };
  return withinTransaction?work():db.transaction(work);
}

export async function activateTeacher(db,{directory_id,ci},actorId){
  if(typeof ci!=='string'||ci.trim().length<5||ci.trim().length>40)throw new Error('Ingresa un CI válido (entre 5 y 40 caracteres).');
  return db.transaction(async()=>{
    const entry=await db.prepare('SELECT * FROM teacher_directory WHERE id=? FOR UPDATE').get(directory_id);
    if(!entry)throw new Error('Docente no encontrado.');
    let userId=entry.user_id;
    if(userId){
      const user=await db.prepare('SELECT ci FROM users WHERE id=? FOR UPDATE').get(userId);
      if(user?.ci)throw new Error('Este docente ya tiene cuenta.');
      await db.prepare('UPDATE users SET ci=?,password=?,must_change=1 WHERE id=?').run(ci.trim(),hashPassword(ci.trim()),userId);
    }else{
      const created=await db.prepare("INSERT INTO users(ci,name,role,password) VALUES (?,?,'teacher',?)").run(ci.trim(),entry.name,hashPassword(ci.trim()));
      userId=created.lastInsertRowid;
      await db.prepare('UPDATE teacher_directory SET user_id=? WHERE id=?').run(userId,entry.id);
    }
    await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(actorId,'Cuenta docente habilitada',`Registro docente ${entry.id}; CI completado por administración.`);
    return userId;
  });
}
