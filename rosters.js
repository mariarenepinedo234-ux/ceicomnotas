import {keyOf,teacherKey} from './catalog.js';

const careerKey=name=>keyOf(name)==='COMERCIO INTERNACIONAL'?'COMERCIO INTERNACIONAL Y ADMINISTRACION ADUANERA':keyOf(name);
const required=(value,label)=>{if(typeof value!=='string'||!value.trim()||value.length>160)throw new Error(`${label}: dato requerido (máximo 160 caracteres).`);return value.trim().replace(/\s+/g,' ');};

export async function loadRosters(db,input,actorId=null){
  const admission=required(input.admission_year,'Gestión de ingreso'),year=required(input.academic_year,'Gestión académica');
  if(!/^20\d{2}$/.test(admission)||!/^20\d{2}$/.test(year)||year<admission)throw new Error('Gestiones inválidas.');
  if(!Number.isInteger(input.level)||input.level<1||input.level>3)throw new Error('Año académico inválido.');
  if(!Array.isArray(input.groups)||!input.groups.length||input.groups.length>100)throw new Error('Indica de 1 a 100 grupos.');
  const shiftName=required(input.shift,'Turno');
  const module=input.module;
  if(!module||!/^\d{4}-\d{2}-\d{2}$/.test(module.start_date)||!/^\d{4}-\d{2}-\d{2}$/.test(module.end_date)||module.start_date>module.end_date||module.start_date.slice(0,4)!==year||module.end_date.slice(0,4)!==year)throw new Error('Indica módulo y fechas de la gestión académica.');
  const teacherName=required(input.teacher,'Docente');
  return db.transaction(async()=>{
    await db.query('SELECT pg_advisory_xact_lock(731202605)');
    const result={students_created:0,students_reused:0,subjects_created:0,groups_created:0,enrollments_created:0,group_ids:[]};
    async function yearId(name){const row=(await db.query('INSERT INTO years(name) VALUES ($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[name])).rows[0];return row.id;}
    const admissionId=await yearId(admission),academicId=await yearId(year);
    const shift=(await db.prepare('SELECT * FROM shifts').all()).find(s=>keyOf(s.name)===keyOf(shiftName));if(!shift)throw new Error('El turno no está registrado.');
    const directories=await db.prepare('SELECT * FROM teacher_directory').all();
    const requested=teacherKey(teacherName).split(' '),matches=directories.filter(d=>requested.every(token=>teacherKey(d.name).split(' ').includes(token)));
    let teacherId;
    if(matches.length===1){
      const teacher=matches[0];teacherId=teacher.user_id;
      if(!teacherId){
        const existing=(await db.prepare("SELECT id,name FROM users WHERE role='teacher'").all()).filter(u=>teacherKey(u.name)===teacherKey(teacher.name));
        if(existing.length>1)throw new Error('Hay docentes con el mismo nombre. Revisa sus identidades antes de continuar.');
        teacherId=existing[0]?.id;
        if(!teacherId)teacherId=(await db.prepare("INSERT INTO users(ci,name,role,password) VALUES (NULL,?,'teacher',NULL)").run(teacher.name)).lastInsertRowid;
        await db.prepare('UPDATE teacher_directory SET user_id=? WHERE id=?').run(teacherId,teacher.id);
      }
    }else if(!matches.length){
      const existing=(await db.prepare("SELECT id,name FROM users WHERE role='teacher'").all()).filter(u=>requested.every(token=>teacherKey(u.name).split(' ').includes(token)));
      if(existing.length!==1)throw new Error('El docente debe coincidir con un único registro.');teacherId=existing[0].id;
    }else throw new Error('El nombre del docente coincide con varios registros.');
    const moduleName=required(module.name,'Módulo');
    const candidates=await db.prepare('SELECT * FROM modules WHERE year_id=? AND (name=? OR start_date=?) FOR UPDATE').all(academicId,moduleName,module.start_date);
    if(candidates.length>1)throw new Error('Hay más de un módulo que coincide; revisa la planificación.');
    let moduleId=candidates[0]?.id;
    if(await db.prepare('SELECT id FROM modules WHERE year_id=? AND start_date<=? AND end_date>=? AND id<>?').get(academicId,module.end_date,module.start_date,moduleId||0))throw new Error('Las fechas se superponen con otro módulo.');
    if(moduleId){
      const old=candidates[0];
      await db.prepare('UPDATE modules SET name=?,start_date=?,end_date=? WHERE id=?').run(moduleName,module.start_date,module.end_date,moduleId);
      if(old.name!==moduleName||old.start_date!==module.start_date||old.end_date!==module.end_date)await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(actorId,'Calendario actualizado',`Módulo ${moduleId}: ${old.start_date}/${old.end_date} → ${module.start_date}/${module.end_date}. Fechas confirmadas para la carga de grupos.`);
    }else{
      if((await db.prepare('SELECT COUNT(*) n FROM modules WHERE year_id=?').get(academicId)).n>=4)throw new Error('La gestión ya tiene cuatro módulos.');
      moduleId=(await db.query('INSERT INTO modules(name,year_id,start_date,end_date) VALUES ($1,$2,$3,$4) RETURNING id',[moduleName,academicId,module.start_date,module.end_date])).rows[0].id;
    }
    const careers=await db.prepare('SELECT * FROM careers').all(),reused=new Set();
    for(const group of input.groups){
      const career=careers.filter(c=>careerKey(c.name)===careerKey(required(group.career,'Carrera')));if(career.length!==1)throw new Error('La carrera debe coincidir con un único registro.');
      if(!Array.isArray(group.students)||!group.students.length||group.students.length>200)throw new Error('Cada grupo requiere de 1 a 200 estudiantes.');
      const subjectName=required(group.subject,'Materia'),code=group.code?required(group.code,'Código').toUpperCase():null;
      if(code&&!/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(code))throw new Error('Código de materia inválido.');
      const subjects=(await db.prepare('SELECT * FROM subjects WHERE career_id=? AND level=?').all(career[0].id,input.level)).filter(s=>keyOf(s.name)===keyOf(subjectName)||(code&&s.code===code));
      if(subjects.length>1)throw new Error('Hay varias materias equivalentes. Revisa sus códigos.');
      let subjectId=subjects[0]?.id;
      if(subjects[0]&&!subjects[0].active)throw new Error('Una materia del grupo está inactiva.');
      if(!subjectId){subjectId=(await db.query('INSERT INTO subjects(name,code,career_id,level) VALUES ($1,$2,$3,$4) RETURNING id',[subjectName,code,career[0].id,input.level])).rows[0].id;result.subjects_created++;}
      let offering=await db.prepare('SELECT * FROM offerings WHERE subject_id=? AND module_id=? AND shift_id=? FOR UPDATE').get(subjectId,moduleId,shift.id);
      if(offering&&offering.teacher_id!==teacherId)throw new Error('La asignación ya pertenece a otro docente. No se reemplaza automáticamente.');
      if(!offering)offering=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES ($1,$2,$3,$4) RETURNING *',[subjectId,moduleId,shift.id,teacherId])).rows[0];
      let record=await db.prepare('SELECT * FROM academic_groups WHERE subject_id=? AND year_id=? AND admission_year_id=? AND shift_id=?').get(subjectId,academicId,admissionId,shift.id);
      if(!record){record=(await db.query('INSERT INTO academic_groups(subject_id,year_id,admission_year_id,shift_id,offering_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',[subjectId,academicId,admissionId,shift.id,offering.id])).rows[0];result.groups_created++;}
      if(record.offering_id!==offering.id)throw new Error('El grupo ya está vinculado a otra asignación.');
      result.group_ids.push(record.id);
      const existing=await db.prepare('SELECT s.*,u.name FROM students s JOIN users u ON u.id=s.user_id WHERE s.career_id=? AND s.admission_year_id=?').all(career[0].id,admissionId);
      const inGroup=new Set();
      for(const entry of group.students){
        const name=required(typeof entry==='string'?entry:entry.name,'Nombre del estudiante'),namePending=typeof entry==='object'&&entry.name_pending===true,key=keyOf(name);
        if(inGroup.has(key))throw new Error('El mismo nombre aparece dos veces en un grupo. Revisa los CI para distinguirlos.');inGroup.add(key);
        const found=existing.filter(s=>keyOf(s.name)===key);
        if(found.length>1)throw new Error('Hay estudiantes homónimos. Completa sus CI antes de vincularlos.');
        let studentId=found[0]?.user_id;
        if(found[0]&&(found[0].shift_id!==shift.id||found[0].level!==input.level))throw new Error('El estudiante tiene otro turno/año actual; realiza primero su traslado.');
        if(!studentId){
          studentId=(await db.prepare("INSERT INTO users(ci,name,role,password) VALUES (NULL,?,'student',NULL)").run(name)).lastInsertRowid;
          await db.prepare('INSERT INTO students(user_id,career_id,shift_id,admission_year_id,level,name_pending) VALUES (?,?,?,?,?,?)').run(studentId,career[0].id,shift.id,admissionId,input.level,namePending);
          existing.push({user_id:studentId,name,shift_id:shift.id,level:input.level});result.students_created++;
        }else if(!reused.has(studentId)){result.students_reused++;reused.add(studentId);}
        await db.prepare('INSERT INTO academic_group_students(group_id,student_id) VALUES (?,?) ON CONFLICT DO NOTHING').run(record.id,studentId);
        const inserted=await db.prepare('INSERT INTO enrollments(student_id,offering_id) VALUES (?,?) ON CONFLICT DO NOTHING').run(studentId,offering.id);result.enrollments_created+=inserted.changes;
      }
    }
    await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(actorId,'Grupos académicos cargados',JSON.stringify({...result,admission_year:admission,academic_year:year}));
    return result;
  });
}

export async function updateStudentProfile(db,input,actorId){
  return db.transaction(async()=>{
    const student=await db.prepare('SELECT * FROM students WHERE user_id=? FOR UPDATE').get(input.student_id);
    if(!student)throw new Error('Estudiante no encontrado.');
    const user=await db.prepare('SELECT * FROM users WHERE id=? FOR UPDATE').get(student.user_id);
    const name=required(input.name??user.name,'Nombre completo'),namePending=input.name_pending??student.name_pending;
    if(typeof namePending!=='boolean')throw new Error('Estado del nombre inválido.');
    const ci=typeof input.ci==='string'&&input.ci.trim()?input.ci.trim():user.ci;
    if(ci&&(ci.length<5||ci.length>40))throw new Error('Ingresa un CI de 5 a 40 caracteres.');
    if(user.ci&&ci!==user.ci)throw new Error('El CI ya está registrado. No se cambia desde completar datos pendientes.');
    if(ci&&namePending)throw new Error('Completa y confirma el nombre antes de habilitar el acceso.');
    if(!user.ci&&ci){
      const {hashPassword}=await import('./lib.js');
      await db.prepare('UPDATE users SET name=?,ci=?,password=?,must_change=1 WHERE id=?').run(name,ci,hashPassword(ci),user.id);
    }else await db.prepare('UPDATE users SET name=? WHERE id=?').run(name,user.id);
    await db.prepare('UPDATE students SET name_pending=? WHERE user_id=?').run(namePending,user.id);
    await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(actorId,'Datos de estudiante completados',`Estudiante ${user.id}; ${ci?'CI registrado':'CI pendiente'}; ${namePending?'nombre pendiente':'nombre confirmado'}. Historial conservado.`);
  });
}
