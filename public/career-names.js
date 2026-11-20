export function careerNameFor(career,names=[],yearId){
  return names.find(n=>n.career_id===career.id&&String(n.year_id)===String(yearId))?.name??career.base_name??career.name;
}
export function applyCareerNames(data,yearId){
  if(!data?.careers)return;
  data.careers=data.careers.map(c=>({...c,base_name:c.base_name??c.name,name:careerNameFor(c,data.career_names,yearId)}));
  for(const s of data.subjects||[]){const career=data.careers.find(c=>c.id===s.career_id);if(career)s.career=career.name;}
}
