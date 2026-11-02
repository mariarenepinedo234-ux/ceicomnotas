import {academicUpper,uppercaseAcademicData} from './public/academic-text.js';
import {readFileSync} from 'node:fs';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { dimensions } from './lib.js';

const logo=readFileSync(new URL('./public/assets/ceicom-logo.png',import.meta.url));
const WINE='#72283f', INK='#302a30', LINE='#bdb3b8', BLUE='#e7f0f3', CREAM='#f5ecdd';
const widths=[27,244,47,47,47,48,68];
const levelName={1:'PRIMERO',2:'SEGUNDO',3:'TERCERO'};
export const statusFor=grade=>grade===null?'PENDIENTE':grade>=61?'APROBADO':'REPROBADO';
export async function reportData(db,id) {
  return db.transaction(async()=>{
  const offering=(await db.prepare(`SELECT o.*,s.name subject,s.code subject_code,s.level,c.name career,m.name module,m.start_date,m.end_date,y.name AS "year",sh.name shift,u.name teacher
    FROM offerings o JOIN subjects s ON s.id=o.subject_id JOIN careers c ON c.id=s.career_id
    JOIN modules m ON m.id=o.module_id JOIN years y ON y.id=m.year_id
    JOIN shifts sh ON sh.id=o.shift_id JOIN users u ON u.id=o.teacher_id WHERE o.id=?`).get(id));
  if(!offering) return null;
  const rows=(await db.prepare('SELECT e.id,u.name student,u.ci,e.saber,e.hacer,e.ser,e.grade FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.offering_id=?').all(id))
    .sort((a,b)=>a.student.localeCompare(b.student,'es',{sensitivity:'base'})||a.ci.localeCompare(b.ci))
    .map((row,index)=>({...row,number:index+1,status:statusFor(row.grade)}));
  return uppercaseAcademicData({offering:{...offering,course:levelName[offering.level]},rows,pending:rows.filter(r=>r.grade===null).length,
    legacy:rows.filter(r=>r.grade!==null && [r.saber,r.hacer,r.ser].some(v=>v===null)).length,
    needs_review:rows.filter(r=>dimensions.some(d=>r[d.key]!==null && (r[d.key]<0 || r[d.key]>d.max))).length,
    generated_at:new Date().toISOString()});
  },{isolation:'REPEATABLE READ'});
}
export function reportFilename(report,extension) {
  const text=`planilla-${report.offering.career}-${report.offering.subject}-${report.offering.year}-${report.offering.module}-${report.offering.shift}`;
  return (report.draft?'borrador-':'')+text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-]+/g,'-').slice(0,170)+'.'+extension;
}
const dateLabel=iso=>new Intl.DateTimeFormat('es-BO',{day:'numeric',month:'long',year:'numeric',timeZone:'America/La_Paz'}).format(new Date(iso));

export function renderPdf(report) {
  report=uppercaseAcademicData(report);
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'LETTER',margins:{top:42,right:42,bottom:20,left:42},info:{Title:'Planilla de notas · Ceicom',Author:'Instituto Tecnológico Ceicom',Subject:report.offering.subject},autoFirstPage:false});
    const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    try {
      const pages=[];let chunk=[],height=0;
      doc.font('Helvetica').fontSize(7.5);
      for(const row of report.rows) {
        const rowHeight=Math.max(18,doc.heightOfString(row.student.toLocaleUpperCase('es'),{width:widths[1]-12})+8);
        if(chunk.length===20 || height+rowHeight>360) {pages.push(chunk);chunk=[];height=0;}
        chunk.push({...row,height:rowHeight});height+=rowHeight;
      }
      if(chunk.length||!pages.length)pages.push(chunk);
      pages.forEach((rows,pageIndex)=>{
        doc.addPage();
        const o=report.offering;
        doc.image(logo,43,23,{fit:[64,82]});
        doc.font('Helvetica').fontSize(8).fillColor(INK).text('INSTITUTO TECNOLÓGICO',310,36,{width:260,align:'right'});
        doc.font('Helvetica-Bold').fontSize(23).fillColor(WINE).text('CEICOM',310,50,{width:260,align:'right'});
        doc.font('Helvetica').fontSize(12).fillColor(INK).text(o.year,310,78,{width:260,align:'right'});
        doc.moveTo(42,104).lineTo(570,104).strokeColor('#d8c7cf').lineWidth(.7).stroke();
        doc.font('Helvetica-Bold').fontSize(16).fillColor(WINE).text('PLANILLA DE NOTAS',42,116,{width:528,align:'center'});
        doc.font('Helvetica-Oblique').fontSize(8).fillColor('#8f8089').text(academicUpper(`Elaborado el ${dateLabel(report.generated_at)}`),42,137,{width:528,align:'center'});
        if(report.draft)doc.font('Helvetica-Bold').fontSize(7).fillColor('#96753f').text('BORRADOR · NOTAS PENDIENTES / DOCUMENTO PARA REVISIÓN',42,149,{width:528,align:'center'});
        const meta=(label,value,y,width=450)=>{doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(label,43,y,{width:65});doc.font('Helvetica').fontSize(8).text(value,108,y,{width});};
        meta('CARRERA:',o.career.toLocaleUpperCase('es'),160);
        meta('MATERIA:',`${o.subject}${o.subject_code?' ('+o.subject_code+')':''}`.toLocaleUpperCase('es'),186);
        meta('CURSO:',o.course,204,130);
        doc.font('Helvetica-Bold').text('TURNO:',270,204,{width:45});doc.font('Helvetica').text(o.shift,315,204,{width:245});
        meta('PERÍODO:',`${o.module} · GESTIÓN ${o.year}`,220);
        const x=[42];widths.forEach(w=>x.push(x.at(-1)+w));let y=241;
        const cell=(col,top,w,h,text,fill=BLUE,font='Helvetica-Bold',size=7,align='center',color=INK)=>{
          doc.rect(col,top,w,h).fillAndStroke(fill,LINE);
          doc.font(font).fontSize(size).fillColor(color);
          const textHeight=doc.heightOfString(String(text),{width:w-8,align});
          doc.text(String(text),col+4,top+Math.max(4,(h-textHeight)/2),{width:w-8,align,lineGap:1});
        };
        cell(x[0],y,widths[0],48,'Nº');cell(x[1],y,widths[1],48,'APELLIDOS Y NOMBRES');
        cell(x[2],y,widths[2]+widths[3]+widths[4],17,'DIMENSIONES',CREAM);
        ['SABER\n40 PTS','HACER\n40 PTS','SER\n20 PTS'].forEach((t,i)=>cell(x[i+2],y+17,widths[i+2],31,t,i===0?'#f8eee3':BLUE));
        cell(x[5],y,widths[5],48,'NOTA\nFINAL');cell(x[6],y,widths[6],48,'OBSERVACIÓN');y+=48;
        let rendered=0;
        for(const row of rows){
          const failed=row.grade!==null && row.grade<61;
          const cells=[row.number,row.student.toLocaleUpperCase('es'),row.saber??'—',row.hacer??'—',row.ser??'—',row.grade??'—',row.status];
          cells.forEach((v,i)=>cell(x[i],y,widths[i],row.height,v,failed?'#fbe8eb':i===2?'#fcf5ed':i===3||i===4?'#f0f6f8':'#ffffff',i===1?'Helvetica':'Helvetica-Bold',i===6?6.5:7.5,i===1?'left':'center',failed?'#b22740':INK));
          y+=row.height;rendered++;
        }
        while(rendered<20 && y+18<=650){[pageIndex*20+rendered+1,'','','','','',''].forEach((v,i)=>cell(x[i],y,widths[i],18,v,'#fff','Helvetica',7));y+=18;rendered++;}
        doc.font('Helvetica').fontSize(7).fillColor('#8f8089').text('ESCALA: 1 A 100 PUNTOS · APROBACIÓN DESDE 61 · ROJO: ESTUDIANTE REPROBADO',43,Math.max(y+11,661),{width:528});
        if(report.legacy)doc.fontSize(6.5).text('—: DESGLOSE NO REGISTRADO EN NOTAS ANTERIORES. LA NOTA FINAL ORIGINAL SE CONSERVA.',43,676,{width:528});
        doc.moveTo(49,717).lineTo(267,717).moveTo(345,717).lineTo(563,717).strokeColor(INK).lineWidth(.5).stroke();
        doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(o.teacher.toLocaleUpperCase('es'),49,725,{width:218,align:'center'});
        doc.font('Helvetica').fontSize(7).text('DOCENTE',49,740,{width:218,align:'center'});
        doc.font('Helvetica-Bold').fontSize(8).text('DIRECCIÓN ACADÉMICA',345,725,{width:218,align:'center'});
        doc.font('Helvetica').fontSize(7).fillColor('#998b94').text(`CEICOM · REGISTRO ACADÉMICO · PLANILLA ${o.id}`,43,760,{width:390});
        doc.text(`PÁGINA ${pageIndex+1} DE ${pages.length}`,450,760,{width:120,align:'right'});
      });
      doc.end();
    } catch(error) {doc.destroy();reject(error);}
  });
}

export async function renderExcel(report){
  report=uppercaseAcademicData(report);
  const workbook=new ExcelJS.Workbook();workbook.creator='Instituto Tecnológico Ceicom';workbook.created=new Date(report.generated_at);
  const sheet=workbook.addWorksheet('PLANILLA DE NOTAS',{pageSetup:{paperSize:1,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,horizontalCentered:true,margins:{left:.4,right:.3,top:.2,bottom:.3,header:0,footer:.15},printTitlesRow:'1:14'},views:[{state:'frozen',ySplit:14,showGridLines:false}]});
  const o=report.offering;
  sheet.columns=[{width:2},{width:4},{width:12},{width:14},{width:14},{width:9},{width:9},{width:9},{width:9},{width:17}];
  const merge=(range,text,size=10,bold=false,align='left')=>{sheet.mergeCells(range);const cell=sheet.getCell(range.split(':')[0]);cell.value=text;cell.font={name:'Times New Roman',size,bold,color:{argb:'FF302A30'}};cell.alignment={horizontal:align,vertical:'middle',wrapText:true};};
  const image=workbook.addImage({buffer:logo,extension:'png'});sheet.addImage(image,{tl:{col:1,row:0},ext:{width:78,height:100}});
  for(let r=1;r<=6;r++)sheet.getRow(r).height=15;
  merge('F3:J3','INSTITUTO TECNOLÓGICO',11,true,'right');
  merge('H4:J4','CEICOM',18,true,'center');merge('H5:J5',o.year,14,true,'center');
  if(report.draft)merge('F6:J6','BORRADOR · PARA REVISIÓN',9,true,'right');
  merge('A7:J7','PLANILLA DE NOTAS',16,true,'center');sheet.getRow(7).height=23;
  merge('D8:J8',academicUpper(`Elaborado el ${dateLabel(report.generated_at)}`),10,false,'center');sheet.getRow(8).height=19;
  merge('B9:C9','CARRERA:',10,true);merge('D9:J9',o.career.toLocaleUpperCase('es'),10);sheet.getRow(9).height=27;
  merge('B10:C10','MATERIA:',10,true);merge('D10:J10',`${o.subject}${o.subject_code?' ('+o.subject_code+')':''}`.toLocaleUpperCase('es'),10);sheet.getRow(10).height=28;
  merge('B11:C11','CURSO:',10,true);merge('D11:E11',o.course,10);merge('F11:J11',`${o.module} · ${o.year} · ${o.shift}`,8,false,'right');sheet.getRow(11).height=20;
  merge('B12:B14','Nº',10,true,'center');merge('C12:E14','APELLIDOS Y NOMBRES',10,true,'center');merge('F12:H12','DIMENSIONES',10,true,'center');merge('I12:I14','NOTA FINAL',9,true,'center');merge('J12:J14','OBSERVACIONES',9,true,'center');
  sheet.getRow(12).height=17;sheet.getRow(13).height=45;sheet.getRow(14).height=18;
  ['SABER','HACER','SER'].forEach((name,i)=>{const cell=sheet.getCell(13,i+6);cell.value=name;cell.alignment={horizontal:'center',vertical:'middle',textRotation:90};sheet.getCell(14,i+6).value=[40,40,20][i]+' PTS';});
  for(let r=12;r<=14;r++)for(let c=2;c<=10;c++){
    const cell=sheet.getCell(r,c);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:r===12&&c>=6&&c<=8?'FFFFF2B3':'FFDAEEF3'}};
    cell.font={name:'Times New Roman',size:9,bold:true};cell.alignment={...cell.alignment,horizontal:'center',vertical:'middle',wrapText:true};
  }
  const count=Math.max(20,report.rows.length);
  for(let i=0;i<count;i++){
    const r=15+i,item=report.rows[i],row=sheet.getRow(r);row.height=item?Math.max(16,Math.ceil(item.student.length/45)*11+5):16;
    sheet.mergeCells(`C${r}:E${r}`);
    sheet.getCell(r,2).value=i+1;sheet.getCell(r,3).value=item?.student.toLocaleUpperCase('es')||'';
    for(let d=0;d<3;d++)sheet.getCell(r,d+6).value=item?.[['saber','hacer','ser'][d]]??null;
    if(item){
      const complete=[item.saber,item.hacer,item.ser].every(v=>v!==null);
      sheet.getCell(r,9).value=complete?{formula:`IF(COUNT(F${r}:H${r})=3,ROUND(SUM(F${r}:H${r}),2),"")`,result:item.grade}:item.grade;
      sheet.getCell(r,10).value={formula:`IF(ISNUMBER(I${r}),IF(I${r}>=61,"APROBADO","REPROBADO"),"PENDIENTE")`,result:item.status};
    }
    for(let c=2;c<=10;c++){
      const cell=sheet.getCell(r,c);cell.font={name:'Times New Roman',size:9,bold:c>=9};
      cell.alignment={horizontal:c>=3&&c<=5?'left':'center',vertical:'middle',wrapText:true};
      cell.numFmt=c>=6&&c<=9?'0.##':'General';cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:c===6?'FFFCE9D9':c===7?'FFDAEEF3':c===8?'FFE4DFEC':'FFFFFFFF'}};
    }
    for(let c=6;c<=8;c++)sheet.getCell(r,c).dataValidation={type:'decimal',operator:'between',allowBlank:true,formulae:[0,[40,40,20][c-6]],showErrorMessage:true,errorTitle:'Nota fuera de rango',error:`Ingresa de 0 a ${[40,40,20][c-6]} puntos.`};
    if((i+1)%20===0&&i+1<count)row.addPageBreak();
  }
  const last=14+count;
  for(let r=12;r<=last;r++)for(let c=2;c<=10;c++)sheet.getCell(r,c).border={top:{style:'thin',color:{argb:'FF858085'}},bottom:{style:'thin',color:{argb:'FF858085'}},left:{style:'thin',color:{argb:'FF858085'}},right:{style:'thin',color:{argb:'FF858085'}}};
  sheet.addConditionalFormatting({ref:`B15:J${last}`,rules:[{type:'expression',formulae:['AND(ISNUMBER($I15),$I15<61)'],priority:1,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFFBE8EB'},fgColor:{argb:'FFFBE8EB'}},font:{color:{argb:'FFB22740'}}}}]});
  const note=last+2;merge(`B${note}:J${note}`,'Escala 1–100 · Aprobación desde 61 · Rojo: estudiante reprobado.',8);sheet.getRow(note).height=15;
  merge(`B${note+1}:J${note+1}`,report.legacy?'—: nota anterior sin desglose; se conserva su total original.':'Excel editable: cambiar puntajes recalcula la nota final. No modifica el portal.',8);sheet.getRow(note+1).height=15;
  const signature=last+6;merge(`B${signature}:E${signature}`,o.teacher.toLocaleUpperCase('es'),9,true,'center');merge(`G${signature}:J${signature}`,'FIRMA DIRECCIÓN ACADÉMICA',9,true,'center');sheet.getRow(signature).height=25;
  for(const cell of [sheet.getCell(signature,2),sheet.getCell(signature,7)])cell.border={top:{style:'thin'}};
  sheet.pageSetup.printArea=`A1:J${signature+1}`;sheet.headerFooter.oddFooter=report.draft?'&LBORRADOR · Registro académico&RPÁGINA &P de &N':'&LCeicom · Registro académico&RPÁGINA &P de &N';
  sheet.eachRow(row=>row.eachCell(cell=>{if(typeof cell.value==='string')cell.value=academicUpper(cell.value);}));
  sheet.headerFooter.oddFooter=academicUpper(sheet.headerFooter.oddFooter);
  workbook.calcProperties.fullCalcOnLoad=true;return Buffer.from(await workbook.xlsx.writeBuffer());
}
