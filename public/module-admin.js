export function moduleForm(ctx,module=null){
  const choices=[{id:'shared',name:'Calendario compartido'},...ctx.data.years.map(y=>({id:String(y.id),name:`Ingreso ${y.name}`}))];
  const selected=module?.admission_year_id==null?'shared':String(module.admission_year_id);
  ctx.formModal(module?'Editar trimestre / módulo':'Crear módulo',ctx.field('Nombre del módulo','name','text',module?.name||'')+ctx.select('Gestión cursada','year_id',ctx.data.years,'id','name',module?.year_id||'')+
    `<div class="full">${ctx.select('Calendario para ingreso','calendar_scope',choices,'id','name',selected)}</div>`+ctx.field('Fecha de inicio','start_date','date',module?.start_date||'')+ctx.field('Fecha de finalización','end_date','date',module?.end_date||''),module?'module-edit':'modules',module?{module_id:module.id}:{},'Cada calendario admite cuatro módulos. Elige el ingreso que tiene fechas propias; el calendario compartido conserva las fechas generales.');
  const form=document.querySelector('#dialog-form'),submit=form.onsubmit;
  const clearError=()=>form.querySelector('.form-error').textContent='';form.addEventListener('input',clearError);form.addEventListener('change',clearError);
  form.onsubmit=event=>{const value=form.elements.calendar_scope.value;let hidden=form.querySelector('[name=admission_year_id]');if(!hidden){hidden=document.createElement('input');hidden.type='hidden';hidden.name='admission_year_id';form.append(hidden);}hidden.value=value==='shared'?'':value;return submit(event);};
}
