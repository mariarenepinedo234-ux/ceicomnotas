import {openGroupForm} from './roster-admin.js';
import {deleteEntityForm} from './academic-admin.js';
import {partActions,bindSubjectParts} from './subject-parts.js';
import {calendarLabel} from './module-calendar.js';
import {compareSubjects} from './subject-order.js';
import {groupSubjects} from './academic-summary.js';
export function mountModuleGroups(root,module,ctx,state){
  const {data,escape:esc,icon,badge,date}=ctx,groups=data.offerings.filter(o=>o.module_id===module.id),counts=new Map();
  for(const row of data.enrollments)counts.set(row.offering_id,(counts.get(row.offering_id)||0)+1);
  const countLabel=(count,singular,plural)=>`${count} ${count===1?singular:plural}`;
  root.innerHTML=`<div class="panel-heading"><div><span class="eyebrow">MATERIAS DEL MÓDULO</span><h2>${esc(module.name)}</h2><p>${esc(calendarLabel(module))} · ${esc(date(module.start_date))} al ${esc(date(module.end_date))} · Gestión ${esc(module.year)}</p><p>${countLabel(groupSubjects(groups).length,'materia','materias')} · ${countLabel(groups.length,'grupo','grupos')}</p></div><button type="button" class="icon-button" data-module-panel-close aria-label="Cerrar lista del módulo">${icon('close')}</button></div><div class="toolbar module-groups-toolbar"><label class="search-box">${icon('search')}<input id="module-group-search" aria-label="Buscar en este módulo" placeholder="Buscar materia, carrera, docente o turno…" value="${esc(state.search)}"></label><div class="heading-actions"><button type="button" class="btn secondary" data-module-new-offering>${icon('plus')} Asignar materia</button><button type="button" class="btn secondary" data-module-new-group>${icon('people')} Registrar grupo</button>${groups.length?`<button type="button" class="btn primary" data-module-enroll>${icon('students')} Inscribir estudiante</button>`:''}</div></div><p class="module-groups-count" role="status" aria-live="polite"></p><div class="module-groups-results"></div>`;
  const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
  function render(){
    const list=groups.filter(o=>normalize(o.subject+' '+(o.subject_code||'')+' '+o.career+' '+o.teacher+' '+o.shift).includes(normalize(state.search.trim()))),teachers=new Map();
    for(const offering of list){if(!teachers.has(offering.teacher_id))teachers.set(offering.teacher_id,{name:offering.teacher,groups:[]});teachers.get(offering.teacher_id).groups.push(offering);}
    root.querySelector('.module-groups-count').textContent=`${countLabel(list.length,'grupo','grupos')} con estos filtros.`;
    root.querySelector('.module-groups-results').innerHTML=[...teachers.values()].sort((a,b)=>a.name.localeCompare(b.name,'es')).map(teacher=>`<details class="teacher-assignment" open><summary><span class="assignment-teacher-info"><strong>${esc(teacher.name)}</strong><span>${countLabel(teacher.groups.length,'grupo','grupos')} · ${countLabel(groupSubjects(teacher.groups).length,'materia','materias')}</span></span>${icon('down','assignment-chevron')}</summary><div class="table-wrap"><table class="module-groups-table"><thead><tr><th>MATERIA / CARRERA</th><th>TURNO</th><th>INSCRITOS</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>${teacher.groups.sort(compareSubjects).map(o=>`<tr data-module-offering="${o.id}"><td><strong>${esc(o.subject)}</strong><small class="cell-sub">${esc(o.subject_code||'Sin código')} · ${esc(o.career)} · ${o.level}º año</small></td><td>${esc(o.shift)}</td><td>${counts.get(o.id)||0} ${(counts.get(o.id)||0)===1?'estudiante':'estudiantes'}</td><td>${badge(o.can_grade?'Notas habilitadas':'Plazo cerrado',o.can_grade?'success':'neutral')}</td><td><div class="row-actions module-enrollment-actions"><button type="button" class="btn secondary compact" data-module-register-group="${o.id}">Registrar grupo</button><button type="button" class="btn secondary compact" data-module-edit-roster="${o.id}">Inscribir / editar estudiantes</button><button type="button" class="btn secondary compact" data-module-enroll-one="${o.id}">Inscribir uno</button><button type="button" class="btn secondary compact" data-module-grade="${o.id}">Ver notas</button><button type="button" class="btn secondary compact" data-module-report="${o.id}">Planilla</button>${partActions(o)}<button type="button" class="btn secondary compact delete-offering-button" data-module-delete-offering="${o.id}">${icon('close')} Eliminar materia</button></div></td></tr>`).join('')}</tbody></table></div></details>`).join('')||`<p class="module-groups-empty">${groups.length?'No hay grupos con esta búsqueda.':'Todavía no hay materias asignadas en este módulo. Usa Asignar materia o Registrar grupo para comenzar.'}</p>`;
    bindSubjectParts(root,ctx);
  }
  root.querySelector('#module-group-search').oninput=event=>{state.search=event.target.value;render();};
  root.onclick=event=>{
    const button=event.target.closest('button');if(!button||!root.contains(button))return;
    if(button.hasAttribute('data-module-panel-close'))return ctx.close();
    if(button.hasAttribute('data-module-new-offering'))return ctx.offering(module.id);
    if(button.hasAttribute('data-module-new-group'))return ctx.group(module.id);
    if(button.hasAttribute('data-module-enroll'))return ctx.enroll({moduleId:module.id});
    if(button.dataset.moduleRegisterGroup&&groups.some(o=>o.id===Number(button.dataset.moduleRegisterGroup)))return openGroupForm(ctx,{offeringId:Number(button.dataset.moduleRegisterGroup)});
    if(button.dataset.moduleDeleteOffering&&groups.some(o=>o.id===Number(button.dataset.moduleDeleteOffering)))return deleteEntityForm(ctx,'offering',Number(button.dataset.moduleDeleteOffering));
    for(const [key,callback] of [['moduleEditRoster',ctx.roster],['moduleEnrollOne',id=>ctx.enroll({moduleId:module.id,offeringId:id})],['moduleGrade',ctx.grade],['moduleReport',ctx.report]])if(button.dataset[key]){const id=Number(button.dataset[key]);if(groups.some(o=>o.id===id))callback(id);return;}
  };
  render();
}
