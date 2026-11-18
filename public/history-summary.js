import {compareSubjects} from './subject-order.js';
export const historyStates={approved:'Aprobada',failed:'Reprobada',enrolled:'Inscrita / en curso',awaiting_grade:'Nota pendiente',not_enrolled:'Sin inscripción'};
const recentFirst=(a,b)=>String(b.end_date||'').localeCompare(String(a.end_date||''))||Number(b.enrollment_id)-Number(a.enrollment_id);
export function summarizeAcademicHistory(subjects,attempts,{today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}={}){
  const hasOfficial=subjects.some(s=>s.active&&s.catalog_order!==null&&s.catalog_order!==undefined);
  const plan=subjects.filter(s=>s.active&&(!hasOfficial||s.catalog_order!==null&&s.catalog_order!==undefined));
  const records=new Map();for(const attempt of attempts){if(!records.has(attempt.subject_id))records.set(attempt.subject_id,[]);records.get(attempt.subject_id).push(attempt);}
  function course(subject){
    const rows=(records.get(subject.id)||[]).slice().sort(recentFirst),passed=rows.find(a=>a.grade!==null&&a.grade>=61),latest=rows[0];
    const state=passed?'approved':!latest?'not_enrolled':latest.grade!==null?'failed':latest.end_date&&latest.end_date>=today?'enrolled':'awaiting_grade';
    return {...subject,state,grade:passed?.grade??latest?.grade??null,attempts:rows};
  }
  const courses=plan.map(course).sort(compareSubjects),planIds=new Set(plan.map(s=>s.id)),extras=[];
  for(const [subjectId,rows] of records)if(!planIds.has(subjectId)){
    const known=subjects.find(s=>s.id===subjectId),r=rows[0];extras.push(course(known||{id:subjectId,name:r.subject,code:r.subject_code,career_id:r.career_id,career:r.career,level:r.level,active:false,catalog_order:null}));
  }
  extras.sort(compareSubjects);
  const count=state=>courses.filter(c=>c.state===state).length,approved=count('approved');
  return {plan_source:hasOfficial?'official':'registered',courses,extras,summary:{total:courses.length,approved,remaining:courses.length-approved,not_enrolled:count('not_enrolled'),failed:count('failed'),enrolled:count('enrolled'),awaiting_grade:count('awaiting_grade'),progress:courses.length?Math.round(approved/courses.length*100):0,extras:extras.length}};
}
