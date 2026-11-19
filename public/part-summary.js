export function romanPart(value){
  let n=Number(value);if(!Number.isSafeInteger(n)||n<1)return '';
  if(n>3999)return String(n);
  let result='';for(const [amount,label] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])while(n>=amount){result+=label;n-=amount;}
  return result;
}
export const partLabel=row=>row.series_id?`PARTE ${romanPart(row.part_number)}${row.part_recovery?' · RECUPERACIÓN':''}`:'';
export const partTitle=row=>`${row.subject_base||row.subject||''}${row.series_id?' · '+partLabel(row):''}`;
export const decoratePart=row=>({...row,subject_base:row.subject_base||row.subject,subject:partTitle(row)});
export const recentAttempt=(a,b)=>String(b.end_date||'').localeCompare(String(a.end_date||''))||Number(b.enrollment_id||b.id)-Number(a.enrollment_id||a.id);
const mean=values=>Math.round(values.reduce((sum,v)=>sum+v,0)/values.length*100)/100;
// Nunca se mezclan partes de series distintas ni estudiantes distintos.
export function summarizeSeries(attempts,{today=''}={}){
  const rows=attempts.slice().sort(recentAttempt),first=rows[0];if(!first)return null;
  const count=Number(first.part_count),parts=[];
  for(let number=1;number<=count;number++){
    const records=rows.filter(row=>row.part_number===number),selected=records.find(row=>row.grade!==null&&row.grade>=61)||records[0];
    const grade=selected?.grade??null;
    parts.push({number,label:`PARTE ${romanPart(number)}`,grade,state:grade!==null?(grade>=61?'approved':'failed'):records.length?'awaiting_grade':'not_enrolled',attempts:records});
  }
  const graded=parts.filter(part=>part.grade!==null),failed=parts.filter(part=>part.state==='failed'),missing=parts.filter(part=>part.grade===null);
  const complete=!!first.series_complete,grade=complete&&!missing.length?mean(graded.map(p=>p.grade)):null;
  const state=failed.length?'failed':complete&&!missing.length?'approved':!complete||rows.some(row=>row.end_date>=today)?'enrolled':'awaiting_grade';
  return {series_id:first.series_id,part_count:count,completed:complete,parts,grade,state,provisional_average:graded.length?mean(graded.map(p=>p.grade)):null,
    end_date:first.end_date,enrollment_id:first.enrollment_id||first.id,
    note:!complete?'EN CURSO · FALTA CONCLUIR LA MATERIA':missing.length?`${missing.map(p=>p.label).join(', ')}: SIN NOTA O SIN INSCRIPCIÓN`:failed.length?`${failed.map(p=>p.label).join(', ')}: POR RECUPERAR`:'PROMEDIO FINAL · TODAS LAS PARTES APROBADAS'};
}
