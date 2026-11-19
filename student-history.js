import {summarizeAcademicHistory} from './public/history-summary.js';
import {uppercaseAcademicData} from './public/academic-text.js';
import {decoratePart} from './public/part-summary.js';
export async function studentAcademicHistory(db,studentId){
  return db.transaction(async()=>{
    const profile=await db.prepare(`SELECT s.user_id,s.level,s.career_id,c.name career,sh.name shift,y.name admission_year,u.name,u.blocked
      FROM students s JOIN users u ON u.id=s.user_id JOIN careers c ON c.id=s.career_id JOIN shifts sh ON sh.id=s.shift_id JOIN years y ON y.id=s.admission_year_id WHERE s.user_id=?`).get(studentId);
    if(!profile)throw Object.assign(new Error('Estudiante no encontrado.'),{status:404});
    if(profile.blocked)throw Object.assign(new Error('La consulta de tu expediente está suspendida. Comunícate con secretaría.'),{status:403});
    const subjects=await db.prepare('SELECT s.*,c.name career FROM subjects s JOIN careers c ON c.id=s.career_id WHERE s.career_id=? AND s.active=true').all(profile.career_id);
    const attempts=await db.prepare(`SELECT e.id enrollment_id,e.student_id,e.grade,e.saber,e.hacer,e.ser,e.is_retake,o.subject_id,o.series_id,o.part_number,o.part_recovery,ps.part_count,ps.completed series_complete,s.name subject,s.code subject_code,s.level,s.career_id,c.name career,
      m.name module,m.start_date,m.end_date,y.name AS year,sh.name shift,u.name teacher
      FROM enrollments e JOIN offerings o ON o.id=e.offering_id JOIN subjects s ON s.id=o.subject_id JOIN careers c ON c.id=s.career_id
      JOIN modules m ON m.id=o.module_id JOIN years y ON y.id=m.year_id JOIN shifts sh ON sh.id=o.shift_id JOIN users u ON u.id=o.teacher_id LEFT JOIN subject_series ps ON ps.id=o.series_id WHERE e.student_id=?`).all(studentId);
    const {blocked,...student}=profile;
    return uppercaseAcademicData({student,...summarizeAcademicHistory(subjects,attempts.map(decoratePart))});
  },{isolation:'REPEATABLE READ'});
}
