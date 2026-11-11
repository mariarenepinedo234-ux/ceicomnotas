import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupSubjects,summarizeOfferings,prioritizeTeacherSubjects} from '../public/academic-summary.js';

const offerings=Array.from({length:5},(_,i)=>({id:i+1,subject_id:100+i,subject:i%2?' INFORMATICA   (POWER BI) ':'Informática (Power BI)',level:3,career_id:i+1,module_id:3,year_id:2026,teacher_id:8}));
offerings.push({id:6,subject_id:200,subject:'Diseño y Programación Web III',level:3,career_id:5,module_id:3,year_id:2026,teacher_id:8});
const sizes=[2,1,3,2,11,11];
const enrollments=[];let student=1;
for(let i=0;i<5;i++){for(let n=0;n<sizes[i];n++)enrollments.push({offering_id:i+1,student_id:student++,grade:null});}
for(let n=9;n<=19;n++)enrollments.push({offering_id:6,student_id:n,grade:null});

test('dos materias comunes a cinco carreras son seis grupos y conservan treinta notas pendientes',()=>{
  const summary=summarizeOfferings(offerings,enrollments);
  assert.equal(summary.subjectCount,2);assert.equal(summary.groupCount,6);assert.equal(summary.careerCount,5);
  assert.equal(summary.studentCount,19);assert.equal(summary.pending,30);assert.equal(summary.enrollmentCount,30);
  assert.deepEqual(summary.subjects.map(s=>s.groups.length).sort((a,b)=>a-b),[1,5]);
  assert.equal(summary.subjects.flatMap(s=>s.groups).length,6);
});
test('los filtros de módulo, gestión y carrera respetan materias, grupos y estudiantes del período',()=>{
  const more=[...offerings,{...offerings[0],id:7,module_id:4},{...offerings[0],id:8,year_id:2025}];
  const period=more.filter(o=>o.year_id===2026&&o.module_id===3);
  assert.equal(summarizeOfferings(period,enrollments).groupCount,6);
  const systems=summarizeOfferings(period.filter(o=>o.career_id===5),enrollments);
  assert.equal(systems.subjectCount,2);assert.equal(systems.groupCount,2);assert.equal(systems.studentCount,11);assert.equal(systems.pending,22);
  const empty=summarizeOfferings([],enrollments);assert.equal(empty.subjectCount,0);assert.equal(empty.pending,0);
});
test('el mismo nombre en años académicos distintos no se confunde; los grupos no se fusionan',()=>{
  const grouped=groupSubjects([...offerings,{...offerings[0],id:9,level:1}]);
  assert.equal(grouped.length,3);assert.equal(grouped.flatMap(s=>s.groups).length,7);
});


test('docente ve habilitadas primero y después módulos recientes, conservando grupos de fechas mixtas',()=>{
  const old={end_date:'2026-09-30',start_date:'2026-07-01'},current={end_date:'2026-12-18',start_date:'2026-10-05'};
  const groups=[
    {id:1,subject:'A WEB III',level:3,career_id:1,can_grade:false,...old},
    {id:2,subject:'Z SOFTWARE',level:3,career_id:1,can_grade:true,...current},
    {id:3,subject:'POWER BI',level:3,career_id:1,can_grade:false,...old},
    {id:4,subject:'POWER BI',level:3,career_id:2,can_grade:true,...current},
    {id:5,subject:'B CERRADA RECIENTE',level:3,career_id:1,can_grade:false,...current},
    {id:6,subject:'Z SOFTWARE',level:3,career_id:2,can_grade:true,end_date:'2026-11-15',start_date:'2026-10-01'},
  ];
  const subjects=groupSubjects(groups),before=structuredClone(subjects),ranked=prioritizeTeacherSubjects(subjects);
  assert.deepEqual(ranked.map(s=>s.name),['POWER BI','Z SOFTWARE','B CERRADA RECIENTE','A WEB III']);
  assert.deepEqual(ranked[0].groups.map(g=>g.id),[4,3]);assert.deepEqual(ranked[1].groups.map(g=>g.id),[2,6]);
  assert.deepEqual(subjects,before);assert.equal(ranked.flatMap(s=>s.groups).length,groups.length);
});

test('reaperturas habilitadas tienen prioridad sobre módulos cerrados más recientes; soporta fechas faltantes y filtros',()=>{
  const groups=[
    {id:1,subject:'NUEVA CERRADA',level:3,can_grade:false,end_date:'2026-12-18'},
    {id:2,subject:'ANTERIOR REABIERTA',level:3,can_grade:true,end_date:'2026-09-30'},
    {id:3,subject:'SIN FECHA',level:3,can_grade:false},
  ];
  assert.deepEqual(prioritizeTeacherSubjects(groupSubjects(groups)).map(s=>s.name),['ANTERIOR REABIERTA','NUEVA CERRADA','SIN FECHA']);
  assert.deepEqual(prioritizeTeacherSubjects(groupSubjects(groups.filter(g=>g.id===1))).map(s=>s.name),['NUEVA CERRADA']);
  assert.deepEqual(prioritizeTeacherSubjects([]),[]);
});
