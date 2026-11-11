import {openDatabase} from '../db.js';
import {reviewedSubjectCatalog,updateReviewedSubjectCatalog} from '../subject-catalog-update.js';
let db;
try{
  if(process.argv.slice(2).some(arg=>arg!=='--revisar'))throw new Error('Uso: npm run catalogo:actualizar [-- --revisar]');
  if(process.argv.includes('--revisar')){
    const catalog=await reviewedSubjectCatalog();console.log(`Catálogo revisado ${catalog.version}: ${catalog.subjects.length} materias en ${catalog.careers.length} carreras. Sin modificar la base.`);
  }else{
    db=await openDatabase();
    const result=await updateReviewedSubjectCatalog(db);
    console.log(`Catálogo actualizado (${result.version}): ${result.subjects_in_file} materias oficiales, ${result.subjects_updated} corregidas y ${result.subjects_created} agregadas. Se conservan las materias complementarias, IDs, asignaciones, estudiantes y notas.`);
  }
}catch(error){console.error(error.code?'No se pudo actualizar el catálogo. La operación se revirtió; revisa la conexión y las relaciones de la base.':error.message);process.exitCode=1;}
finally{if(db)await db.close();}
