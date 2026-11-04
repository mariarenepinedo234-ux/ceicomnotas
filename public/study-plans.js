import {academicUpper} from './academic-text.js';

export function mountStudyPlans({container,user,data,api,modal,icon,escape:esc,toast,dateTime,heading}){
  const admin=user.role==='admin';let requestId=0,timer,plans=[];
  container.innerHTML=heading('DOCUMENTACIÓN ACADÉMICA','Planes de estudio',admin?'Publica los planes de avance en PDF para los docentes.':'Consulta y descarga los planes de avance de las materias.',admin?`<button class="btn primary" id="new-study-plan">${icon('plus')} Subir plan PDF</button>`:'')+`<section class="panel"><div class="toolbar plans-toolbar"><label class="search-box">${icon('search')}<input id="plan-search" maxlength="160" aria-label="Buscar planes" placeholder="Buscar por título, archivo o carrera…"></label><select id="plan-career" aria-label="Carrera de los planes"><option value="">Todas las carreras</option>${data.careers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><select id="plan-level" aria-label="Año académico de los planes"><option value="">Todos los años académicos</option>${[1,2,3].map(n=>`<option value="${n}">${n}º año</option>`).join('')}</select></div><div class="plans-count" role="status" aria-live="polite"></div></section><div class="plans-results"></div>`;
  const $=selector=>container.querySelector(selector);
  const size=bytes=>new Intl.NumberFormat('es-BO',{maximumFractionDigits:1}).format(bytes/(bytes<1024*1024?1024:1024*1024))+(bytes<1024*1024?' KB':' MB');
  async function load(){
    if(!container.isConnected)return;
    const version=++requestId,params=new URLSearchParams({search:$('#plan-search').value,career_id:$('#plan-career').value,level:$('#plan-level').value});
    $('.plans-count').textContent='Consultando planes…';
    try{
      const result=await api('study-plans?'+params);
      if(version!==requestId||!container.isConnected)return;
      plans=result.plans;$('.plans-count').textContent=`${plans.length} ${plans.length===1?'plan disponible':'planes disponibles'}`;
      if(!plans.length){$('.plans-results').innerHTML=`<div class="empty-state panel">${icon('file')}<strong>No hay planes con estos filtros</strong><p>${admin?'Puedes cambiar los filtros o subir un nuevo PDF.':'Cambia los filtros o consulta con administración.'}</p></div>`;return;}
      const groups=new Map();for(const plan of plans){const key=`${plan.career_id}-${plan.level}`;if(!groups.has(key))groups.set(key,{career:plan.career,level:plan.level,items:[]});groups.get(key).items.push(plan);}
      $('.plans-results').innerHTML=[...groups.values()].map(group=>`<section class="panel plans-group"><header class="plans-group-heading"><h2>${esc(group.career)}</h2><span>${group.level}º AÑO</span></header>${group.items.map(plan=>`<article class="plan-document"><span class="plan-document-icon">${icon('file')}</span><div class="plan-document-info"><h3>${esc(plan.title)}</h3><p>${esc(plan.original_name)} · ${size(plan.size_bytes)}</p><small>Publicado el ${esc(dateTime(plan.created_at))}</small></div><div class="plan-document-actions"><a class="btn secondary" href="${esc(plan.view_url)}" target="_blank" rel="noopener">${icon('book')} Ver PDF</a><a class="btn secondary" href="${esc(plan.download_url)}" download>${icon('download')} Descargar</a>${admin?`<button class="btn secondary plan-delete" data-delete-plan="${plan.id}">${icon('close')} Eliminar</button>`:''}</div></article>`).join('')}</section>`).join('');
      container.querySelectorAll('[data-delete-plan]').forEach(button=>button.onclick=()=>remove(plans.find(p=>p.id===Number(button.dataset.deletePlan))));
    }catch(error){if(version!==requestId||!container.isConnected)return;$('.plans-count').textContent='No se pudieron consultar los planes.';$('.plans-results').innerHTML=`<div class="panel plans-error"><p role="alert">${esc(error.message)}</p><button class="btn secondary" id="retry-plans">Reintentar</button></div>`;$('#retry-plans').onclick=load;}
  }
  function upload(){
    const career=$('#plan-career').value,level=$('#plan-level').value;
    modal('Subir plan de estudio',`<form id="study-plan-form"><div class="form-grid"><label class="full">Título del plan<input name="title" data-uppercase maxlength="160" required placeholder="Ej. PLAN DE AVANCE · PROGRAMACIÓN III"></label><label>Carrera<select name="career_id" required><option value="">Selecciona una carrera</option>${data.careers.map(c=>`<option value="${c.id}" ${String(c.id)===career?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Año académico<select name="level" required><option value="">Selecciona un año</option>${[1,2,3].map(n=>`<option value="${n}" ${String(n)===level?'selected':''}>${n}º año</option>`).join('')}</select></label><label class="full">Archivo PDF<input name="file" type="file" accept=".pdf,application/pdf" required><small class="muted">Un PDF por carga. Tamaño máximo: 20 MB.</small></label></div><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="btn secondary cancel">Cancelar</button><button type="submit" class="btn primary">${icon('check')} Publicar plan</button></div></form>`,'El documento estará disponible para los docentes.');
    const dialog=document.querySelector('#modal'),form=dialog.querySelector('#study-plan-form'),submit=form.querySelector('[type=submit]');
    form.querySelector('.cancel').onclick=()=>dialog.close();
    form.elements.file.onchange=()=>{const file=form.elements.file.files[0];if(file&&!form.elements.title.value)form.elements.title.value=academicUpper(file.name.replace(/\.pdf$/i,'').replace(/[_-]+/g,' ')).slice(0,160);};
    form.onsubmit=async event=>{
      event.preventDefault();const file=form.elements.file.files[0];
      if(!file||!file.name.toLowerCase().endsWith('.pdf')){form.querySelector('.form-error').textContent='Selecciona un archivo PDF.';return;}
      if(file.size>20*1024*1024){form.querySelector('.form-error').textContent='El PDF debe pesar como máximo 20 MB.';return;}
      submit.disabled=true;submit.textContent='Subiendo PDF…';form.querySelector('.form-error').textContent='';
      try{await api('study-plans/upload',new FormData(form));if(form.isConnected&&dialog.contains(form))dialog.close();toast('Plan de estudio publicado.');await load();}
      catch(error){if(form.isConnected)form.querySelector('.form-error').textContent=error.message;}
      finally{submit.disabled=false;submit.innerHTML=`${icon('check')} Publicar plan`;}
    };
  }
  function remove(plan){
    modal('Eliminar plan de estudio',`<p class="plan-delete-title">${esc(plan.title)}</p><p class="plan-delete-description">El PDF dejará de estar disponible para los docentes. Después puedes subir una versión actualizada.</p><p class="form-error" role="alert"></p><div class="form-actions"><button class="btn secondary cancel">Cancelar</button><button class="btn primary" id="confirm-delete-plan">Eliminar PDF</button></div>`);
    const dialog=document.querySelector('#modal'),button=dialog.querySelector('#confirm-delete-plan');dialog.querySelector('.cancel').onclick=()=>dialog.close();
    button.onclick=async()=>{button.disabled=true;try{await api(`study-plans/${plan.id}/delete`,{});if(button.isConnected&&dialog.contains(button))dialog.close();toast('Plan de estudio eliminado.');await load();}catch(error){if(button.isConnected)dialog.querySelector('.form-error').textContent=error.message;}finally{button.disabled=false;}};
  }
  $('#new-study-plan')?.addEventListener('click',upload);
  $('#plan-search').oninput=()=>{clearTimeout(timer);timer=setTimeout(load,200);};
  $('#plan-career').onchange=()=>{clearTimeout(timer);load();};$('#plan-level').onchange=()=>{clearTimeout(timer);load();};
  load();
}
