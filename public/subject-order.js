const collator=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
function codeNumber(code){const match=String(code||'').match(/(\d+)(?:\D*)$/);return match?Number(match[1]):Number.MAX_SAFE_INTEGER;}
export function compareSubjects(a,b){
  const career=a.career&&b.career?collator.compare(a.career,b.career):Number(a.career_id||0)-Number(b.career_id||0);
  if(career)return career;
  const level=Number(a.level)-Number(b.level);if(level)return level;
  const left=a.catalog_order??Number.MAX_SAFE_INTEGER,right=b.catalog_order??Number.MAX_SAFE_INTEGER;
  if(left!==right)return left-right;
  // Para materias añadidas fuera del Excel se usa la parte numérica del código.
  return codeNumber(a.code??a.subject_code)-codeNumber(b.code??b.subject_code)||collator.compare((a.code??a.subject_code)||'\uffff',(b.code??b.subject_code)||'\uffff')||Number(a.id)-Number(b.id);
}
