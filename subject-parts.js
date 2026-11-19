import {moduleAdmissionRule} from './module-calendars.js';
import {partLabel} from './public/part-summary.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const id=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>2147483647)fail('Selecciona un registro válido.');return n;};
const lock=db=>db.query('SELECT pg_advisory_xact_lock(731202606)');
const audit=(db,actor,action,detail)=>db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(actor,action,detail);

export async function createSubjectPart(db,input,actor){
  const sourceId=id(input.offering_id),moduleId=id(input.module_id),teacherId=id(input.teacher_id);
  if(!['continue','recover'].includes(input.mode))fail('Elige continuar materia o recuperar una parte.');
  if(!Array.isArray(input.student_ids)||input.student_ids.length>1000)fail('Selecciona hasta 1000 estudiantes registrados.');
  const selected=input.student_ids.map(id);if(new Set(selected).size!==selected.length)fail('Hay estudiantes repetidos.');
  return db.transaction(async()=>{
    await lock(db);
    const source=await db.prepare('SELECT o.*,s.career_id,s.level,s.name subject,m.end_date FROM offerings o JOIN subjects s ON s.id=o.subject_id JOIN modules m ON m.id=o.module_id WHERE o.id=? FOR UPDATE OF o').get(sourceId);
    if(!source)fail('Asignación de origen no encontrada.',404);
    const module=await db.prepare('SELECT * FROM modules WHERE id=? FOR UPDATE').get(moduleId);
    if(!module||module.start_date<=source.end_date)fail('Elige un trimestre que comience después de finalizar la parte de origen.');
    if(!await db.prepare("SELECT id FROM users WHERE id=? AND role='teacher'").get(teacherId))fail('Selecciona un docente registrado.');
    if(await db.prepare('SELECT id FROM offerings WHERE subject_id=? AND module_id=? AND shift_id=?').get(source.subject_id,moduleId,source.shift_id))fail('Ya existe una asignación de esta materia y turno en el trimestre elegido. Selecciona otro trimestre.',409);
    let series=source.series_id?await db.prepare('SELECT * FROM subject_series WHERE id=? FOR UPDATE').get(source.series_id):null;
    if(input.mode==='recover'&&!series)fail('Esta asignación aún no pertenece a una materia por partes.');
    if(input.mode==='continue'&&series&&(series.completed||source.part_number!==series.part_count||source.part_recovery))fail('Continúa desde la última parte original. Si la materia está concluida, reábrela primero.',409);
    const rows=await db.prepare(`SELECT e.*,s.level,s.career_id,s.shift_id,s.admission_year_id FROM enrollments e JOIN students s ON s.user_id=e.student_id WHERE e.offering_id=? FOR UPDATE OF e,s`).all(sourceId);
    const admits=await moduleAdmissionRule(db,moduleId);
    for(const studentId of selected){
      const row=rows.find(r=>r.student_id===studentId);
      if(!row)fail('Solo puedes copiar estudiantes que siguen inscritos en la asignación de origen. Reabre el formulario si cambió la lista.',409);
      if(row.career_id!==source.career_id||row.shift_id!==source.shift_id||row.level<source.level)fail('Un estudiante cambió de carrera, turno o año. Revisa su perfil antes de continuar.');
      if(row.level<=source.level&&!admits(row.admission_year_id))fail('El trimestre elegido no corresponde al calendario de ingreso de todos los estudiantes seleccionados.');
    }
    let partNumber;
    if(!series){
      series=(await db.query('INSERT INTO subject_series(subject_id,shift_id,part_count) VALUES ($1,$2,2) RETURNING *',[source.subject_id,source.shift_id])).rows[0];
      await db.prepare('UPDATE offerings SET series_id=?,part_number=1 WHERE id=?').run(series.id,sourceId);partNumber=2;
    }else if(input.mode==='continue'){
      partNumber=series.part_count+1;await db.prepare('UPDATE subject_series SET part_count=? WHERE id=?').run(partNumber,series.id);
    }else partNumber=source.part_number;
    const offering=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id,series_id,part_number,part_recovery) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',[source.subject_id,moduleId,source.shift_id,teacherId,series.id,partNumber,input.mode==='recover'])).rows[0];
    for(const studentId of selected){const row=rows.find(r=>r.student_id===studentId);await db.prepare('INSERT INTO enrollments(student_id,offering_id,is_retake) VALUES (?,?,?)').run(studentId,offering.id,row.is_retake||row.level>source.level);}
    const originGroup=await db.prepare('SELECT admission_year_id FROM academic_groups WHERE offering_id=?').get(sourceId);
    const admissionId=originGroup?.admission_year_id||rows.find(row=>selected.includes(row.student_id))?.admission_year_id;
    if(admissionId){
      const group=(await db.query('INSERT INTO academic_groups(subject_id,year_id,admission_year_id,shift_id,offering_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',[source.subject_id,module.year_id,admissionId,source.shift_id,offering.id])).rows[0];
      for(const studentId of selected)await db.prepare('INSERT INTO academic_group_students(group_id,student_id) VALUES (?,?)').run(group.id,studentId);
    }
    await audit(db,actor,input.mode==='continue'?'Continuación de materia creada':'Recuperación de parte creada',`${source.subject} · serie ${series.id} · ${partLabel(offering)} · asignación ${sourceId} → ${offering.id} · ${selected.length} estudiantes. Notas anteriores conservadas.`);
    return {ok:true,offering_id:offering.id,series_id:series.id,part_number:partNumber,students:selected.length};
  });
}

export async function setSubjectSeriesStatus(db,input,actor){
  const seriesId=id(input.series_id),expected=id(input.part_count);if(typeof input.completed!=='boolean')fail('Indica si la materia queda concluida.');
  return db.transaction(async()=>{
    await lock(db);const series=await db.prepare('SELECT * FROM subject_series WHERE id=? FOR UPDATE').get(seriesId);
    if(!series)fail('Materia por partes no encontrada.',404);
    if(expected!==series.part_count)fail('La cantidad de partes cambió. Reabre el formulario antes de concluir.',409);
    const parts=await db.prepare('SELECT part_number FROM offerings WHERE series_id=? AND NOT part_recovery ORDER BY part_number').all(seriesId);
    if(input.completed&&(parts.length!==series.part_count||parts.some((p,i)=>p.part_number!==i+1)))fail('Faltan asignaciones de partes. Revisa la materia antes de concluir.');
    await db.prepare('UPDATE subject_series SET completed=? WHERE id=?').run(input.completed,seriesId);
    await audit(db,actor,input.completed?'Materia por partes concluida':'Materia por partes reabierta',`Serie ${seriesId} · ${series.part_count} partes. Promedio con igual peso; cada parte requiere al menos 61 puntos. Notas originales conservadas.`);
    return {ok:true};
  });
}
