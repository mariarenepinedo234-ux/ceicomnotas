import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const password=randomBytes(24).toString('hex');
const demo=process.argv.includes('--demo');
const text=`# Configuración local privada. No compartir ni subir a GitHub.\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_PORT=5432\nDATABASE_URL=postgresql://ceicom:${password}@127.0.0.1:5432/ceicom\nTEST_DATABASE_URL=postgresql://ceicom:${password}@127.0.0.1:5432/ceicom\nPORT=3000\nCOOKIE_SECURE=false\nSEED_DEMO=${demo}\n`;
try {await writeFile('.env',text,{flag:'wx',mode:0o600});console.log(`Configuración .env creada. Modo ${demo?'demostración':'institucional sin datos ficticios'}. Continúa con docker compose up -d db.`);}
catch(error){if(error.code==='EEXIST')console.log('Ya existe .env; se conservó sin cambios. Revisa GUIA-PARA-PROBAR.md para actualizarlo.');else throw error;}
