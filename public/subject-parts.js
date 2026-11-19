import {studentPicker} from './student-picker.js';
import {moduleLabel,moduleForAdmission,calendarLabel} from './module-calendar.js';
import {romanPart,summarizeSeries} from './part-summary.js';
const $=selector=>document.querySelector(selector);
export function partActions(o){
  const latest=!o.series_id||(!o.part_recovery&&o.part_number===o.part_count);
  return `${latest&&!o.series_complete?`<button type="button" class="btn secondary compact" data-continue-part="${o.id}">Continuar materia</button>`:''}${o.series_id?`<button type="button" class="btn secondary compact" data-recover-part="${o.id}">Recuperar parte</button>`:''}${o.series_id&&latest?`<button type="button" class="btn secondary compact" data-series-status="${o.id}">${o.series_complete?'Reabrir materia':'Concluir materia'}</button>`:''}`;
}
export function seriesSummaryHTML(series,{escape:esc,badge},title=''){
  return `<section class="series-summary" data-series-summary="${series.series_id}">${title?`<h3>${esc(title)}</h3>`:''}<p><strong>Promedio final: ${series.grade??'—'}</strong> ${badge(series.state==='approved'?'APROBADA':series.state==='failed'?'POR RECUPERAR':'PENDIENTE',series.state==='approved'?'success':series.state==='failed'?'danger':'warning')}</p><p>${esc(series.note)}</p><p class="muted">Todas las partes tienen el mismo peso. Cada una debe alcanzar 61 puntos. El promedio se redondea a dos decimales.</p><ul>${series.parts.map(part=>`<li><strong>${esc(part.label)}</strong><span>${part.grade??'—'} · ${part.state==='approved'?'APROBADA':part.state==='failed'?'POR RECUPERAR':part.state==='not_enrolled'?'SIN INSCRIPCIÓN':'NOTA PENDIENTE'}</span></li>`).join('')}</ul></section>`;
}
export function partsOverviewHTML(offerings,enrollments,ctx,visibleIds=offerings.map(o=>o.id)){
  const groups=new Map(),visible=new Set(visibleIds),visibleSeries=new Set(offerings.filter(o=>visible.has(o.id)).map(o=>o.series_id));
  for(const row of enrollments){const o=offerings.find(o=>o.id===row.offering_id);if(!o?.series_id||!visibleSeries.has(o.series_id))continue;if(!groups.has(o.series_id))groups.set(o.series_id,{title:o.subject_base,rows:[]});groups.get(o.series_id).rows.push({...o,...row,enrollment_id:row.id});}
  return [...groups.values()].map(group=>seriesSummaryHTML(summarizeSeries(group.rows),ctx,group.title+' · TODAS LAS GESTIONES')).join('');
}
export function openPartForm(ctx,sourceId,mode='continue',options={}){
  const {data,escape:esc,select}=ctx,source=data.offerings.find(o=>o.id===sourceId);if(!source)return;
  const records=data.enrollments.filter(e=>e.offering_id===sourceId),people=data.students.filter(s=>records.some(e=>e.student_id===s.user_id));
  const next=mode==='recover'?source.part_number:(source.part_count||1)+1;
  const destination=moduleId=>data.offerings.find(o=>o.subject_id===source.subject_id&&o.shift_id===source.shift_id&&String(o.module_id)===String(moduleId));
  const modules=data.modules.filter(m=>{const existing=destination(m.id);return m.start_date>source.end_date&&(!existing||mode==='continue'&&!existing.series_id);});
  ctx.modal(mode==='recover'?'Recuperar parte':'Continuar materia',`<p class="admin-context">${esc(source.subject_base||source.subject)} · PARTE ${romanPart(next)}${mode==='recover'?' · RECUPERACIÓN':''}</p><p class="admin-description">${esc(source.career)} · ${esc(source.shift)}. ${source.series_id?'Se conserva la relación con las partes anteriores.':'La asignación de origen se convertirá en PARTE I conservando sus notas.'} Puedes crear una lista nueva o vincular una asignación independiente ya registrada en un trimestre posterior.</p><form id="subject-part-form">${select('Trimestre de destino','module_id',modules.map(m=>({...m,label:`${destination(m.id)?'VINCULAR EXISTENTE · ':''}${moduleLabel(m)} · Gestión ${m.year}`})),'id','label',options.moduleId||'')}${select('Docente','teacher_id',data.teachers,'id','name',options.teacherId||source.teacher_id)}<div class="part-existing-notice" role="status" hidden></div><p class="part-calendar-notice" role="status"></p><div class="student-picker"></div><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="btn secondary cancel">Cancelar</button><button type="submit" class="btn primary" ${modules.length?'':'disabled'}>${mode==='recover'?'Crear recuperación':'Crear continuación'}</button></div></form>`, 'Las partes se vinculan explícitamente; repetir Nueva asignación crea grupos independientes');
  const form=$('#subject-part-form'),dialog=$('#modal'),pickerRoot=form.querySelector('.student-picker'),existingNotice=form.querySelector('.part-existing-notice'),button=form.querySelector('[type=submit]');dialog.classList.add('subject-part-modal');
  const compatible=()=>{const module=modules.find(m=>String(m.id)===form.elements.module_id.value);return module?people.filter(s=>s.career_id===source.career_id&&s.shift_id===source.shift_id&&s.level>=source.level&&(s.level>source.level||moduleForAdmission(module,data.modules,s.admission_year_id))):people;};
  const picker=studentPicker(pickerRoot,{escape:esc,candidates:compatible,initialIds:people.filter(s=>mode!=='recover'||records.some(e=>e.student_id===s.user_id&&(e.grade===null||e.grade<61))).map(s=>s.user_id)});
  function updateDestination(){
    const existing=destination(form.elements.module_id.value),linked=mode==='continue'&&!!existing;
    pickerRoot.hidden=linked;existingNotice.hidden=!linked;form.elements.teacher_id.disabled=linked;
    if(linked){
      const enrolled=data.enrollments.filter(e=>e.offering_id===existing.id),sourceIds=new Set(records.map(e=>e.student_id)),missing=enrolled.filter(e=>!sourceIds.has(e.student_id)).length;
      form.elements.teacher_id.value=String(existing.teacher_id);
      existingNotice.innerHTML=`<strong>Se vinculará la asignación existente como PARTE ${romanPart(next)}.</strong><p>${enrolled.length} estudiantes · ${enrolled.filter(e=>e.grade!==null).length} ${enrolled.filter(e=>e.grade!==null).length===1?'nota final guardada':'notas finales guardadas'} · Docente: ${esc(existing.teacher)}.</p><p>Se conservarán todos sus estudiantes, notas y docente. No se copiarán ni retirarán alumnos. Después puedes usar Editar inscritos para ajustar la lista.</p>${missing?`<p>${missing} estudiantes de destino no figuran en el grupo anterior; sus partes faltantes quedarán pendientes.</p>`:''}`;
      form.querySelector('.part-calendar-notice').textContent='La materia quedará en curso hasta concluirla y aprobar todas sus partes.';
      button.textContent=`Vincular como PARTE ${romanPart(next)}`;
    }else{
      if(form.elements.teacher_id.value==='')form.elements.teacher_id.value=String(options.teacherId||source.teacher_id);
      picker.prune();form.querySelector('.part-calendar-notice').textContent=modules.length?'La lista nueva empezará sin notas. Marca los estudiantes que continuarán y revisa el calendario de ingreso.':'Crea primero un trimestre posterior compatible. Los grupos que ya pertenecen a una materia por partes no se pueden volver a vincular.';
      button.textContent=mode==='recover'?'Crear recuperación':'Crear continuación';
    }
  }
  form.elements.module_id.onchange=updateDestination;updateDestination();
  form.querySelector('.cancel').onclick=()=>dialog.close();
  form.onsubmit=async event=>{event.preventDefault();button.disabled=true;const existing=destination(form.elements.module_id.value),linked=mode==='continue'&&!!existing;try{
    if(linked)await ctx.api('subject-parts/link',{offering_id:sourceId,target_offering_id:existing.id,expected_part_count:source.part_count||1});
    else await ctx.api('subject-parts',{offering_id:sourceId,mode,module_id:form.elements.module_id.value,teacher_id:form.elements.teacher_id.value,student_ids:picker.values()});
    if(form.isConnected)dialog.close();await ctx.refresh();ctx.toast(`PARTE ${romanPart(next)} ${linked?'vinculada':'creada'}. Notas anteriores conservadas.`);
  }catch(error){if(form.isConnected)form.querySelector('.form-error').textContent=error.message;}finally{button.disabled=false;}};
}
export function bindOfferingContinuationNotice(form,ctx,{teacherId=''}={}){
  const notice=document.createElement('div');notice.className='offering-continuation-notice';notice.setAttribute('role','status');notice.hidden=true;form.querySelector('.form-grid').after(notice);
  const {data,escape:esc}=ctx,button=form.querySelector('.primary');
  function update(){
    const subjectId=Number(form.elements.subject_id.value),shiftId=Number(form.elements.shift_id.value),module=data.modules.find(m=>String(m.id)===form.elements.module_id.value);
    const matches=data.offerings.filter(o=>o.subject_id===subjectId&&(!shiftId||o.shift_id===shiftId)).sort((a,b)=>b.end_date.localeCompare(a.end_date)||b.id-a.id);
    const duplicate=shiftId&&module&&matches.find(o=>o.module_id===module.id);
    button.disabled=form.elements.subject_id.disabled||!!duplicate;
    button.innerHTML=`${ctx.icon('check')} ${matches.length?'Guardar asignación independiente':'Guardar registro'}`;
    notice.hidden=!matches.length;if(!matches.length)return;
    const eligible=module&&shiftId?matches.filter(o=>o.shift_id===shiftId&&o.end_date<module.start_date&&!o.series_complete&&(!o.series_id||!o.part_recovery&&o.part_number===o.part_count)):[];
    notice.innerHTML=`<strong>Esta materia ya tiene asignaciones registradas.</strong><p>Repetir Nueva asignación crea un grupo independiente, sin PARTE I ni II. Para continuar el mismo grupo, usa Continuar materia.</p>${duplicate?'<p>Ya existe un grupo de esta materia y turno en el trimestre elegido. Puedes vincularlo como continuación de un grupo anterior.</p>':''}${eligible.length?`<label>Asignación anterior<select class="continuation-source">${eligible.map(o=>`<option value="${o.id}">${esc(o.subject)} · ${esc(o.module)} · Gestión ${esc(o.year)} · ${esc(calendarLabel(o))} · ${esc(o.shift)} · ${esc(o.teacher)}</option>`).join('')}</select></label><button type="button" class="btn secondary start-continuation">Continuar materia</button>`:`<p>${!module||!shiftId?'Elige módulo y turno para buscar una asignación anterior compatible.':'No hay una asignación anterior compatible con este destino. Si la materia está concluida, reábrela desde la lista de asignaciones.'}</p>`}`;
    notice.querySelector('.start-continuation')?.addEventListener('click',()=>openPartForm(ctx,Number(notice.querySelector('.continuation-source').value),'continue',{moduleId:module.id,teacherId:teacherId||form.elements.teacher_id?.value||''}));
  }
  for(const name of ['career_id','subject_id','module_id','shift_id'])form.elements[name].addEventListener('change',update);update();
}
export function openSeriesStatus(ctx,sourceId){
  const o=ctx.data.offerings.find(o=>o.id===sourceId);if(!o?.series_id)return;const complete=!o.series_complete;
  ctx.modal(complete?'Concluir materia':'Reabrir materia',`<p class="admin-context">${ctx.escape(o.subject_base)} · ${o.part_count} partes</p><p class="admin-description">${complete?'Esta es la última parte. El promedio final se calculará cuando el alumno tenga nota en todas las partes; solo aprobará si cada una alcanza 61 puntos. Podrás registrar recuperaciones sin repetir las partes aprobadas.':'La materia volverá a estar en curso y su promedio dejará de ser final hasta que la concluyas nuevamente. Podrás agregar una parte más. Las notas se conservan.'}</p><form id="series-status-form"><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="btn secondary cancel">Cancelar</button><button class="btn primary" type="submit">${complete?'Concluir materia':'Reabrir materia'}</button></div></form>`);
  const form=$('#series-status-form'),dialog=$('#modal');form.querySelector('.cancel').onclick=()=>dialog.close();
  form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{await ctx.api('subject-series/status',{series_id:o.series_id,part_count:o.part_count,completed:complete});if(form.isConnected)dialog.close();await ctx.refresh();ctx.toast(complete?'Materia concluida. Cada estudiante requiere aprobar todas las partes.':'Materia reabierta. Puedes crear otra parte.');}catch(error){if(form.isConnected)form.querySelector('.form-error').textContent=error.message;}finally{button.disabled=false;}};
}
export function bindSubjectParts(root,ctx){
  for(const [attr,callback] of [['data-continue-part',id=>openPartForm(ctx,id)],['data-recover-part',id=>openPartForm(ctx,id,'recover')],['data-series-status',id=>openSeriesStatus(ctx,id)]])root.querySelectorAll(`[${attr}]`).forEach(button=>button.onclick=()=>callback(Number(button.getAttribute(attr))));
}
