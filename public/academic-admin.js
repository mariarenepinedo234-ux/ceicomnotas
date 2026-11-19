import {moduleForm} from './module-admin.js';
import {retakeOption} from './enrollment-rules.js';
import {studentPicker} from './student-picker.js';
const $=selector=>document.querySelector(selector);
export function editStudentForm(ctx,student){
  const {field,select,formModal,data,escape:esc}=ctx;
  const fields=field('Nombre completo','name','text',student.name,'maxlength="160"')+`<label>Carnet de identidad<input name="ci" value="${esc(student.ci||'')}" minlength="5" maxlength="40" placeholder="Puede quedar pendiente si aún no tiene CI"></label>`+
    select('Carrera actual','career_id',data.careers,'id','name',student.career_id)+select('Turno actual','shift_id',data.shifts,'id','name',student.shift_id)+select('Gestión de ingreso','admission_year_id',data.years,'id','name',student.admission_year_id)+select('Año académico actual','level',[{id:1,name:'1º año'},{id:2,name:'2º año'},{id:3,name:'3º año'}],'id','name',student.level)+select('Estado del nombre','name_pending',[{id:'false',name:'Nombre confirmado'},{id:'true',name:'Nombre por completar'}],'id','name',String(student.name_pending));
  formModal('Editar estudiante',fields,'student-edit',{student_id:student.user_id},'Las notas e inscripciones anteriores conservan su materia, carrera y turno. Corregir un CI existente cambia su usuario y conserva su contraseña; si la olvidó, usa Restablecer clave.');
}
export function resetPasswordForm(ctx,person,role='student'){
  const teacher=role==='teacher',label=teacher?'docente':'estudiante',formId=`reset-${role}-password`;
  if(!person.ci){ctx.toast(`Completa el CI del ${label} antes de restablecer su contraseña.`,true);return;}
  ctx.modal('Restablecer contraseña',`<p class="admin-context">${ctx.escape(person.name)}${teacher?` · CI ${ctx.escape(person.ci)}`:''}</p><p class="admin-description">Asigna una contraseña temporal y compártela con el ${label}. Se cerrarán sus sesiones y deberá cambiarla al ingresar.</p><form id="${formId}"><label>Nueva contraseña temporal<input type="password" name="password" minlength="8" maxlength="160" autocomplete="new-password" required></label><label>Repetir contraseña temporal<input type="password" name="repeat" minlength="8" maxlength="160" autocomplete="new-password" required></label><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="btn secondary cancel">Cancelar</button><button type="submit" class="btn primary">${teacher?'Restablecer contraseña':'Restablecer clave'}</button></div></form>`);
  const dialog=$('#modal'),form=$('#'+formId);form.querySelector('.cancel').onclick=()=>dialog.close();
  form.onsubmit=async event=>{event.preventDefault();if(form.elements.password.value!==form.elements.repeat.value){form.querySelector('.form-error').textContent='Las contraseñas no coinciden.';return;}const button=form.querySelector('[type=submit]');button.disabled=true;try{await ctx.api(`${role}-password-reset`,{[`${role}_id`]:teacher?person.id:person.user_id,password:form.elements.password.value});if(form.isConnected)dialog.close();ctx.toast(`Contraseña temporal guardada. El ${label} deberá cambiarla al ingresar.`);await ctx.refresh();}catch(error){if(form.isConnected)form.querySelector('.form-error').textContent=error.message;}finally{button.disabled=false;}};
}
export async function deleteEntityForm(ctx,type,targetId){
  const kind=type==='student'?'estudiante':'trimestre',phrase=type==='student'?'ELIMINAR ESTUDIANTE':'ELIMINAR TRIMESTRE';
  ctx.modal('Revisar eliminación',`<p id="deletion-review" role="status">Consultando los registros del ${kind}…</p>`);const marker=$('#deletion-review');
  try{
    const impact=await ctx.api(`academic-impact?type=${type}&id=${targetId}`);if(!marker.isConnected||!$('#modal').open)return;
    ctx.modal(`Eliminar ${kind}`,`<p class="admin-context">${ctx.escape(impact.title)}</p><p class="admin-description">${ctx.escape(impact.context)}</p><div class="deletion-impact"><span><strong>${impact.enrollments}</strong> inscripciones</span><span><strong>${impact.notes}</strong> registros con notas o borradores</span>${type==='module'?`<span><strong>${impact.offerings}</strong> asignaciones</span>`:''}</div><p class="admin-description">${type==='student'?'Se eliminará el estudiante y sus inscripciones de todas las gestiones, incluidas las notas indicadas.':'Se eliminará el trimestre junto con sus asignaciones, grupos e inscripciones, incluidas las notas indicadas. Se conservan las personas y el catálogo de materias.'} Esta acción no se puede deshacer desde el portal.</p><form id="delete-academic-form"><label>Escribe ${phrase} para confirmar<input name="confirm" data-uppercase autocomplete="off" spellcheck="false" required></label><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="btn secondary cancel">Cancelar</button><button type="submit" class="btn primary danger-action" disabled>Eliminar ${kind}</button></div></form>`);
    const dialog=$('#modal'),form=$('#delete-academic-form'),button=form.querySelector('[type=submit]');form.querySelector('.cancel').onclick=()=>dialog.close();form.elements.confirm.oninput=()=>{button.disabled=form.elements.confirm.value.trim().toLocaleUpperCase('es')!==phrase;};
    form.onsubmit=async event=>{event.preventDefault();button.disabled=true;try{await ctx.api(type==='student'?'student-delete':'module-delete',{[type==='student'?'student_id':'module_id']:targetId,revision:impact.revision,confirm:form.elements.confirm.value.trim()});if(form.isConnected)dialog.close();await ctx.refresh();ctx.toast(`${type==='student'?'Estudiante':'Trimestre'} eliminado.`);}catch(error){if(form.isConnected)form.querySelector('.form-error').textContent=error.message;button.disabled=false;}};
  }catch(error){if(marker.isConnected)marker.textContent=error.message;}
}
export function editModuleForm(ctx,module){moduleForm(ctx,module);}

export async function editRosterForm(ctx,offeringId){
  ctx.modal('Editar inscritos',`<p id="roster-review" role="status">Consultando la lista actual…</p>`);const marker=$('#roster-review');
  try{
    const review=await ctx.api('offering-roster?offering_id='+offeringId);if(!marker.isConnected||!$('#modal').open)return;
    ctx.modal('Editar inscritos',`<p class="admin-context">${ctx.escape(review.title)}</p><p class="admin-description">${ctx.escape(review.context)}</p><form id="edit-roster-form">${retakeOption()}<div class="student-picker"></div><label class="remove-notes-confirm" hidden><input type="checkbox" name="confirm_grades"><span></span></label><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="btn secondary cancel">Cancelar</button><button type="submit" class="btn primary">Guardar inscritos</button></div></form>`,'Marca estudiantes para agregarlos y desmarca para retirarlos. Las notas de quienes permanecen se conservan.');
    const dialog=$('#modal'),form=$('#edit-roster-form'),warning=form.querySelector('.remove-notes-confirm');let signature='';
    const picker=studentPicker(form.querySelector('.student-picker'),{escape:ctx.escape,candidates:()=>review.students.filter(s=>review.student_ids.includes(s.user_id)||!s.retake_candidate||form.elements.allow_retake.checked),initialIds:review.student_ids,onChange:selected=>{const removed=review.graded_student_ids.filter(id=>!selected.includes(id)),next=removed.join(',');if(next!==signature)form.elements.confirm_grades.checked=false;signature=next;warning.hidden=!removed.length;warning.querySelector('span').textContent=`Confirmo retirar a ${removed.length} estudiantes desmarcados junto con sus notas o borradores.`;}});
    form.elements.allow_retake.onchange=()=>picker.prune();
    form.querySelector('.cancel').onclick=()=>dialog.close();form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{const result=await ctx.api('offering-roster',{offering_id:offeringId,student_ids:picker.values(),allow_retake:form.elements.allow_retake.checked,revision:review.revision,confirm_grades:form.elements.confirm_grades.checked?'RETIRAR CON NOTAS':''});if(form.isConnected)dialog.close();await ctx.refresh();ctx.toast(`Lista actualizada: ${result.added} agregados y ${result.removed} retirados.`);}catch(error){if(form.isConnected)form.querySelector('.form-error').textContent=error.message;}finally{button.disabled=false;}};
  }catch(error){if(marker.isConnected)marker.textContent=error.message;}
}
export function bindAcademicAdmin(ctx){
  document.querySelectorAll('[data-reset-teacher]').forEach(button=>button.onclick=()=>resetPasswordForm(ctx,ctx.data.teachers.find(t=>t.id===Number(button.dataset.resetTeacher)),'teacher'));
  document.querySelectorAll('[data-reset-student]').forEach(button=>button.onclick=()=>resetPasswordForm(ctx,ctx.data.students.find(s=>s.user_id===Number(button.dataset.resetStudent))));
  document.querySelectorAll('[data-delete-student]').forEach(button=>button.onclick=()=>deleteEntityForm(ctx,'student',Number(button.dataset.deleteStudent)));
  document.querySelectorAll('[data-edit-module]').forEach(button=>button.onclick=()=>editModuleForm(ctx,ctx.data.modules.find(m=>m.id===Number(button.dataset.editModule))));
  document.querySelectorAll('[data-delete-module]').forEach(button=>button.onclick=()=>deleteEntityForm(ctx,'module',Number(button.dataset.deleteModule)));
  document.querySelectorAll('[data-edit-roster]').forEach(button=>button.onclick=()=>editRosterForm(ctx,Number(button.dataset.editRoster)));
}
