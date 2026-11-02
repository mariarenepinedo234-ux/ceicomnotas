export const academicUpper=value=>String(value??'').toLocaleUpperCase('es');
const nameFields=new Set(['name','student','subject','subject_code','career','teacher','shift','module','actor']);
// Convertir solo datos académicos; los CI, contraseñas y claves técnicas se conservan.
export function uppercaseAcademicData(value){
  if(Array.isArray(value))return value.map(uppercaseAcademicData);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,typeof item==='string'&&nameFields.has(key)?academicUpper(item):uppercaseAcademicData(item)]));
  return value;
}
export function bindUppercaseInputs(){
  const update=event=>{
    const field=event.target;
    if(event.isComposing||!field.matches?.('input[data-uppercase],textarea[data-uppercase]'))return;
    const original=field.value,next=academicUpper(original);if(next===original)return;
    const start=field.selectionStart,end=field.selectionEnd,direction=field.selectionDirection;
    field.value=next;
    if(start!==null)field.setSelectionRange(academicUpper(original.slice(0,start)).length,academicUpper(original.slice(0,end)).length,direction);
  };
  document.addEventListener('input',update);document.addEventListener('compositionend',update);
}
