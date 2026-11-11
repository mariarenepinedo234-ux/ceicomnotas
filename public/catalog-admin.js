import {compareSubjects} from './subject-order.js';
let filters={search:'',career:'',level:''};
const $=selector=>document.querySelector(selector);

export function catalogHTML(data,{escape:esc,icon,opts,badge}){
  const list=data.subjects.filter(s=>(!filters.career||String(s.career_id)===filters.career)&&(!filters.level||String(s.level)===filters.level)&&(s.name+' '+(s.code||'')+' '+s.career).toLowerCase().includes(filters.search.toLowerCase())).sort(compareSubjects);
  return `<section class="panel spaced" id="subject-catalog"><div class="panel-heading"><div><h2>Catálogo por carrera y año</h2><p>Códigos y materias por carrera y año. Edita o añade las que faltan.</p></div><span class="count-tag">${list.length} / ${data.subjects.length} registros</span></div><div class="toolbar"><label class="search-box">${icon('search')}<input id="catalog-search" aria-label="Buscar en catálogo" placeholder="Buscar por código o materia…" value="${esc(filters.search)}"></label><select id="catalog-career" aria-label="Carrera del catálogo"><option value="">Todas las carreras</option>${opts(data.careers,'id','name',filters.career)}</select><select id="catalog-level" aria-label="Año académico del catálogo"><option value="">Todos los años</option>${[1,2,3].map(n=>`<option value="${n}" ${filters.level===String(n)?'selected':''}>${n}º año</option>`).join('')}</select></div><div class="table-wrap"><table><thead><tr><th>CÓDIGO</th><th>MATERIA</th><th>CARRERA</th><th>AÑO</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>${list.map(s=>`<tr><td><strong>${esc(s.code||'Sin código')}</strong></td><td>${esc(s.name)}</td><td>${esc(s.career)}</td><td>${s.level}º</td><td>${badge(s.active?'Activa':'Inactiva',s.active?'success':'neutral')}</td><td><button class="btn secondary compact" data-edit-subject="${s.id}">Editar</button></td></tr>`).join('')||'<tr><td colspan="6">No hay materias con estos filtros. Puedes añadirlas con Crear materia.</td></tr>'}</tbody></table></div><div class="panel-foot">Las materias inactivas conservan sus notas y asignaciones anteriores.</div></section>`;
}
export function pendingTeachersHTML(data,{escape:esc}){
  const pending=(data.teacher_directory||[]).filter(t=>!t.user_id);
  if(!pending.length)return '';
  return `<section class="panel spaced"><div class="panel-heading"><div><h2>Docentes pendientes de CI</h2><p>Importados del Excel. Completa su carnet para habilitar el acceso.</p></div><span class="count-tag">${pending.length}</span></div><div class="table-wrap"><table><thead><tr><th>DOCENTE</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>${pending.map(t=>`<tr><td><strong>${esc(t.name)}</strong></td><td>Sin cuenta · CI pendiente</td><td><button class="btn secondary compact" data-activate-teacher="${t.id}">Completar CI y habilitar</button></td></tr>`).join('')}</tbody></table></div></section>`;
}
export function subjectForm(ctx,subject=null){
  if(!subject)return createSubjectForm(ctx);
  const {field,select,formModal,data}=ctx;
  const code=`<label>Código de materia<input name="code" value="${ctx.escape(subject?.code||'')}" maxlength="40" placeholder="Ej. PRG-104"></label>`;
  formModal(subject?'Editar materia':'Crear materia',field('Nombre de la materia','name','text',subject?.name||'')+code+
    select('Carrera','career_id',data.careers,'id','name',subject?.career_id||'')+
    select('Año académico','level',[{id:1,name:'1º año'},{id:2,name:'2º año'},{id:3,name:'3º año'}],'id','name',subject?.level||'')+
    (subject?select('Estado','active',[{id:'true',name:'Activa · disponible para asignar'},{id:'false',name:'Inactiva · conserva historial'}],'id','name',String(subject.active)):''),
    'subjects',subject?{id:subject.id}:{},subject?'Si tiene asignaciones, su carrera y año no se cambian. Puedes corregir nombre/código o desactivarla sin borrar su historial.':'Las materias comunes pueden registrarse en distintas carreras con el mismo código.');
}
function createSubjectForm(ctx){
  const {modal,field,select,data,escape:esc,icon}=ctx;
  modal('Crear materia',`<form id="create-subject-form"><div class="form-grid">${field('Nombre de la materia','name','text','','maxlength="160"')}
    <label>Código de materia (opcional)<input name="code" data-uppercase maxlength="40" placeholder="Ej. ORA-301"></label>
    ${select('Año académico','level',[{id:1,name:'1º año'},{id:2,name:'2º año'},{id:3,name:'3º año'}])}
    <fieldset class="subject-careers full"><legend>Carreras</legend><div class="subject-career-controls"><label><input type="checkbox" id="all-subject-careers"> Seleccionar todas</label><output id="subject-career-count" aria-live="polite">0 carreras seleccionadas</output></div>
    <div class="subject-career-list">${data.careers.map(c=>`<label><input type="checkbox" name="career_ids" value="${c.id}"><span>${esc(c.name)}</span></label>`).join('')||'<p>No hay carreras registradas. Crea una en Gestiones y módulos.</p>'}</div></fieldset>
    <p class="subject-career-help full">La materia se añadirá al año elegido en cada carrera marcada. Después podrás asignar docente, trimestre y turno, e inscribir a los estudiantes de la gestión de ingreso correspondiente.</p>
    </div><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="btn secondary cancel">Cancelar</button><button type="submit" class="btn primary">${icon('check')} Crear en carreras seleccionadas</button></div></form>`,
    'Registra una materia común, como ORATORIA o POWER BI, en varias carreras a la vez.');
  const dialog=$('#modal'),form=$('#create-subject-form'),all=$('#all-subject-careers'),boxes=[...form.querySelectorAll('[name=career_ids]')];
  function update(){const count=boxes.filter(box=>box.checked).length;all.checked=boxes.length>0&&count===boxes.length;all.indeterminate=count>0&&count<boxes.length;all.disabled=!boxes.length;if(count)form.querySelector('.form-error').textContent='';$('#subject-career-count').textContent=`${count} ${count===1?'carrera seleccionada':'carreras seleccionadas'}`;}
  all.onchange=()=>{boxes.forEach(box=>box.checked=all.checked);update();};boxes.forEach(box=>box.onchange=update);update();
  form.querySelector('.cancel').onclick=()=>dialog.close();
  form.onsubmit=async event=>{
    event.preventDefault();const values=new FormData(form),careerIds=values.getAll('career_ids').map(Number),error=form.querySelector('.form-error'),button=form.querySelector('[type=submit]');
    if(!careerIds.length){error.textContent='Selecciona al menos una carrera.';all.focus();return;}
    button.disabled=true;error.textContent='';
    try{
      const result=await ctx.api('subjects',{name:values.get('name'),code:values.get('code'),level:values.get('level'),career_ids:careerIds});
      if(form.isConnected)dialog.close();await ctx.refresh();
      ctx.toast(result.created?`Materia creada en ${result.created} ${result.created===1?'carrera':'carreras'}.${result.existing?` Ya existía en ${result.existing}; se conservó sin cambios.`:''}`:`La materia ya existía en las ${result.existing} carreras seleccionadas. No se crearon duplicados.`);
    }catch(err){if(form.isConnected)error.textContent=err.message;}finally{button.disabled=false;}
  };
}

export function bindCatalog(ctx){
  $('#catalog-search')?.addEventListener('input',e=>{filters.search=e.target.value;const selection=e.target.selectionStart;ctx.rerender();$('#catalog-search').focus();$('#catalog-search').setSelectionRange(selection,selection);});
  $('#catalog-career')?.addEventListener('change',e=>{filters.career=e.target.value;ctx.rerender();});
  $('#catalog-level')?.addEventListener('change',e=>{filters.level=e.target.value;ctx.rerender();});
  document.querySelectorAll('[data-edit-subject]').forEach(button=>button.onclick=()=>subjectForm(ctx,ctx.data.subjects.find(s=>s.id===Number(button.dataset.editSubject))));
  document.querySelectorAll('[data-activate-teacher]').forEach(button=>button.onclick=()=>{
    const teacher=ctx.data.teacher_directory.find(t=>t.id===Number(button.dataset.activateTeacher));
    ctx.formModal('Habilitar cuenta docente',ctx.field('Carnet de identidad (usuario inicial)','ci','text','','minlength="5" maxlength="40"'),'teacher-directory/activate',{directory_id:teacher.id},`${teacher.name}. El CI será la contraseña inicial y deberá cambiarla al ingresar.`);
  });
}
export function openCatalogImport(ctx){
  ctx.modal('Importar catálogo desde Excel',`<form id="catalog-upload"><div class="notice">${ctx.icon('book')}<p>Usa la planilla institucional con la hoja <strong>BASE DE DATOS</strong>. Se leerán carreras, materias por año, códigos y nombres de docentes. Las notas y estudiantes de ejemplo de las otras hojas no se importan.</p></div><label>Archivo Excel (.xlsx, hasta 2 MB)<input type="file" id="catalog-file" accept=".xlsx" required></label><p class="form-error" role="alert"></p><div class="form-actions"><button class="btn primary">${ctx.icon('file')} Revisar archivo</button></div></form>`,'Revisa el resumen antes de guardar. No se borran registros anteriores.');
  $('#catalog-upload').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),file=$('#catalog-file').files[0];
    if(!file||file.size>2*1024*1024){form.querySelector('.form-error').textContent='Selecciona un .xlsx de hasta 2 MB.';return;}
    button.disabled=true;
    try{
      const base64=await new Promise((accept,reject)=>{const reader=new FileReader();reader.onload=()=>accept(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('No se pudo leer el archivo.'));reader.readAsDataURL(file);});
      const preview=await ctx.api('catalog-excel/preview',{file:base64});showPreview(ctx,preview);
    }catch(error){form.querySelector('.form-error').textContent=error.message;button.disabled=false;}
  };
}
function showPreview(ctx,preview){
  const esc=ctx.escape;
  ctx.modal('Revisar catálogo del Excel',`<div class="gradebook-summary"><span>${preview.careers.length} carreras</span><span>${preview.subjects.length} materias con código</span><span>${preview.teachers.length} docentes</span></div><div class="notice"><p>Las coincidencias por código, carrera y año se actualizan. Se conservan las materias que no aparecen en el archivo. Los docentes sin CI quedan pendientes de habilitar; no se inventan carnets ni accesos.</p></div><div class="table-wrap"><table><thead><tr><th>CARRERA</th><th>1º AÑO</th><th>2º AÑO</th><th>3º AÑO</th></tr></thead><tbody>${preview.summary.map(c=>`<tr><td>${esc(c.name)}</td>${c.levels.map(l=>`<td>${l.count||'Pendiente'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${preview.missing.length?`<div class="notice warning-notice"><p><strong>Materias pendientes:</strong> ${preview.missing.map(esc).join(' · ')}. Puedes añadirlas después desde Crear materia.</p></div>`:''}${preview.warnings.length?`<div class="notice warning-notice"><p>${preview.warnings.map(esc).join('<br>')}</p></div>`:''}<details><summary>Ver docentes detectados (${preview.teachers.length})</summary><ul>${preview.teachers.map(name=>`<li>${esc(name)}</li>`).join('')}</ul></details><p class="form-error" id="catalog-error" role="alert"></p><div class="form-actions"><button class="btn secondary" id="catalog-cancel">Cancelar</button><button class="btn primary" id="catalog-apply">${ctx.icon('check')} Confirmar importación</button></div>`,'La vista previa vence en 15 minutos.');
  $('#catalog-cancel').onclick=()=>$('#modal').close();
  $('#catalog-apply').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{const result=await ctx.api('catalog-excel/apply',{token:preview.token});$('#modal').close();await ctx.refresh();ctx.toast(`Catálogo guardado: ${result.subjects_created} materias nuevas, ${result.subjects_updated} actualizadas y ${result.teachers_pending} docentes pendientes de CI.`);}
    catch(error){$('#catalog-error').textContent=error.message;button.disabled=false;}
  };
}
