export const allowsRetakes=value=>value===true||value==='true';
export function enrollmentMatches(student,offering,{allowRetake=false,admissionYearId=null}={}){
  if(student.career_id!==offering.career_id||student.shift_id!==offering.shift_id)return false;
  if(student.level>offering.level)return allowRetake;
  return student.level===offering.level&&(!admissionYearId||student.admission_year_id===admissionYearId);
}
export function retakeOption(label='Incluir estudiantes de años superiores con materias pendientes'){
  return `<label class="retake-option"><input type="checkbox" name="allow_retake" value="true"><span>${label}<small>Permite cursar un año anterior en la misma carrera y turno, incluso desde otro ingreso. Conserva el año actual y las notas anteriores.</small></span></label>`;
}

export function retakeStudentLabel(student){
  if(!student?.is_retake)return '';
  return ['MATERIA PENDIENTE',student.student_level?`${student.student_level}º AÑO ACTUAL`:'',student.admission_year?`INGRESO ${student.admission_year}`:''].filter(Boolean).join(' · ');
}
