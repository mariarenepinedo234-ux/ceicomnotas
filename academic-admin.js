import {saveCalendarModule,moduleAcceptsAdmission,moduleAdmissionRule} from './module-calendars.js';
import {enrollmentMatches,allowsRetakes} from './public/enrollment-rules.js';
import {createHash} from 'node:crypto';
import {academicUpper} from './public/academic-text.js';
import {hashPassword} from './lib.js';
import {partTitle} from './public/part-summary.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const id=(value,label='registro')=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>2147483647)fail(`Selecciona ${label}.`);return n;};
const yearLevel=value=>{const n=id(value,'el año académico');if(n>3)fail('El año académico debe ser 1, 2 o 3.');return n;};
const title=value=>{if(typeof value!=='string'||!value.trim()||value.length>160)fail('Indica un nombre de hasta 160 caracteres.');return academicUpper(value.trim().replace(/\s+/g,' '));};
const ids=values=>{if(!Array.isArray(values)||values.length>1000)fail('Selecciona hasta 1000 estudiantes registrados.');const result=values.map(v=>id(v,'un estudiante registrado'));if(new Set(result).size!==result.length)fail('Hay estudiantes repetidos en la selección.');return result;};
const hasNotes=row=>['grade','saber','hacer','ser'].some(key=>row[key]!==null);
const audit=(db,actor,action,detail)=>db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(actor,action,detail);
const structuralLock=db=>db.query('SELECT pg_advisory_xact_lock(731202606)');
const lockOfferings=(db,values)=>db.query('SELECT id FROM offerings WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[values]);
async function studentRow(db,studentId){
  const student=await db.prepare('SELECT * FROM students WHERE user_id=? FOR UPDATE').get(studentId);if(!student)fail('Estudiante no encontrado.',404);
  const user=await db.prepare("SELECT * FROM users WHERE id=? AND role='student' FOR UPDATE").get(studentId);if(!user)fail('Estudiante no encontrado.',404);return {student,user};
}
async function eligibility(db,studentIds,subject,shiftId,admissionId=null,existing=new Set(),allowRetake=false){
  const result=await db.query('SELECT s.*,u.name FROM students s JOIN users u ON u.id=s.user_id WHERE s.user_id=ANY($1::int[]) ORDER BY s.user_id FOR UPDATE OF s',[studentIds]);
  if(result.rows.length!==studentIds.length)fail('Todos los estudiantes deben estar registrados. No se crean estudiantes desde un grupo.');
  for(const s of result.rows)if(!existing.has(s.user_id)&&!enrollmentMatches(s,{...subject,shift_id:shiftId},{allowRetake,admissionYearId:admissionId}))fail('La selección contiene estudiantes de otra carrera, año, ingreso o turno. Para un año anterior, habilita Materias pendientes. No se permite adelantar materias.');
  return result.rows;
}

export async function saveRegisteredGroup(db,input,actor){
  const studentIds=ids(input.student_ids);if(!studentIds.length)fail('Selecciona al menos un estudiante registrado.');
  const career=id(input.career_id,'la carrera'),level=yearLevel(input.level),subjectId=id(input.subject_id,'una materia registrada'),shift=id(input.shift_id,'el turno'),admission=id(input.admission_year_id,'la gestión de ingreso'),year=id(input.year_id,'la gestión cursada'),moduleId=id(input.module_id,'el trimestre'),teacher=id(input.teacher_id,'un docente registrado');
  return db.transaction(async()=>{
    await structuralLock(db);
    const module=await db.prepare('SELECT * FROM modules WHERE id=? FOR UPDATE').get(moduleId);if(!module||module.year_id!==year)fail('El trimestre debe pertenecer a la gestión cursada.');
    const subject=await db.prepare('SELECT * FROM subjects WHERE id=?').get(subjectId);if(!subject||!subject.active||subject.career_id!==career||subject.level!==level)fail('La materia debe estar activa y corresponder a la carrera y año seleccionados.');
    const years=await db.prepare('SELECT id,name FROM years WHERE id=? OR id=?').all(admission,year),a=years.find(y=>y.id===admission),y=years.find(y=>y.id===year);if(!a||!y||a.name>y.name)fail('La gestión de ingreso no puede ser posterior a la cursada.');
    if(!await db.prepare("SELECT id FROM users WHERE id=? AND role='teacher'").get(teacher))fail('Selecciona un docente registrado.');
    let offering=await db.prepare('SELECT * FROM offerings WHERE subject_id=? AND module_id=? AND shift_id=? FOR UPDATE').get(subjectId,moduleId,shift);
    if(offering&&offering.teacher_id!==teacher)fail('La materia ya está asignada a otro docente en ese trimestre y turno.',409);
    if(!offering)offering=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES ($1,$2,$3,$4) RETURNING *',[subjectId,moduleId,shift,teacher])).rows[0];
    let group=await db.prepare('SELECT * FROM academic_groups WHERE offering_id=?').get(offering.id);
    const students=await eligibility(db,studentIds,subject,shift,null,new Set(),allowsRetakes(input.allow_retake));
    if(!await moduleAcceptsAdmission(db,moduleId,admission)&&students.some(s=>s.level<=subject.level))fail('Este módulo pertenece a otro calendario de ingreso. Elige el módulo de la gestión de ingreso seleccionada.');
    if(students.some(s=>s.admission_year_id!==admission))fail('Los estudiantes deben pertenecer a la gestión de ingreso seleccionada.');
    if(group&&group.admission_year_id!==admission&&!students.every(s=>s.level>subject.level))fail('Esta asignación ya está vinculada a otro ingreso. Revisa el grupo existente.',409);
    if(!group)group=(await db.query('INSERT INTO academic_groups(subject_id,year_id,admission_year_id,shift_id,offering_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',[subjectId,year,admission,shift,offering.id])).rows[0];
    let count=0;
    for(const studentId of studentIds){
      await db.prepare('INSERT INTO academic_group_students(group_id,student_id) VALUES (?,?) ON CONFLICT DO NOTHING').run(group.id,studentId);
      const retake=students.find(s=>s.user_id===studentId).level>subject.level;
      const added=(await db.prepare('INSERT INTO enrollments(student_id,offering_id,is_retake) VALUES (?,?,?) ON CONFLICT DO NOTHING').run(studentId,offering.id,retake)).changes;count+=added;
      if(added&&retake)await audit(db,actor,'Materia pendiente inscrita',`Estudiante ${studentId} · asignación ${offering.id} · materia de ${subject.level}º; año actual e ingreso conservados.`);
    }
    await db.query('INSERT INTO academic_group_students(group_id,student_id) SELECT $1,student_id FROM enrollments WHERE offering_id=$2 ON CONFLICT DO NOTHING',[group.id,offering.id]);
    await audit(db,actor,'Grupo de estudiantes registrados guardado',`Grupo ${group.id} · ${studentIds.length} seleccionados · ${count} inscripciones nuevas; sin crear personas.`);
    return {ok:true,group_id:group.id,offering_id:offering.id,enrollments_created:count,students_created:0};
  });
}

async function snapshot(db,type,targetId,lock=false){
  let record,offerings=[],students=[];
  if(type==='student'){
    if(lock){const linked=await db.prepare('SELECT offering_id FROM enrollments WHERE student_id=?').all(targetId);await lockOfferings(db,linked.map(e=>e.offering_id));await studentRow(db,targetId);}
    record=await db.prepare("SELECT s.*,u.name,u.ci FROM students s JOIN users u ON u.id=s.user_id WHERE s.user_id=? AND u.role='student'").get(targetId);
    if(!record)fail('Estudiante no encontrado.',404);
    offerings=await db.prepare('SELECT o.* FROM offerings o JOIN enrollments e ON e.offering_id=o.id WHERE e.student_id=? ORDER BY o.id').all(targetId);
  }else if(type==='module'){
    record=await db.prepare('SELECT * FROM modules WHERE id=?'+(lock?' FOR UPDATE':'')).get(targetId);if(!record)fail('Trimestre no encontrado.',404);
    offerings=await db.prepare('SELECT * FROM offerings WHERE module_id=? ORDER BY id'+(lock?' FOR UPDATE':'')).all(targetId);
  }else if(type==='offering'){
    record=await db.prepare('SELECT o.*,s.career_id,s.level,s.name,c.name career,sh.name shift,m.name module,y.name AS "year",u.name teacher FROM offerings o JOIN subjects s ON s.id=o.subject_id JOIN careers c ON c.id=s.career_id JOIN shifts sh ON sh.id=o.shift_id JOIN modules m ON m.id=o.module_id JOIN years y ON y.id=m.year_id JOIN users u ON u.id=o.teacher_id WHERE o.id=?'+(lock?' FOR UPDATE OF o':'')).get(targetId);if(!record)fail('Asignación no encontrada.',404);offerings=[record];
  }else fail('Tipo de revisión inválido.');
  const offeringIds=offerings.map(o=>o.id);
  const enrollments=type==='student'?await db.prepare('SELECT * FROM enrollments WHERE student_id=? ORDER BY id'+(lock?' FOR UPDATE':'')).all(targetId):(await db.query('SELECT * FROM enrollments WHERE offering_id=ANY($1::int[]) ORDER BY id'+(lock?' FOR UPDATE':''),[offeringIds])).rows;
  const groups=(await db.query('SELECT * FROM academic_groups WHERE offering_id=ANY($1::int[]) ORDER BY id',[offeringIds])).rows;
  const members=type==='student'?await db.prepare('SELECT * FROM academic_group_students WHERE student_id=? ORDER BY group_id').all(targetId):(await db.query('SELECT * FROM academic_group_students WHERE group_id=ANY($1::int[]) ORDER BY group_id,student_id',[groups.map(g=>g.id)])).rows;
  students=[...new Set(enrollments.map(e=>e.student_id))];
  const context=type==='student'?`CI ${record.ci||'PENDIENTE'} · REGISTRO ${targetId}`:type==='module'?`GESTIÓN ${(await db.prepare('SELECT name FROM years WHERE id=?').get(record.year_id)).name} · ${record.start_date} A ${record.end_date}`:academicUpper(`${record.career} · ${record.level}º AÑO · ${record.shift} · ${record.module} · GESTIÓN ${record.year} · ${record.teacher}`);
  const revision=createHash('sha256').update(JSON.stringify({record,offerings,enrollments,groups,members})).digest('hex');
  return {record,offerings,enrollments,groups,members,public:{type,id:targetId,title:academicUpper(type==='offering'?partTitle({...record,subject:record.name}):record.name),context,students:students.length,enrollments:enrollments.length,notes:enrollments.filter(hasNotes).length,offerings:offerings.length,groups:groups.length,revision,...(type==='offering'&&record.series_id?{deletion_blocked:'Esta asignación pertenece a una materia por partes. Se conserva para mantener la secuencia y el promedio de sus estudiantes.'}:{})}};
}
export async function academicImpact(db,type,targetId){return db.transaction(async()=>(await snapshot(db,type,id(targetId))).public,{isolation:'REPEATABLE READ'});}
function reviewed(input,impact,phrase){if(input.confirm!==phrase)fail(`Escribe ${phrase} para confirmar.`);if(input.revision!==impact.revision)fail('Los datos cambiaron desde la revisión. Cierra y abre de nuevo la confirmación.',409);}

export async function offeringRosterReview(db,offeringId){
  return db.transaction(async()=>{
    const state=await snapshot(db,'offering',id(offeringId));
    const enrolled=state.enrollments.map(e=>e.student_id),r=state.record;
    const candidates=(await db.query(`SELECT s.*,u.name,u.ci,y.name AS admission_year FROM students s JOIN users u ON u.id=s.user_id JOIN years y ON y.id=s.admission_year_id
      WHERE s.user_id=ANY($1::int[]) OR (s.career_id=$2 AND s.shift_id=$4 AND ((s.level=$3 AND ($5::int IS NULL OR s.admission_year_id=$5)) OR s.level>$3)) ORDER BY upper(u.name),s.user_id`,[enrolled,r.career_id,r.level,r.shift_id,state.groups[0]?.admission_year_id||null])).rows;
    const admits=await moduleAdmissionRule(db,r.module_id),allowed=candidates.filter(student=>enrolled.includes(student.user_id)||student.level>r.level||admits(student.admission_year_id));
    const detail=await db.prepare('SELECT c.name AS career,m.name AS module,y.name AS year,sh.name AS shift FROM offerings o JOIN subjects s ON s.id=o.subject_id JOIN careers c ON c.id=s.career_id JOIN modules m ON m.id=o.module_id JOIN years y ON y.id=m.year_id JOIN shifts sh ON sh.id=o.shift_id WHERE o.id=?').get(offeringId);
    const profiles=await db.prepare('SELECT level,COUNT(*) count FROM students WHERE career_id=? AND shift_id=? GROUP BY level ORDER BY level').all(r.career_id,r.shift_id);
    const levels=Object.fromEntries([1,2,3].map(level=>[level,profiles.find(p=>p.level===level)?.count||0]));
    const regular=allowed.filter(s=>s.career_id===r.career_id&&s.shift_id===r.shift_id&&s.level===r.level);
    return {...state.public,context:academicUpper(`${detail.career} · ${r.level}º AÑO · ${detail.module} · ${detail.year} · ${detail.shift}`),scope:{career_id:r.career_id,shift_id:r.shift_id,career:academicUpper(detail.career),shift:academicUpper(detail.shift),level:r.level,levels,regular_eligible:regular.length},student_ids:enrolled,graded_student_ids:state.enrollments.filter(hasNotes).map(e=>e.student_id),students:allowed.map(s=>({...s,name:academicUpper(s.name),retake_candidate:s.level>r.level}))};
  },{isolation:'REPEATABLE READ'});
}

export async function updateOfferingRoster(db,input,actor){
  const offeringId=id(input.offering_id),studentIds=ids(input.student_ids);
  return db.transaction(async()=>{
    await structuralLock(db);const state=await snapshot(db,'offering',offeringId,true);
    if(input.revision!==state.public.revision)fail('La lista o sus notas cambiaron. Cierra y abre de nuevo Editar inscritos.',409);
    const existing=new Set(state.enrollments.map(e=>e.student_id)),selected=new Set(studentIds),removed=state.enrollments.filter(e=>!selected.has(e.student_id));
    if(removed.some(hasNotes)&&input.confirm_grades!=='RETIRAR CON NOTAS')fail('Hay estudiantes desmarcados con notas o borradores. Confirma que deseas retirarlos junto con sus notas.',409);
    const students=await eligibility(db,studentIds,state.record,state.record.shift_id,state.groups[0]?.admission_year_id,existing,allowsRetakes(input.allow_retake));
    const admits=await moduleAdmissionRule(db,state.record.module_id);
    for(const student of students)if(!existing.has(student.user_id)&&student.level<=state.record.level&&!admits(student.admission_year_id))fail('El estudiante debe usar el módulo de su calendario de ingreso.');
    for(const row of removed)await db.prepare('DELETE FROM enrollments WHERE id=?').run(row.id);
    for(const group of state.groups){await db.query('DELETE FROM academic_group_students WHERE group_id=$1 AND NOT(student_id=ANY($2::int[]))',[group.id,studentIds]);for(const studentId of studentIds)await db.prepare('INSERT INTO academic_group_students(group_id,student_id) VALUES (?,?) ON CONFLICT DO NOTHING').run(group.id,studentId);}
    let added=0;for(const studentId of studentIds){
      const retake=students.find(s=>s.user_id===studentId).level>state.record.level;
      const count=(await db.prepare('INSERT INTO enrollments(student_id,offering_id,is_retake) VALUES (?,?,?) ON CONFLICT DO NOTHING').run(studentId,offeringId,retake)).changes;added+=count;
      if(count&&retake)await audit(db,actor,'Materia pendiente inscrita',`Estudiante ${studentId} · asignación ${offeringId} · materia de ${state.record.level}º; año actual e ingreso conservados.`);
    }
    await audit(db,actor,'Lista de inscritos actualizada',`Asignación ${offeringId}: ${added} agregados, ${removed.length} retirados, ${removed.filter(hasNotes).length} registros con notas retirados; notas restantes conservadas.`);
    return {ok:true,added,removed:removed.length};
  });
}

export async function editStudent(db,input,actor){
  const studentId=id(input.student_id);
  return db.transaction(async()=>{
    await structuralLock(db);const {student,user}=await studentRow(db,studentId);
    const name=title(input.name),ci=typeof input.ci==='string'&&input.ci.trim()?input.ci.trim():null,namePending=input.name_pending===true||input.name_pending==='true';
    if(ci&&(ci.length<5||ci.length>40))fail('El CI debe tener entre 5 y 40 caracteres.');
    if(user.ci&&!ci)fail('No puedes dejar vacío un CI ya registrado. Corrígelo por el CI correcto.');
    if(ci&&namePending)fail('Confirma el nombre completo antes de habilitar el acceso.');
    const career=id(input.career_id,'la carrera'),shift=id(input.shift_id,'el turno'),admission=id(input.admission_year_id,'el ingreso'),level=yearLevel(input.level);
    for(const [table,value] of [['careers',career],['shifts',shift],['years',admission]])if(!await db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(value))fail('Carrera, turno o ingreso no registrados.');
    if(!user.ci&&ci)await db.prepare('UPDATE users SET name=?,ci=?,password=?,must_change=1 WHERE id=?').run(name,ci,hashPassword(ci),studentId);
    else await db.prepare('UPDATE users SET name=?,ci=? WHERE id=?').run(name,ci,studentId);
    if(ci!==user.ci)await db.prepare('DELETE FROM sessions WHERE user_id=?').run(studentId);
    await db.prepare('UPDATE students SET career_id=?,shift_id=?,admission_year_id=?,level=?,name_pending=? WHERE user_id=?').run(career,shift,admission,level,namePending,studentId);
    await audit(db,actor,'Estudiante editado',`Estudiante ${studentId}: ${user.name} → ${name}; CI ${ci!==user.ci?'corregido; sesiones cerradas':'conservado'}; carrera ${student.career_id} → ${career}, turno ${student.shift_id} → ${shift}, ingreso ${student.admission_year_id} → ${admission}, año ${student.level} → ${level}. Historial conservado.`);
    return {ok:true};
  });
}
export async function resetStudentPassword(db,input,actor){
  const studentId=id(input.student_id),password=input.password;
  if(typeof password!=='string'||password!==password.trim()||password.length<8||password.length>160)fail('La contraseña temporal debe tener entre 8 y 160 caracteres.');
  return db.transaction(async()=>{
    await structuralLock(db);const {user}=await studentRow(db,studentId);
    if(!user.ci)fail('Completa el CI del estudiante antes de restablecer su contraseña.');
    if(password===user.ci)fail('La contraseña temporal debe ser distinta del CI.');
    await db.prepare('UPDATE users SET password=?,must_change=1 WHERE id=?').run(hashPassword(password),studentId);await db.prepare('DELETE FROM sessions WHERE user_id=?').run(studentId);
    await audit(db,actor,'Contraseña de estudiante restablecida',`Estudiante ${studentId}; sesiones cerradas y cambio obligatorio al ingresar.`);return {ok:true};
  });
}
export async function resetTeacherPassword(db,input,actor){
  const teacherId=id(input.teacher_id),password=input.password;
  if(typeof password!=='string'||password!==password.trim()||password.length<8||password.length>160)fail('La contraseña temporal debe tener entre 8 y 160 caracteres.');
  return db.transaction(async()=>{
    const user=await db.prepare("SELECT * FROM users WHERE id=? AND role='teacher' FOR UPDATE").get(teacherId);
    if(!user)fail('Docente no encontrado.',404);
    if(!user.ci)fail('Completa el CI del docente antes de restablecer su contraseña.');
    if(password===user.ci)fail('La contraseña temporal debe ser distinta del CI.');
    await db.prepare('UPDATE users SET password=?,must_change=1 WHERE id=?').run(hashPassword(password),teacherId);
    await db.prepare('DELETE FROM sessions WHERE user_id=?').run(teacherId);
    await audit(db,actor,'Contraseña de docente restablecida',`Docente ${teacherId}; sesiones cerradas y cambio obligatorio al ingresar.`);
    return {ok:true};
  });
}
export async function deleteStudent(db,input,actor){
  const studentId=id(input.student_id);return db.transaction(async()=>{
    await structuralLock(db);const state=await snapshot(db,'student',studentId,true);reviewed(input,state.public,'ELIMINAR ESTUDIANTE');
    await db.prepare('DELETE FROM academic_group_students WHERE student_id=?').run(studentId);await db.prepare('DELETE FROM enrollments WHERE student_id=?').run(studentId);await db.prepare('DELETE FROM sessions WHERE user_id=?').run(studentId);
    await db.prepare('UPDATE audit SET actor_id=NULL WHERE actor_id=?').run(studentId);await db.prepare('DELETE FROM students WHERE user_id=?').run(studentId);await db.prepare('DELETE FROM users WHERE id=?').run(studentId);
    await audit(db,actor,'Estudiante eliminado',`Estudiante ${studentId}: ${state.record.name}; ${state.public.enrollments} inscripciones y ${state.public.notes} registros con notas eliminados.`);return {ok:true};
  });
}
export async function deleteOffering(db,input,actor){
  const offeringId=id(input.offering_id);return db.transaction(async()=>{
    await structuralLock(db);const state=await snapshot(db,'offering',offeringId,true);
    if(state.public.deletion_blocked)fail(state.public.deletion_blocked,409);
    reviewed(input,state.public,'ELIMINAR ASIGNACION');
    await db.query('DELETE FROM academic_group_students WHERE group_id=ANY($1::int[])',[state.groups.map(g=>g.id)]);
    await db.prepare('DELETE FROM academic_groups WHERE offering_id=?').run(offeringId);
    await db.prepare('DELETE FROM enrollments WHERE offering_id=?').run(offeringId);
    await db.prepare('DELETE FROM offerings WHERE id=?').run(offeringId);
    await audit(db,actor,'Materia retirada del módulo',`Asignación ${offeringId}: ${state.record.name} · ${state.public.context}; ${state.public.enrollments} inscripciones y ${state.public.notes} registros con notas retirados. Personas, catálogo y otras asignaciones conservados.`);
    return {ok:true};
  });
}
export async function editModule(db,input,actor){return saveCalendarModule(db,input,actor,{moduleId:id(input.module_id)});}

export async function deleteModule(db,input,actor){
  const moduleId=id(input.module_id);return db.transaction(async()=>{
    await structuralLock(db);const state=await snapshot(db,'module',moduleId,true);reviewed(input,state.public,'ELIMINAR TRIMESTRE');
    if(state.offerings.some(o=>o.series_id))fail('Este trimestre contiene partes de una materia. Conserva sus asignaciones para no interrumpir el historial por partes.',409);
    await db.query('DELETE FROM academic_group_students WHERE group_id=ANY($1::int[])',[state.groups.map(g=>g.id)]);await db.query('DELETE FROM academic_groups WHERE id=ANY($1::int[])',[state.groups.map(g=>g.id)]);
    await db.query('DELETE FROM enrollments WHERE offering_id=ANY($1::int[])',[state.offerings.map(o=>o.id)]);await db.prepare('DELETE FROM offerings WHERE module_id=?').run(moduleId);await db.prepare('DELETE FROM modules WHERE id=?').run(moduleId);
    await audit(db,actor,'Trimestre eliminado',`Trimestre ${moduleId}: ${state.record.name}; ${state.public.offerings} asignaciones, ${state.public.enrollments} inscripciones y ${state.public.notes} registros con notas eliminados. Personas y catálogo conservados.`);return {ok:true};
  });
}
