const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function planillaHTML(report) {
  const o=report.offering;
  const date=new Intl.DateTimeFormat('es-BO',{day:'numeric',month:'long',year:'numeric',timeZone:'America/La_Paz'}).format(new Date(report.generated_at));
  const pages=[];
  for(let i=0;i<Math.max(1,report.rows.length);i+=20)pages.push(report.rows.slice(i,i+20));
  return pages.map((rows,index)=>`<article class="letter-sheet" aria-label="Planilla de notas, página ${index+1}">
    <header class="sheet-header"><div class="sheet-emblem"><img src="/assets/ceicom-logo.png" alt="Escudo de Ceicom"></div><div><span>INSTITUTO TECNOLÓGICO</span><strong>CEICOM</strong><b>${esc(o.year)}</b></div></header>
    <div class="sheet-title"><span>REGISTRO ACADÉMICO</span><h2>PLANILLA DE NOTAS</h2><p>Elaborado el ${esc(date)}</p>${report.pending?'<b class="sheet-draft">BORRADOR · NOTAS PENDIENTES</b>':''}</div>
    <dl class="sheet-metadata"><div><dt>CARRERA:</dt><dd>${esc(o.career.toLocaleUpperCase('es'))}</dd></div><div><dt>MATERIA:</dt><dd>${esc(`${o.subject}${o.subject_code?' ('+o.subject_code+')':''}`.toLocaleUpperCase('es'))}</dd></div><div class="sheet-meta-split"><div><dt>CURSO:</dt><dd>${esc(o.course)}</dd></div><div><dt>TURNO:</dt><dd>${esc(o.shift)}</dd></div></div><div><dt>PERÍODO:</dt><dd>${esc(o.module)} · Gestión ${esc(o.year)}</dd></div></dl>
    <table class="sheet-table"><colgroup><col class="col-number"><col class="col-name"><col class="col-dimension"><col class="col-dimension"><col class="col-dimension"><col class="col-final"><col class="col-status"></colgroup><thead><tr><th rowspan="2">Nº</th><th rowspan="2">APELLIDOS Y NOMBRES</th><th colspan="3" class="dimensions-heading">DIMENSIONES</th><th rowspan="2">NOTA<br>FINAL</th><th rowspan="2">OBSERVACIÓN</th></tr><tr><th>SABER<small>40 pts</small></th><th>HACER<small>40 pts</small></th><th>SER<small>20 pts</small></th></tr></thead><tbody>${Array.from({length:Math.max(20,rows.length)},(_,i)=>{
      const r=rows[i];
      return `<tr class="${r&&r.grade!==null&&r.grade<61?'sheet-failed':''}"><td>${r?.number??index*20+i+1}</td><td>${r?esc(r.student.toLocaleUpperCase('es')):''}</td><td>${r?esc(r.saber??'—'):''}</td><td>${r?esc(r.hacer??'—'):''}</td><td>${r?esc(r.ser??'—'):''}</td><td>${r?esc(r.grade??'—'):''}</td><td>${r?esc(r.status):''}</td></tr>`;
    }).join('')}</tbody></table>
    <p class="sheet-legend">Escala de 1 a 100 puntos · Aprobación desde 61 · <span>Rojo: estudiante reprobado</span></p>
    ${report.legacy?'<p class="sheet-legacy">—: desglose no registrado en notas anteriores. Se conserva la nota final original.</p>':''}
    <div class="sheet-signatures"><div><strong>${esc(o.teacher.toLocaleUpperCase('es'))}</strong><span>DOCENTE</span></div><div><strong>DIRECCIÓN ACADÉMICA</strong><span>FIRMA Y SELLO</span></div></div>
    <footer class="sheet-footer"><span>Ceicom · Registro académico · Planilla ${o.id}</span><span>Página ${index+1} de ${pages.length}</span></footer>
  </article>`).join('');
}
