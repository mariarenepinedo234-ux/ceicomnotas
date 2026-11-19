export function moduleForAdmission(module,modules,admissionId){
  if(!module)return false;
  const scope=module.admission_year_id;
  if(scope!==null&&scope!==undefined)return Number(scope)===Number(admissionId);
  return !modules.some(m=>Number(m.year_id)===Number(module.year_id)&&m.admission_year_id!=null&&Number(m.admission_year_id)===Number(admissionId)&&m.start_date<=module.end_date&&m.end_date>=module.start_date);
}
export const calendarLabel=module=>(module.admission_year_id??module.module_admission_year_id)!=null?`Ingreso ${module.admission_year||module.module_admission_year||module.admission_year_id||module.module_admission_year_id}`:'Calendario compartido';
export const moduleLabel=module=>`${module.name} · ${calendarLabel(module)} · ${module.start_date} a ${module.end_date}`;
