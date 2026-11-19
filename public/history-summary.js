import {compareSubjects} from './subject-order.js';
import {summarizeSeries} from './part-summary.js';
export const historyStates={approved:'Aprobada',failed:'Reprobada',enrolled:'Inscrita / en curso',awaiting_grade:'Nota pendiente',not_enrolled:'Sin inscripción'};
const recentFirst=(a,b)=>String(b.end_date||'').localeCompare(String(a.end_date||''))||Number(b.enrollment_id)-Number(a.enrollment_id);
export function summarizeAcademicHistory(subjects,attempts,{today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}={}){
  const hasOfficial=subjects.some(s=>s.active&&s.catalog_order!==null&&s.catalog_order!==undefined);
  const plan=subjects.filter(s=>s.active&&(!hasOfficial||s.catalog_order!==null&&s.catalog_order!==undefined));
  const records=new Map();for(const attempt of attempts){if(!records.has(attempt.subject_id))records.set(attempt.subject_id,[]);records.get(attempt.subject_id).push(attempt);}
  function course(subject){
    const rows=(records.get(subject.id)||[]).slice().sort(recentFirst),series=new Map();
    for(const row of rows)if(row.series_id){if(!series.has(row.series_id))series.set(row.series_id,[]);series.get(row.series_id).push(row);}
    const seriesSummaries=[...series.values()].map(group=>summarizeSeries(group,{today}));
    const ordinary=rows.filter(row=>!row.series_id).map(row=>({...row,state:row.grade!==null?(row.grade>=61?'approved':'failed'):row.end_date&&row.end_date>=today?'enrolled':'awaiting_grade'}));
    const evaluations=[...ordinary,...seriesSummaries].sort(recentFirst),passed=evaluations.find(a=>a.state==='approved'),latest=passed||evaluations[0];
    return {...subject,state:latest?.state||'not_enrolled',grade:latest?.grade??null,attempts:rows,series_summaries:seriesSummaries};
  }
  const courses=plan.map(course).sort(compareSubjects),planIds=new Set(plan.map(s=>s.id)),extras=[];
  for(const [subjectId,rows] of records)if(!planIds.has(subjectId)){
    const known=subjects.find(s=>s.id===subjectId),r=rows[0];extras.push(course(known||{id:subjectId,name:r.subject_base||r.subject,code:r.subject_code,career_id:r.career_id,career:r.career,level:r.level,active:false,catalog_order:null}));
  }
  extras.sort(compareSubjects);
  const count=state=>courses.filter(c=>c.state===state).length,approved=count('approved');
  return {plan_source:hasOfficial?'official':'registered',courses,extras,summary:{total:courses.length,approved,remaining:courses.length-approved,not_enrolled:count('not_enrolled'),failed:count('failed'),enrolled:count('enrolled'),awaiting_grade:count('awaiting_grade'),progress:courses.length?Math.round(approved/courses.length*100):0,extras:extras.length}};
}
