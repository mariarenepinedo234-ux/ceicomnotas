import {retakeStudentLabel} from './enrollment-rules.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function planillaHTML(report) {
  const o=report.offering;
  const date=new Intl.DateTimeFormat('es-BO',{day:'numeric',month:'long',year:'numeric',timeZone:'America/La_Paz'}).format(new Date(report.generated_at));
  const pages=[],tableHeight=report.rows.some(row=>row.is_retake)?400:460;
  let rows=[],height=0;
  for(const row of report.rows){
    const label=retakeStudentLabel(row),rowHeight=23+Math.max(0,Math.ceil(row.student.length/48)-1)*12+(label?Math.ceil(label.length/65)*12:0);
    if(rows.length&&(rows.length===20||height+rowHeight>tableHeight)){pages.push({rows,height});rows=[];height=0;}
    rows.push(row);height+=rowHeight;
  }
  if(rows.length||!pages.length)pages.push({rows,height});
  return pages.map(({rows,height},index)=>`<article class="letter-sheet" aria-label="Planilla de notas, página ${index+1}">
    <header class="sheet-header"><div class="sheet-emblem"><img src="/assets/ceicom-logo.png" alt="Escudo de Ceicom"></div><div><span>INSTITUTO TECNOLÓGICO</span><strong>CEICOM</strong><b>${esc(o.year)}</b></div></header>
    <div class="sheet-title"><span>REGISTRO ACADÉMICO</span><h2>PLANILLA DE NOTAS</h2><p>Elaborado el ${esc(date)}</p>${report.pending?'<b class="sheet-draft">BORRADOR · NOTAS PENDIENTES</b>':''}</div>
    <dl class="sheet-metadata"><div><dt>CARRERA:</dt><dd>${esc(o.career.toLocaleUpperCase('es'))}</dd></div><div><dt>MATERIA:</dt><dd>${esc(`${o.subject}${o.subject_code?' ('+o.subject_code+')':''}`.toLocaleUpperCase('es'))}</dd></div><div class="sheet-meta-split"><div><dt>CURSO:</dt><dd>${esc(o.course)}</dd></div><div><dt>TURNO:</dt><dd>${esc(o.shift.toLocaleUpperCase('es'))}</dd></div></div><div><dt>PERÍODO:</dt><dd>${esc(o.module.toLocaleUpperCase('es'))} · GESTIÓN ${esc(o.year)}</dd></div></dl>
    <table class="sheet-table"><colgroup><col class="col-number"><col class="col-name"><col class="col-dimension"><col class="col-dimension"><col class="col-dimension"><col class="col-final"><col class="col-status"></colgroup><thead><tr><th rowspan="2">Nº</th><th rowspan="2">APELLIDOS Y NOMBRES</th><th colspan="3" class="dimensions-heading">DIMENSIONES</th><th rowspan="2">NOTA<br>FINAL</th><th rowspan="2">OBSERVACIÓN</th></tr><tr><th>SABER<small>40 pts</small></th><th>HACER<small>40 pts</small></th><th>SER<small>20 pts</small></th></tr></thead><tbody>${Array.from({length:rows.length+Math.min(20-rows.length,Math.max(0,Math.floor((tableHeight-height)/23)))},(_,i)=>{
      const r=rows[i];
      return `<tr class="${r&&r.grade!==null&&r.grade<61?'sheet-failed':''}"><td>${r?.number??(rows.at(-1)?.number||0)+i-rows.length+1}</td><td>${r?esc(r.student.toLocaleUpperCase('es')):''}${r?.is_retake?`<small class="sheet-student-context">${esc(retakeStudentLabel(r))}</small>`:''}</td><td>${r?esc(r.saber??'—'):''}</td><td>${r?esc(r.hacer??'—'):''}</td><td>${r?esc(r.ser??'—'):''}</td><td>${r?esc(r.grade??'—'):''}</td><td>${r?esc(r.status):''}</td></tr>`;
    }).join('')}</tbody></table>
    <p class="sheet-legend">Escala de 1 a 100 puntos · Aprobación desde 61 · <span>Rojo: estudiante reprobado</span></p>
    ${report.legacy?'<p class="sheet-legacy">—: desglose no registrado en notas anteriores. Se conserva la nota final original.</p>':''}
    <div class="sheet-signatures"><div><strong>${esc(o.teacher.toLocaleUpperCase('es'))}</strong><span>DOCENTE</span></div><div><strong>DIRECCIÓN ACADÉMICA</strong><span>FIRMA Y SELLO</span></div></div>
    <footer class="sheet-footer"><span>Ceicom · Registro académico · Planilla ${o.id}</span><span>Página ${index+1} de ${pages.length}</span></footer>
  </article>`).join('');
}
