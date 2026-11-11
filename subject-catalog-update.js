import {readFile} from 'node:fs/promises';
import {applyCatalog,keyOf} from './catalog.js';

export async function reviewedSubjectCatalog(){
  const catalog=JSON.parse(await readFile(new URL('./catalogs/ceicom-2026.json',import.meta.url),'utf8'));
  const seen=new Set();
  if(catalog.subjects.length!==235||catalog.careers.length!==9)throw new Error('El catálogo revisado está incompleto.');
  for(const subject of catalog.subjects){
    const identity=`${keyOf(subject.career)}|${subject.level}|${subject.code}`;
    if(seen.has(identity)||!catalog.careers.includes(subject.career)||![1,2,3].includes(subject.level)||typeof subject.name!=='string'||!subject.name.trim()||subject.name.length>160||!/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(subject.code))throw new Error('El catálogo revisado contiene una materia inválida.');
    seen.add(identity);
  }
  // El archivo publicado contiene únicamente carreras y materias, sin datos de personas.
  return {version:catalog.version,careers:catalog.careers,subjects:catalog.subjects,teachers:[]};
}
export async function updateReviewedSubjectCatalog(db,actorId=null){
  const catalog=await reviewedSubjectCatalog();
  const result=await applyCatalog(db,catalog,actorId);
  return {version:catalog.version,subjects_in_file:catalog.subjects.length,...result};
}
