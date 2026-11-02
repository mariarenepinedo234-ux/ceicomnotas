import { planillaHTML } from './planilla.js';

const dims=[['saber','Saber',40],['hacer','Hacer',40],['ser','Ser',20]];
const $=selector=>document.querySelector(selector);
export function openGradebook(id,ctx) {
  const {data,user,modal,icon,escape:esc,dateTime,badge,api,toast}=ctx;
  const offering=data.offerings.find(o=>o.id===id);
  const rows=data.enrollments.filter(e=>e.offering_id===id).sort((a,b)=>a.student.localeCompare(b.student,'es',{sensitivity:'base'})||a.ci.localeCompare(b.ci));
  const editable=user.role==='admin'||offering.can_grade;
  const pending=rows.filter(e=>e.grade===null).length;
  const deadline=offering.unlocked_until&&new Date(offering.unlocked_until)>new Date(offering.deadline)?offering.unlocked_until:offering.deadline;
  modal(offering.subject,`<div class="gradebook-toolbar"><div class="grade-context"><span>${icon('students')} ${esc(offering.career)}</span><span>${esc(offering.module)} · Gestión ${esc(offering.year)} · ${esc(offering.shift)} · ${offering.level}º año</span></div><button type="button" class="btn secondary" id="generate-sheet">${icon('file')} Generar planilla de notas</button></div>
    <div class="gradebook-summary"><span>${rows.length} estudiantes</span><span>${rows.length-pending} notas finales guardadas</span><span>${pending} pendientes</span></div>
    <div class="notice ${!editable?'warning-notice':''}">${icon(editable?'book':'lock')}<p>${editable?'Ingresa los puntajes de cada dimensión. La suma calcula la nota final automáticamente. Puedes guardar avances incompletos como borrador.':'El plazo de registro está cerrado. Puedes consultar y exportar las notas guardadas. Para modificarlas, solicita una reapertura al administrador.'}<br><strong>Plazo: ${dateTime(deadline)}</strong></p></div>
    <form id="grade-form"><div class="table-wrap"><table class="dimension-table"><thead><tr><th>APELLIDOS Y NOMBRES<small>Orden alfabético según el nombre registrado</small></th>${dims.map(([,label,max])=>`<th>${label.toUpperCase()}<small>0 a ${max} pts</small></th>`).join('')}<th>NOTA FINAL<small>Aprobación desde 61</small></th></tr></thead><tbody>${rows.map(row=>{
      const legacy=row.grade!==null && dims.every(([key])=>row[key]===null);
      return `<tr data-enrollment="${row.id}"><td><strong>${esc(row.student)}</strong><small class="cell-sub">CI ${esc(row.ci)}</small>${legacy?`<span class="legacy-label">Nota anterior: ${row.grade}. Sin desglose registrado.</span>`:''}</td>${dims.map(([key,label,max])=>`<td><input type="number" min="0" max="${max}" step="0.01" inputmode="decimal" name="${row.id}-${key}" data-dimension="${key}" value="${row[key]??''}" aria-label="${label} de ${esc(row.student)}" placeholder="—" ${!editable?'disabled':''}></td>`).join('')}<td class="computed-cell"></td></tr>`;
    }).join('')||'<tr><td colspan="5">No hay estudiantes inscritos en esta materia.</td></tr>'}</tbody></table></div>
    <div class="gradebook-unsaved" role="status"></div><p class="form-error" role="alert"></p>
    ${editable&&rows.length?`<div class="gradebook-footer"><p>Los espacios vacíos son notas pendientes. Completa las tres dimensiones para obtener una nota final de 1 a 100. Los cambios quedan registrados.</p><button class="btn primary" id="save-grades">${icon('check')} Guardar calificaciones</button></div>`:''}</form>`,'Planilla de evaluación · Saber 40 + Hacer 40 + Ser 20 = 100 puntos');
  const dialog=$('#modal');dialog.classList.add('gradebook-modal');
  const form=$('#grade-form');
  const original=new Map(rows.map(row=>[row.id,Object.fromEntries(dims.map(([key])=>[key,row[key]]))]));
  function valuesFor(row){return Object.fromEntries(dims.map(([key])=>{const input=form.elements[`${row.id}-${key}`];return [key,input.value===''?null:input.valueAsNumber];}));}
  function changed(row){const values=valuesFor(row);return dims.some(([key])=>!Object.is(values[key],original.get(row.id)[key]));}
  const isDirty=()=>rows.some(changed);
  function update(row) {
    const tr=form.querySelector(`[data-enrollment="${row.id}"]`),v=valuesFor(row);
    const complete=dims.every(([key])=>v[key]!==null && Number.isFinite(v[key]));
    const invalid=dims.some(([key,,max])=>v[key]!==null && (!Number.isFinite(v[key])||v[key]<0||v[key]>max));
    const legacy=row.grade!==null && dims.every(([key])=>original.get(row.id)[key]===null);
    const grade=complete?Math.round(dims.reduce((n,[key])=>n+v[key],0)*100)/100:legacy&&!changed(row)?row.grade:null;
    const valid=grade!==null&&grade>=1&&grade<=100&&!invalid;
    const cell=tr.querySelector('.computed-cell');
    cell.innerHTML=`<span class="computed-grade">${valid?grade:'—'} <small>/ 100</small></span>${invalid||grade===0?badge('Revisar puntajes','warning'):!valid?badge('Pendiente','warning'):badge(grade>=61?'Aprobado':'Reprobado',grade>=61?'success':'danger')}`;
    tr.classList.toggle('is-failed',valid&&grade<61);
    $('.gradebook-unsaved').textContent=isDirty()?'Hay cambios sin guardar. Guarda las calificaciones antes de generar la planilla.':'';
  }
  rows.forEach(row=>{update(row);form.querySelectorAll(`[data-enrollment="${row.id}"] input`).forEach(input=>input.addEventListener('input',()=>update(row)));});
  function close(){if(!isDirty()||window.confirm('Hay notas sin guardar. ¿Quieres cerrar y descartar esos cambios?'))dialog.close();}
  dialog.querySelector('.modal-close').onclick=close;
  dialog.oncancel=e=>{e.preventDefault();close();};
  $('#generate-sheet').onclick=()=>{
    if(isDirty()){form.querySelector('.form-error').textContent='Guarda primero las calificaciones para que la planilla use las notas actualizadas.';return;}
    openReport(id,ctx);
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    const grades=rows.filter(changed).map(row=>({id:row.id,...valuesFor(row)}));
    if(!grades.length){toast('No hay cambios pendientes para guardar.');return;}
    const button=$('#save-grades');button.disabled=true;$('#generate-sheet').disabled=true;
    try {
      await api('grades',{offering_id:id,grades});
      const nextData=await ctx.refresh();
      openGradebook(id,{...ctx,data:nextData});
      toast('Calificaciones guardadas. La planilla usará estos registros.');
    } catch(error){form.querySelector('.form-error').textContent=error.message;button.disabled=false;$('#generate-sheet').disabled=false;}
  };
}

export async function openReport(id,ctx) {
  try {
    const report=await ctx.api(`reports/${id}`);
    const {modal,icon,escape:esc}=ctx;
    const ready=report.rows.length>0 && report.pending===0 && !report.needs_review;
    modal('Planilla de notas',`<div class="planilla-actions"><div><strong>${esc(report.offering.career)}</strong><br>${report.rows.length} estudiantes · Tamaño carta · ${report.needs_review?`${report.needs_review} notas por revisar`:ready?'Notas finales completas':`${report.pending} notas pendientes`}</div><div class="heading-actions"><button class="btn secondary" id="back-to-grades">${icon('book')} Ver notas</button><button class="btn primary" id="download-pdf" ${!ready?'disabled':''}>${icon('download')} PDF</button><button class="btn secondary" id="download-excel" ${!ready?'disabled':''}>${icon('download')} Excel</button></div></div><div class="planilla-excel-note">${ready?'La planilla usa únicamente notas guardadas. El Excel es editable; sus cambios no modifican el sistema.':'Vista previa de borrador. Completa y guarda las notas de todos los estudiantes para descargar el PDF o Excel final.'}${report.needs_review?' Hay puntajes de la escala anterior fuera de los límites 40/40/20. Se conservaron sin cambios; revísalos en la tabla para habilitar la exportación.':''}${report.legacy?' Hay notas anteriores sin desglose; sus totales originales se conservan.':''}</div><p class="form-error report-error" role="alert"></p><div class="sheet-scroll">${planillaHTML(report)}</div>`,'Por carrera y materia · Documento preparado para impresión y firma');
    $('#modal').classList.add('planilla-modal');
    $('#back-to-grades').onclick=()=>openGradebook(id,ctx);
    for(const [buttonId,format] of [['download-pdf','pdf'],['download-excel','xlsx']]) {
      $('#'+buttonId).onclick=async event=>{
        const button=event.currentTarget;button.disabled=true;
        try {
          const response=await fetch(`/api/reports/${id}?format=${format}`);
          if(!response.ok) {const body=await response.json();throw new Error(body.error||'No se pudo generar el archivo.');}
          const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
          link.href=url;link.download=response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||`planilla-ceicom.${format}`;
          document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
          ctx.toast(`${format==='pdf'?'PDF':'Excel'} generado correctamente.`);
        } catch(error){$('.report-error').textContent=error.message;}
        finally{button.disabled=false;}
      };
    }
  } catch(error){ctx.toast(error.message,true);}
}
