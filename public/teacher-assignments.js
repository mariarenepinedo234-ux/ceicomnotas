import {compareSubjects} from './subject-order.js';

export function teacherAssignmentsHTML(offerings,ctx){
  const {escape:esc,icon,initials,groupSubjects,badge,dateTime,empty,openTeachers,expandMatches}=ctx;
  const teachers=new Map();
  for(const offering of offerings){
    if(!teachers.has(offering.teacher_id))teachers.set(offering.teacher_id,{id:offering.teacher_id,name:offering.teacher,groups:[]});
    teachers.get(offering.teacher_id).groups.push(offering);
  }
  return `<div class="teacher-assignments">${[...teachers.values()].sort((a,b)=>a.name.localeCompare(b.name,'es')).map(teacher=>{
    const groups=teacher.groups.sort(compareSubjects),subjects=groupSubjects(groups).length,careers=new Set(groups.map(o=>o.career_id)).size;
    return `<details class="teacher-assignment" data-assignment-teacher="${teacher.id}" ${expandMatches||openTeachers.has(teacher.id)?'open':''}>
      <summary><span class="avatar">${esc(initials(teacher.name))}</span><span class="assignment-teacher-info"><strong>${esc(teacher.name)}</strong><span>${subjects} ${subjects===1?'materia':'materias'} · ${groups.length} ${groups.length===1?'grupo':'grupos'} · ${careers} ${careers===1?'carrera':'carreras'}</span></span>${icon('down','assignment-chevron')}</summary>
      <div class="table-wrap"><table aria-label="Asignaciones de ${esc(teacher.name)}"><thead><tr><th>MATERIA / CARRERA</th><th>MÓDULO / GESTIÓN</th><th>TURNO</th><th>PLAZO DE NOTAS</th><th>ACCIÓN</th></tr></thead><tbody>${groups.map(o=>`<tr><td><strong>${esc(o.subject)}</strong><small class="cell-sub">${esc(o.career)} · ${o.level}º año</small></td><td>${esc(o.module)}<small class="cell-sub">Gestión ${esc(o.year)}</small></td><td>${esc(o.shift)}</td><td>${badge(o.can_grade?'Habilitado':'Cerrado',o.can_grade?'success':'neutral')}<small class="cell-sub">${dateTime(o.unlocked_until&&new Date(o.unlocked_until)>new Date(o.deadline)?o.unlocked_until:o.deadline)}</small></td><td><div class="row-actions"><button class="btn compact secondary" data-grade="${o.id}">Ver notas</button><button class="btn compact secondary" data-edit-roster="${o.id}">Editar inscritos</button><button class="icon-button" data-unlock="${o.id}" title="Reabrir plazo" aria-label="Reabrir plazo de ${esc(o.subject)}">${icon('lock')}</button></div></td></tr>`).join('')}</tbody></table></div>
    </details>`;
  }).join('')||empty(expandMatches?'No encontramos asignaciones con esta búsqueda':'No hay asignaciones en este período')}</div>`;
}

export function bindTeacherAssignments(openTeachers,{searching=false}={}){
  document.querySelectorAll('[data-assignment-teacher]').forEach(details=>{
    details.addEventListener('toggle',()=>{
      if(searching||!details.isConnected)return;
      const id=Number(details.dataset.assignmentTeacher);
      if(details.open)openTeachers.add(id);else openTeachers.delete(id);
    });
  });
}
