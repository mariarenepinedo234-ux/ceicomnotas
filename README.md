# Ceicom · Gestión académica con PostgreSQL

Sistema web de registro académico del Instituto Tecnológico Ceicom. **Node.js 24 + PostgreSQL 17**, con PDFKit para planillas carta y ExcelJS para Excel editable. Esta versión reemplaza SQLite como base de ejecución.

La guía de instalación, actualización desde SQLite, respaldos y problemas de Windows está en [GUIA-PARA-PROBAR.md](GUIA-PARA-PROBAR.md).

## Inicio institucional sin datos ficticios

Instala Node.js 24 y Docker Desktop, y abre una terminal en el proyecto:

```sh
npm install
npm run configurar
docker compose up -d --wait db
npm run db:migrate
npm run crear-admin
npm run dev
```

Abre `http://localhost:3000`. El administrador se crea en la terminal con una contraseña elegida por ti. El primer acceso obliga a cambiarla. No existen contraseñas predeterminadas en modo institucional. El catálogo académico real se registra desde el panel.

Para una instalación de prueba nueva con datos ficticios, usa `npm run configurar -- --demo` en lugar de `npm run configurar`, y omite `crear-admin`. Los accesos de demostración están en la guía. No actives demostración sobre una base institucional. `configurar` nunca sobrescribe `.env`.

También se admite un servidor PostgreSQL propio o administrado, configurando `DATABASE_URL` y usando los mismos comandos de migración, administrador e inicio. No se necesita Docker si ya existe PostgreSQL.

## Actualizar desde SQLite

Detén la aplicación anterior y respalda su carpeta `data`. Prepara PostgreSQL vacío con `SEED_DEMO=false`; antes de crear usuarios, ejecuta:

```sh
npm run db:importar -- "ruta/al/archivo/ceicom.sqlite"
```

El importador abre el origen en modo de solo lectura y mantiene IDs, relaciones, contraseñas, puntajes y auditoría. Compara conteos y valores dentro de una única transacción. Si falla, revierte toda la importación. No acepta una base de destino con registros. Las sesiones antiguas se excluyen intencionalmente. Conserva el archivo SQLite y su copia de respaldo después de importar.

## Flujos disponibles

- Administración de estudiantes, docentes, carreras, turnos, gestiones, módulos y materias.
- Asignación docente con selección **carrera → materias de esa carrera → módulo → turno**. Desde la ficha del docente no se vuelve a elegir a la persona. El servidor valida la relación carrera/materia. Las materias comunes pueden registrarse en distintas carreras sin mezclar sus planillas.
- Inscripción en materias según carrera, turno y año académico.
- Tabla docente **Saber 40 + Hacer 40 + Ser 20 = 100**, con dos decimales. Aprobación desde 61; borradores incompletos sin nota final.
- Planillas por carrera, materia, módulo, gestión y turno: PDF carta con firmas y paginación, Excel con fórmulas, validaciones y formato condicional. Solo reprobados en rojo. Se exige guardar todas las notas finales antes de exportar. Editar Excel no modifica el portal.
- Consulta del estudiante exclusivamente de su expediente, filtrado por gestión y módulo.
- Cambios de turno y año actual con motivo, conservando inscripciones anteriores y notas. Las futuras inscripciones se hacen en el turno nuevo; no traslada automáticamente materias activas.
- Suspensión manual de consulta por mensualidades pendientes, sin eliminar datos. No hay integración con cobros.
- Actividad de notas, traslados, autorizaciones y exportaciones; contraseñas con scrypt y salt aleatorio; cambio inicial obligatorio; sesiones de ocho horas con cookie HttpOnly y SameSite.

Carreras indicadas: Contaduría General, Administración de Empresas, Comercio Internacional, Mercadotecnia, Secretariado Ejecutivo, Sistemas Informáticos, Diseño Gráfico, Electrónica y Diseño y Producción de Audiovisuales - Guionización. Turnos: Mañana, Tarde, Noche y Sábados. Estos catálogos se incluyen en demostración; la base institucional empieza vacía para registrar información real.

## Reglas académicas

Hasta cuatro módulos sin superposición por gestión, con fechas dentro de esa gestión. El registro docente cierra **72 horas excluyendo sábados y domingos**, contadas desde las 23:59:59 de la fecha final en Bolivia (UTC−4). Ejemplo: viernes 30/10/2026 → miércoles 04/11/2026 a las 23:59:59. No se excluyen feriados; no son jornadas de ocho horas.

Administración puede reabrir de 1 a 168 horas corridas con motivo o corregir notas directamente. El plazo cerrado no impide consultar o exportar notas completas. Las notas anteriores sin desglose conservan su total; valores de una escala anterior que excedan 40/40/20 requieren revisión antes de exportar.

## Arquitectura de la base

- `db.js`: pool `pg` (hasta 10 conexiones), consultas parametrizadas y transacciones asíncronas con una conexión exclusiva por operación. `AsyncLocalStorage` mantiene las consultas en el cliente correcto, incluyendo rollback y auditoría.
- `migrations/*.sql`: estructura versionada con checksum. La migración se ejecuta bajo bloqueo transaccional para evitar carreras entre instancias. No edites una migración aplicada; añade una nueva.
- Claves foráneas, restricciones de integridad e índices por asignación, estudiante, carrera, módulo, docente y sesiones.
- Bloqueos por fila al actualizar notas, inscribir, trasladar y crear módulos; orden estable al actualizar lotes de notas. Los reportes leen una instantánea consistente.
- `scripts/import-sqlite.js`: importación explícita; no existe fallback automático a SQLite.
- `seed.js`: datos de demostración opcionales. La base institucional no crea usuarios conocidos.
- `test/fixtures/sqlite-legacy.js`: únicamente construye archivos antiguos para probar la importación; no se utiliza al iniciar el portal.

Los límites 40/40/20 se aplican en la API. Las columnas permiten almacenar hasta 100 para preservar puntajes de escalas anteriores importadas sin truncarlos. Las exportaciones detectan los que necesitan revisión. Las fechas son DATE y los instantes se guardan como TIMESTAMPTZ; la interfaz los presenta en Bolivia.

## Configuración privada

Node carga `.env` mediante los scripts npm. Consulta `.env.example`. Variables: `DATABASE_URL`, `TEST_DATABASE_URL` (solo desarrollo), `SEED_DEMO`, `PORT`, `COOKIE_SECURE`. Docker usa además `POSTGRES_PASSWORD` y `POSTGRES_PORT`. El configurador genera una contraseña aleatoria y no imprime su valor. No publiques `.env`, respaldos ni bases con datos personales.

Conexiones remotas deben usar el TLS y CA indicados por el proveedor; no se desactiva la verificación de certificados. La configuración Docker publicada es para desarrollo local y expone PostgreSQL únicamente en loopback.

## Pruebas

```sh
npm test
```

Se requiere PostgreSQL real en `TEST_DATABASE_URL`; no se utiliza una simulación. Cada grupo crea un esquema temporal aleatorio y lo elimina al terminar. No apuntes las pruebas a producción.

Se comprueban autenticación, permisos, notas, rollback, consultas y exportaciones PDF/Excel, traslados, restricciones de módulos con solicitudes simultáneas, migraciones repetibles y detección de cambios, administrador inicial, aislamiento de transacciones concurrentes, importación de SQLite íntegra y recuperación tras fallo. También se comprueba la resolución de rutas Windows y POSIX.

## Respaldos

```sh
npm run db:backup
npm run db:restore -- backups/archivo.dump
```

La restauración requiere un destino vacío configurado en `DATABASE_URL`. Para una conexión externa usa `--native` con `pg_dump`/`pg_restore` instalados. Consulta la guía antes de restaurar. El comando de respaldo no sobrescribe archivos y los guarda con permisos privados donde el sistema lo permite. Los respaldos del esquema `public` incluyen datos y migraciones. Se deben programar respaldos y probar su recuperación fuera del servidor principal antes de producción.

## Alcance pendiente

No se ha desplegado una instalación institucional de producción. Falta decidir alojamiento, configurar HTTPS, permisos mínimos para usuarios PostgreSQL, respaldos automáticos fuera del servidor, recuperación de contraseñas y revisión de privacidad. El limitador de intentos de acceso es local a cada proceso; varias instancias necesitan un limitador compartido o en el proxy.

Pendientes funcionales: plan de estudios real, escudo oficial (actualmente provisional), edición general y bajas administrativas, recuperación de cuentas, importación Excel, equivalencias y cambio de carrera. Confirmar subevaluaciones, feriados y procedimiento de traslado durante un módulo. La estructura puede evolucionar mediante nuevas migraciones sin borrar datos; una base más sólida no elimina la necesidad de mantenimiento.

### Dependencias de exportación

La auditoría npm actual señala avisos moderados en `minimatch`, transitivo de ExcelJS/archiver. La exportación del portal añade contenido generado en memoria y no recibe patrones glob del usuario. La sustitución directa por minimatch 11 rompe la API interna de glob 7; no debe forzarse sin actualizar la cadena de exportación y verificar compatibilidad. La actualización de esa cadena queda pendiente antes del despliegue de producción. Esta migración de base no constituye una certificación de seguridad del sistema.
