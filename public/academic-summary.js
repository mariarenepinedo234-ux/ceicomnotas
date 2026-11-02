// La identidad visual de una materia es su nombre normalizado y año académico.
// Las asignaciones por carrera, módulo, turno y docente siguen siendo grupos separados.
const subjectKey=offering=>`${String(offering.subject||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLocaleLowerCase('es')}|${offering.level}`;

export function groupSubjects(offerings){
  const subjects=new Map();
  for(const offering of offerings){
    const key=subjectKey(offering);
    if(!subjects.has(key))subjects.set(key,{key,name:offering.subject,level:offering.level,groups:[]});
    subjects.get(key).groups.push(offering);
  }
  return [...subjects.values()].sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'})||a.level-b.level);
}

export function summarizeOfferings(offerings,enrollments=[]){
  const ids=new Set(offerings.map(o=>o.id)),selected=enrollments.filter(e=>ids.has(e.offering_id)),subjects=groupSubjects(offerings);
  return {
    subjects,
    subjectCount:subjects.length,
    groupCount:offerings.length,
    careerCount:new Set(offerings.map(o=>o.career_id)).size,
    studentCount:new Set(selected.map(e=>e.student_id)).size,
    registered:selected.filter(e=>e.grade!==null).length,
    pending:selected.filter(e=>e.grade===null).length,
    enrollmentCount:selected.length,
  };
}
