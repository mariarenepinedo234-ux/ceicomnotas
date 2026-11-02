import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { dimensions } from './lib.js';

const WINE='#72283f', INK='#302a30', LINE='#bdb3b8', BLUE='#e7f0f3', CREAM='#f5ecdd';
const widths=[27,244,47,47,47,48,68];
const levelName={1:'PRIMERO',2:'SEGUNDO',3:'TERCERO'};
export const statusFor=grade=>grade===null?'PENDIENTE':grade>=61?'APROBADO':'REPROBADO';
export async function reportData(db,id) {
  return db.transaction(async()=>{
  const offering=(await db.prepare(`SELECT o.*,s.name subject,s.level,c.name career,m.name module,m.start_date,m.end_date,y.name AS "year",sh.name shift,u.name teacher
    FROM offerings o JOIN subjects s ON s.id=o.subject_id JOIN careers c ON c.id=s.career_id
    JOIN modules m ON m.id=o.module_id JOIN years y ON y.id=m.year_id
    JOIN shifts sh ON sh.id=o.shift_id JOIN users u ON u.id=o.teacher_id WHERE o.id=?`).get(id));
  if(!offering) return null;
  const rows=(await db.prepare('SELECT e.id,u.name student,u.ci,e.saber,e.hacer,e.ser,e.grade FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.offering_id=?').all(id))
    .sort((a,b)=>a.student.localeCompare(b.student,'es',{sensitivity:'base'})||a.ci.localeCompare(b.ci))
    .map((row,index)=>({...row,number:index+1,status:statusFor(row.grade)}));
  return {offering:{...offering,course:levelName[offering.level]},rows,pending:rows.filter(r=>r.grade===null).length,
    legacy:rows.filter(r=>r.grade!==null && [r.saber,r.hacer,r.ser].some(v=>v===null)).length,
    needs_review:rows.filter(r=>dimensions.some(d=>r[d.key]!==null && (r[d.key]<0 || r[d.key]>d.max))).length,
    generated_at:new Date().toISOString()};
  },{isolation:'REPEATABLE READ'});
}
export function reportFilename(report,extension) {
  const text=`planilla-${report.offering.career}-${report.offering.subject}-${report.offering.year}-${report.offering.module}-${report.offering.shift}`;
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-]+/g,'-').slice(0,170)+'.'+extension;
}
const dateLabel=iso=>new Intl.DateTimeFormat('es-BO',{day:'numeric',month:'long',year:'numeric',timeZone:'America/La_Paz'}).format(new Date(iso));

export function renderPdf(report) {
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
        // Identidad provisional vectorial; no sustituye al escudo oficial del instituto.
        doc.roundedRect(43,34,45,53,9).lineWidth(1).strokeColor(WINE).stroke();
        doc.moveTo(50,48).lineTo(65.5,41).lineTo(81,48).lineTo(65.5,55).closePath().strokeColor(WINE).stroke();
        doc.moveTo(55,52).lineTo(55,63).quadraticCurveTo(65.5,72,76,63).lineTo(76,52).stroke();
        doc.font('Helvetica-Bold').fontSize(6).fillColor(WINE).text('CEICOM',47,74,{width:37,align:'center'});
        doc.font('Helvetica').fontSize(8).fillColor(INK).text('INSTITUTO TECNOLÓGICO',310,36,{width:260,align:'right'});
        doc.font('Helvetica-Bold').fontSize(23).fillColor(WINE).text('CEICOM',310,50,{width:260,align:'right'});
        doc.font('Helvetica').fontSize(12).fillColor(INK).text(o.year,310,78,{width:260,align:'right'});
        doc.moveTo(42,104).lineTo(570,104).strokeColor('#d8c7cf').lineWidth(.7).stroke();
        doc.font('Helvetica-Bold').fontSize(16).fillColor(WINE).text('PLANILLA DE NOTAS',42,116,{width:528,align:'center'});
        doc.font('Helvetica-Oblique').fontSize(8).fillColor('#8f8089').text(`Elaborado el ${dateLabel(report.generated_at)}`,42,137,{width:528,align:'center'});
        const meta=(label,value,y,width=450)=>{doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(label,43,y,{width:65});doc.font('Helvetica').fontSize(8).text(value,108,y,{width});};
        meta('CARRERA:',o.career.toLocaleUpperCase('es'),160);
        meta('MATERIA:',o.subject.toLocaleUpperCase('es'),186);
        meta('CURSO:',o.course,204,130);
        doc.font('Helvetica-Bold').text('TURNO:',270,204,{width:45});doc.font('Helvetica').text(o.shift,315,204,{width:245});
        meta('PERÍODO:',`${o.module} · Gestión ${o.year}`,220);
        const x=[42];widths.forEach(w=>x.push(x.at(-1)+w));let y=241;
        const cell=(col,top,w,h,text,fill=BLUE,font='Helvetica-Bold',size=7,align='center',color=INK)=>{
          doc.rect(col,top,w,h).fillAndStroke(fill,LINE);
          doc.font(font).fontSize(size).fillColor(color);
          const textHeight=doc.heightOfString(String(text),{width:w-8,align});
          doc.text(String(text),col+4,top+Math.max(4,(h-textHeight)/2),{width:w-8,align,lineGap:1});
        };
        cell(x[0],y,widths[0],48,'Nº');cell(x[1],y,widths[1],48,'APELLIDOS Y NOMBRES');
        cell(x[2],y,widths[2]+widths[3]+widths[4],17,'DIMENSIONES',CREAM);
        ['SABER\n40 pts','HACER\n40 pts','SER\n20 pts'].forEach((t,i)=>cell(x[i+2],y+17,widths[i+2],31,t,i===0?'#f8eee3':BLUE));
        cell(x[5],y,widths[5],48,'NOTA\nFINAL');cell(x[6],y,widths[6],48,'OBSERVACIÓN');y+=48;
        let rendered=0;
        for(const row of rows){
          const failed=row.grade!==null && row.grade<61;
          const cells=[row.number,row.student.toLocaleUpperCase('es'),row.saber??'—',row.hacer??'—',row.ser??'—',row.grade??'—',row.status];
          cells.forEach((v,i)=>cell(x[i],y,widths[i],row.height,v,failed?'#fbe8eb':i===2?'#fcf5ed':i===3||i===4?'#f0f6f8':'#ffffff',i===1?'Helvetica':'Helvetica-Bold',i===6?6.5:7.5,i===1?'left':'center',failed?'#b22740':INK));
          y+=row.height;rendered++;
        }
        while(rendered<20 && y+18<=650){[pageIndex*20+rendered+1,'','','','','',''].forEach((v,i)=>cell(x[i],y,widths[i],18,v,'#fff','Helvetica',7));y+=18;rendered++;}
        doc.font('Helvetica').fontSize(7).fillColor('#8f8089').text('Escala: 1 a 100 puntos · Aprobación desde 61 · Rojo: estudiante reprobado',43,Math.max(y+11,661),{width:528});
        if(report.legacy)doc.fontSize(6.5).text('—: desglose no registrado en notas anteriores. La nota final original se conserva.',43,676,{width:528});
        doc.moveTo(49,717).lineTo(267,717).moveTo(345,717).lineTo(563,717).strokeColor(INK).lineWidth(.5).stroke();
        doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(o.teacher.toLocaleUpperCase('es'),49,725,{width:218,align:'center'});
        doc.font('Helvetica').fontSize(7).text('DOCENTE',49,740,{width:218,align:'center'});
        doc.font('Helvetica-Bold').fontSize(8).text('DIRECCIÓN ACADÉMICA',345,725,{width:218,align:'center'});
        doc.font('Helvetica').fontSize(7).fillColor('#998b94').text(`Ceicom · Registro académico · Planilla ${o.id}`,43,760,{width:390});
        doc.text(`Página ${pageIndex+1} de ${pages.length}`,450,760,{width:120,align:'right'});
      });
      doc.end();
    } catch(error) {doc.destroy();reject(error);}
  });
}

export async function renderExcel(report) {
  const workbook=new ExcelJS.Workbook();workbook.creator='Instituto Tecnológico Ceicom';workbook.created=new Date(report.generated_at);
  const sheet=workbook.addWorksheet('Planilla de notas',{pageSetup:{paperSize:1,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.45,right:.45,top:.45,bottom:.45,header:.2,footer:.2},printTitlesRow:'1:10'},views:[{state:'frozen',ySplit:10}]});
  const o=report.offering;
  sheet.columns=[{width:5},{width:46},{width:10},{width:10},{width:10},{width:11},{width:20}];
  const merge=(range,text,size=10,bold=false)=>{sheet.mergeCells(range);const c=sheet.getCell(range.split(':')[0]);c.value=text;c.font={name:'Arial',size,bold,color:{argb:'FF302A30'}};c.alignment={vertical:'middle',wrapText:true};};
  merge('A1:G1','INSTITUTO TECNOLÓGICO CEICOM',16,true);sheet.getCell('A1').alignment={horizontal:'center',vertical:'middle'};sheet.getRow(1).height=30;
  merge('A2:G2',`PLANILLA DE NOTAS · GESTIÓN ${o.year}`,13,true);sheet.getCell('A2').alignment={horizontal:'center',vertical:'middle'};sheet.getRow(2).height=26;
  merge('A3:G3',`Elaborado el ${dateLabel(report.generated_at)}`,9);sheet.getCell('A3').alignment={horizontal:'center',vertical:'middle'};sheet.getRow(3).height=21;
  merge('A4:G4',`CARRERA: ${o.career.toLocaleUpperCase('es')}`,9,true);sheet.getRow(4).height=30;
  merge('A5:G5',`MATERIA: ${o.subject.toLocaleUpperCase('es')}`,9,true);sheet.getRow(5).height=28;
  merge('A6:G6',`CURSO: ${o.course}     TURNO: ${o.shift}     ${o.module} · ${o.year}`,9);sheet.getRow(6).height=22;
  merge('A7:G7',`DOCENTE: ${o.teacher}`,9);sheet.getRow(7).height=22;sheet.getRow(8).height=8;
  merge('A9:A10','Nº',9,true);merge('B9:B10','APELLIDOS Y NOMBRES',9,true);merge('C9:E9','DIMENSIONES',9,true);merge('F9:F10','NOTA FINAL',9,true);merge('G9:G10','OBSERVACIÓN',9,true);
  ['SABER (40 pts)','HACER (40 pts)','SER (20 pts)'].forEach((v,i)=>{sheet.getCell(10,i+3).value=v;});
  for(let r=9;r<=10;r++){sheet.getRow(r).height=25;for(let c=1;c<=7;c++){const cell=sheet.getCell(r,c);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:r===9&&c>=3&&c<=5?'FFF5ECDD':'FFE7F0F3'}};cell.font={name:'Arial',size:9,bold:true};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};}}
  const count=Math.max(20,report.rows.length);
  for(let i=0;i<count;i++) {
    const r=11+i,item=report.rows[i],row=sheet.getRow(r);row.height=item?Math.max(21,Math.ceil(item.student.length/40)*12+7):19;
    row.values=[i+1,item?.student.toLocaleUpperCase('es')||'',item?.saber??null,item?.hacer??null,item?.ser??null,null,null];
    if(item) {
      const complete=[item.saber,item.hacer,item.ser].every(v=>v!==null);
      if(complete)sheet.getCell(r,6).value={formula:`IF(COUNT(C${r}:E${r})=3,ROUND(SUM(C${r}:E${r}),2),"")`,result:item.grade};
      else if(item.grade!==null)sheet.getCell(r,6).value=item.grade;
      sheet.getCell(r,7).value={formula:`IF(ISNUMBER(F${r}),IF(F${r}>=61,"APROBADO","REPROBADO"),"PENDIENTE")`,result:item.status};
    }
    for(let c=1;c<=7;c++){const cell=sheet.getCell(r,c);cell.font={name:'Arial',size:9,bold:c>=6};cell.alignment={horizontal:c===2?'left':'center',vertical:'middle',wrapText:true};cell.numFmt=c>=3&&c<=6?'0.##':'General';cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:c===3?'FFFCF5ED':c===4||c===5?'FFF0F6F8':'FFFFFFFF'}};}
    for(let c=3;c<=5;c++)sheet.getCell(r,c).dataValidation={type:'decimal',operator:'between',allowBlank:true,formulae:[0,[40,40,20][c-3]],showErrorMessage:true,errorTitle:'Nota fuera de rango',error:`Ingresa de 0 a ${[40,40,20][c-3]} puntos.`};
  }
  const last=10+count;
  for(let r=9;r<=last;r++)for(let c=1;c<=7;c++)sheet.getCell(r,c).border={top:{style:'thin',color:{argb:'FFBDB3B8'}},bottom:{style:'thin',color:{argb:'FFBDB3B8'}},left:{style:'thin',color:{argb:'FFBDB3B8'}},right:{style:'thin',color:{argb:'FFBDB3B8'}}};
  // La regla se recalcula al editar: solo filas con nota numérica inferior a 61.
  sheet.addConditionalFormatting({ref:`A11:G${last}`,rules:[{type:'expression',formulae:['AND(ISNUMBER($F11),$F11<61)'],priority:1,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFFBE8EB'},fgColor:{argb:'FFFBE8EB'}},font:{color:{argb:'FFB22740'}}}}]});
  const note=last+2;
  merge(`A${note}:G${note}`,'Escala: 1 a 100 puntos. Aprobación desde 61. Rojo: estudiante reprobado.',8);sheet.getRow(note).height=19;
  merge(`A${note+1}:G${note+1}`,report.legacy?'Desglose vacío: nota final anterior sin detalle. No se han inventado puntajes por dimensión.':'Excel editable: al modificar Saber, Hacer o Ser se recalculan la nota final y el resultado.',8);sheet.getRow(note+1).height=25;
  merge(`A${note+2}:G${note+2}`,'Los cambios en este archivo no modifican el sistema académico.',8);sheet.getRow(note+2).height=18;
  const signature=note+5;
  merge(`A${signature}:D${signature}`,o.teacher.toLocaleUpperCase('es'),9,true);merge(`E${signature}:G${signature}`,'DIRECCIÓN ACADÉMICA',9,true);
  for(const c of [sheet.getCell(signature,1),sheet.getCell(signature,5)]){c.border={top:{style:'thin'}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};}
  sheet.getRow(signature).height=30;
  sheet.pageSetup.printArea=`A1:G${signature+1}`;
  sheet.headerFooter.oddFooter='&LCeicom · Registro académico&RPágina &P de &N';
  workbook.calcProperties.fullCalcOnLoad=true;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
