import {createHash} from 'node:crypto';
import {academicUpper} from './public/academic-text.js';
import {careerNameSql} from './career-names.js';
import {partTitle} from './public/part-summary.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const id=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>2147483647)fail('Selecciona una carrera, gestión o grupo válido.');return n;};
const lock=db=>db.query('SELECT pg_advisory_xact_lock(731202606)');
const audit=(db,actor,action,detail)=>db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(actor,action,detail);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalized=value=>academicUpper(String(value).trim().replace(/\s+/g,' '));
const careerName=value=>{if(typeof value!=='string'||!value.trim()||value.length>160)fail('Indica un nombre de carrera de hasta 160 caracteres.');return normalized(value);};
async function availableName(db,name,except=0){if(await db.prepare("SELECT id FROM (SELECT id,name FROM careers UNION ALL SELECT career_id AS id,name FROM career_names) names WHERE id<>? AND upper(regexp_replace(trim(name),'\\s+',' ','g'))=?").get(except,name))fail('Ya existe una carrera con ese nombre, incluso entre sus nombres por gestión.',409);}

export async function createCareer(db,input,actor){
  const name=careerName(input.name);return db.transaction(async()=>{await lock(db);await availableName(db,name);const result=await db.prepare('INSERT INTO careers(name) VALUES (?) RETURNING id').run(name);await audit(db,actor,'Carrera creada',`Carrera ${result.lastInsertRowid}: ${name}`);return {ok:true,career_id:result.lastInsertRowid};});
}

async function snapshot(db,careerId,locking=false){
  const career=await db.prepare('SELECT * FROM careers WHERE id=?'+(locking?' FOR UPDATE':'')).get(careerId);
  if(!career)fail('Carrera no encontrada.',404);
  const subjects=await db.prepare('SELECT * FROM subjects WHERE career_id=? ORDER BY id'+(locking?' FOR UPDATE':'')).all(careerId),subjectIds=subjects.map(s=>s.id);
  const offerings=(await db.query(`SELECT o.*,m.name module,m.start_date,m.end_date,y.name AS "year",sh.name shift,u.name teacher FROM offerings o JOIN modules m ON m.id=o.module_id JOIN years y ON y.id=m.year_id JOIN shifts sh ON sh.id=o.shift_id JOIN users u ON u.id=o.teacher_id WHERE o.subject_id=ANY($1::int[]) ORDER BY o.id${locking?' FOR UPDATE OF o':''}`,[subjectIds])).rows;
  const offeringIds=offerings.map(o=>o.id),enrollments=(await db.query('SELECT * FROM enrollments WHERE offering_id=ANY($1::int[]) ORDER BY id'+(locking?' FOR UPDATE':''),[offeringIds])).rows;
  const groups=(await db.query('SELECT g.*,y.name admission_year,sh.name shift FROM academic_groups g JOIN years y ON y.id=g.admission_year_id JOIN shifts sh ON sh.id=g.shift_id WHERE g.subject_id=ANY($1::int[]) ORDER BY g.id'+(locking?' FOR UPDATE OF g':''),[subjectIds])).rows;
  const members=(await db.query('SELECT * FROM academic_group_students WHERE group_id=ANY($1::int[]) ORDER BY group_id,student_id'+(locking?' FOR UPDATE':''),[groups.map(g=>g.id)])).rows;
  const series=(await db.query('SELECT * FROM subject_series WHERE subject_id=ANY($1::int[]) ORDER BY id'+(locking?' FOR UPDATE':''),[subjectIds])).rows;
  const profiles=await db.prepare('SELECT * FROM students WHERE career_id=? ORDER BY user_id'+(locking?' FOR UPDATE':'')).all(careerId);
  const plans=await db.prepare('SELECT id,title,level,original_name,size_bytes,uploaded_by,created_at FROM study_plans WHERE career_id=? ORDER BY id'+(locking?' FOR UPDATE':'')).all(careerId);
  const names=await db.prepare('SELECT * FROM career_names WHERE career_id=? ORDER BY year_id'+(locking?' FOR UPDATE':'')).all(careerId);
  const graph={career,names,subjects,offerings,enrollments,groups,members,series,profiles,plans};
  const studentIds=new Set([...enrollments.map(e=>e.student_id),...members.map(m=>m.student_id)]);
  const blocking=offerings.map(o=>({...o,subject:academicUpper(partTitle({...o,subject:subjects.find(s=>s.id===o.subject_id).name})),students:new Set([...enrollments.filter(e=>e.offering_id===o.id).map(e=>e.student_id),...members.filter(m=>groups.some(g=>g.id===m.group_id&&g.offering_id===o.id)).map(m=>m.student_id)]).size})).filter(o=>o.students);
  const pending=groups.filter(g=>g.offering_id===null&&members.some(m=>m.group_id===g.id)).map(g=>({id:g.id,subject:academicUpper(subjects.find(s=>s.id===g.subject_id).name),admission_year:g.admission_year,shift:academicUpper(g.shift),students:members.filter(m=>m.group_id===g.id).length}));
  return {...graph,public:{career_id:careerId,name:academicUpper(career.name),subjects:subjects.length,offerings:offerings.length,groups:groups.length,series:series.length,study_plans:plans.length,student_profiles:profiles.length,enrollments:enrollments.length,assigned_students:studentIds.size,can_delete:studentIds.size===0,blocking_offerings:blocking.map(o=>({id:o.id,subject:o.subject,module:academicUpper(o.module),year:o.year,shift:academicUpper(o.shift),teacher:academicUpper(o.teacher),students:o.students})),pending_groups:pending,revision:digest(graph)}};
}

export async function careerDeletionReview(db,careerId){return db.transaction(async()=>(await snapshot(db,id(careerId))).public,{isolation:'REPEATABLE READ'});}

export async function editCareer(db,input,actor){
  const careerId=id(input.career_id),yearId=id(input.year_id),name=careerName(input.name);
  return db.transaction(async()=>{
    await lock(db);const career=await db.prepare('SELECT * FROM careers WHERE id=? FOR UPDATE').get(careerId);if(!career)fail('Carrera no encontrada.',404);
    const year=await db.prepare('SELECT * FROM years WHERE id=? FOR KEY SHARE').get(yearId);if(!year)fail('Selecciona una gestión registrada.');
    const previous=await db.prepare('SELECT name FROM career_names WHERE career_id=? AND year_id=? FOR UPDATE').get(careerId,yearId),oldName=previous?.name??career.name;
    if(typeof input.expected_name!=='string'||normalized(input.expected_name)!==normalized(oldName))fail('El nombre cambió en esta gestión. Vuelve a abrir Editar carrera.',409);
    const duplicate=await db.prepare(`SELECT c.id FROM careers c WHERE c.id<>? AND upper(regexp_replace(trim(${careerNameSql('c','?')}),'\\s+',' ','g'))=?`).get(careerId,yearId,name);
    if(duplicate)fail('Ya existe otra carrera con ese nombre en esta gestión.',409);
    await db.prepare('INSERT INTO career_names(career_id,year_id,name) VALUES (?,?,?) ON CONFLICT(career_id,year_id) DO UPDATE SET name=EXCLUDED.name').run(careerId,yearId,name);
    await audit(db,actor,'Carrera editada',`Carrera ${careerId}, gestión ${year.name}: ${oldName} → ${name}. Otras gestiones, identidad, estudiantes, materias e historial conservados.`);
    return {ok:true};
  });
}

export async function deleteCareer(db,input,actor){
  const careerId=id(input.career_id);
  return db.transaction(async()=>{
    await lock(db);const state=await snapshot(db,careerId,true);
    if(!state.public.can_delete)fail('No se puede eliminar la carrera: todavía hay estudiantes inscritos en sus materias o grupos, incluso de otras gestiones. Retíralos de esas listas antes de eliminar.',409);
    if(input.revision!==state.public.revision)fail('La carrera o sus registros cambiaron. Vuelve a revisar la eliminación.',409);
    if(input.confirm!=='ELIMINAR CARRERA')fail('Escribe ELIMINAR CARRERA para confirmar.');
    let destination=null;
    if(state.profiles.length){
      const destinationId=id(input.destination_career_id);if(destinationId===careerId)fail('Elige otra carrera para conservar los perfiles de estudiantes.');
      destination=await db.prepare('SELECT id,name FROM careers WHERE id=? FOR KEY SHARE').get(destinationId);if(!destination)fail('La carrera de destino ya no existe. Vuelve a revisar.',409);
      await db.prepare('UPDATE students SET career_id=? WHERE career_id=?').run(destination.id,careerId);
    }
    // No se eliminan inscripciones ni notas aquí: su existencia bloquea la operación.
    await db.query('DELETE FROM academic_groups WHERE subject_id=ANY($1::int[])',[state.subjects.map(s=>s.id)]);
    await db.query('DELETE FROM offerings WHERE subject_id=ANY($1::int[])',[state.subjects.map(s=>s.id)]);
    await db.query('DELETE FROM subject_series WHERE subject_id=ANY($1::int[])',[state.subjects.map(s=>s.id)]);
    await db.prepare('DELETE FROM subjects WHERE career_id=?').run(careerId);
    await db.prepare('DELETE FROM study_plans WHERE career_id=?').run(careerId);
    await db.prepare('DELETE FROM careers WHERE id=?').run(careerId);
    await audit(db,actor,'Carrera eliminada',`Carrera ${careerId}: ${state.career.name}; ${state.subjects.length} materias, ${state.offerings.length} asignaciones vacías, ${state.groups.length} grupos vacíos, ${state.series.length} series vacías y ${state.plans.length} planes PDF eliminados. ${state.profiles.length} perfiles conservados${destination?' en '+destination.name+' (carrera '+destination.id+')':''}. Cuentas, notas de otras carreras y docentes conservados.`);
    return {ok:true,profiles_moved:state.profiles.length};
  });
}

async function pendingGroup(db,groupId){
  const group=await db.prepare(`SELECT g.*,s.name subject,${careerNameSql('c','g.year_id')} career FROM academic_groups g JOIN subjects s ON s.id=g.subject_id JOIN careers c ON c.id=s.career_id WHERE g.id=? FOR UPDATE OF g`).get(groupId);
  if(!group)fail('Grupo no encontrado.',404);if(group.offering_id!==null)fail('Este grupo ya tiene una asignación. Usa Editar inscritos.',409);
  const members=await db.prepare('SELECT * FROM academic_group_students WHERE group_id=? ORDER BY student_id FOR UPDATE').all(groupId);
  return {group,members,revision:digest({group,members})};
}
export async function pendingGroupReview(db,groupId){
  return db.transaction(async()=>{const state=await pendingGroup(db,id(groupId));return {group_id:state.group.id,subject:academicUpper(state.group.subject),career:academicUpper(state.group.career),students:state.members.length,revision:state.revision};});
}
export async function clearPendingGroup(db,input,actor){
  return db.transaction(async()=>{await lock(db);const state=await pendingGroup(db,id(input.group_id));
    if(input.revision!==state.revision)fail('El grupo cambió. Vuelve a revisar sus estudiantes.',409);
    if(input.confirm!=='VACIAR GRUPO')fail('Escribe VACIAR GRUPO para confirmar.');
    await db.prepare('DELETE FROM academic_group_students WHERE group_id=?').run(state.group.id);
    await audit(db,actor,'Grupo pendiente vaciado',`Grupo ${state.group.id}: ${state.group.subject} · ${state.members.length} estudiantes retirados. Perfiles y cuentas conservados; el grupo no tenía asignación ni notas.`);
    return {ok:true};
  });
}
