const key=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('es');
export function studentPicker(root,{escape:esc,candidates,initialIds=[],onChange=()=>{}}){
  let selected=new Set(initialIds);const existing=new Set(initialIds);
  root.innerHTML=`<div class="student-picker-heading"><strong>Seleccionar estudiantes registrados</strong><span class="picker-count" role="status"></span></div><div class="student-picker-controls"><input type="search" class="picker-search" aria-label="Buscar estudiante registrado" placeholder="Buscar por nombre o CI"><button type="button" class="btn secondary compact picker-all">Seleccionar visibles</button><button type="button" class="btn secondary compact picker-none">Desmarcar visibles</button></div><div class="student-picker-list"></div>`;
  const $=s=>root.querySelector(s);let visible=[];
  function render(){
    const all=candidates().slice().sort((a,b)=>a.name.localeCompare(b.name,'es')||a.user_id-b.user_id),search=key($('.picker-search').value);visible=all.filter(s=>key(s.name+' '+(s.ci||'')).includes(search));
    $('.student-picker-list').innerHTML=visible.map(s=>`<label class="student-option"><input type="checkbox" value="${s.user_id}" ${selected.has(s.user_id)?'checked':''}><span><strong>${esc(s.name)}</strong><small>${s.ci?'CI '+esc(s.ci):'CI pendiente · Registro '+s.user_id}${existing.has(s.user_id)?' · Inscrito actualmente':''}</small></span></label>`).join('')||'<p class="picker-empty">No hay estudiantes registrados con estos filtros. Revisa carrera, año, ingreso y turno.</p>';
    $('.picker-count').textContent=`${selected.size} seleccionados · ${visible.length} visibles`;
    root.querySelectorAll('[type=checkbox]').forEach(input=>input.onchange=()=>{const n=Number(input.value);if(input.checked)selected.add(n);else selected.delete(n);$('.picker-count').textContent=`${selected.size} seleccionados · ${visible.length} visibles`;onChange([...selected]);});
    onChange([...selected]);
  }
  $('.picker-search').oninput=render;$('.picker-all').onclick=()=>{visible.forEach(s=>selected.add(s.user_id));render();};$('.picker-none').onclick=()=>{visible.forEach(s=>selected.delete(s.user_id));render();};
  render();return {values:()=>[...selected],refresh:(clear=false)=>{if(clear)selected.clear();render();}};
}
