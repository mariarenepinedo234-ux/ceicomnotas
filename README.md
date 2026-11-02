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

Abre `http://localhost:3000`. El administrador se crea en la terminal con una contraseña elegida por ti. El primer acceso obliga a cambiarla. Las contraseñas elegidas deben tener entre 8 y 160 caracteres y ser distintas del usuario/CI y de la anterior. No existen contraseñas predeterminadas en modo institucional. El catálogo académico real se registra desde el panel.

Para una instalación de prueba nueva con datos ficticios, usa `npm run configurar -- --demo` en lugar de `npm run configurar`, y omite `crear-admin`. Los accesos de demostración están en la guía. No actives demostración sobre una base institucional. `configurar` nunca sobrescribe `.env`.

También se admite un servidor PostgreSQL propio o administrado, configurando `DATABASE_URL` y usando los mismos comandos de migración, administrador e inicio. No se necesita Docker si ya existe PostgreSQL.

## Actualizar desde SQLite

Detén la aplicación anterior y respalda su carpeta `data`. Prepara PostgreSQL vacío con `SEED_DEMO=false`; antes de crear usuarios, ejecuta:

```sh
npm run db:importar -- "ruta/al/archivo/ceicom.sqlite"
```

El importador abre el origen en modo de solo lectura y mantiene IDs, relaciones, contraseñas, puntajes y auditoría. Compara conteos y valores dentro de una única transacción. Si falla, revierte toda la importación. No acepta una base de destino con registros. Las sesiones antiguas se excluyen intencionalmente. Conserva el archivo SQLite y su copia de respaldo después de importar.

## Flujos disponibles

Los resúmenes administrativos y docentes distinguen **materias diferentes** de **grupos**. Una materia se cuenta por nombre normalizado y año académico, aunque se dicte en distintas carreras, turnos o módulos. Por ejemplo, Power BI en cinco carreras y Web III en Sistemas son **2 materias y 6 grupos**, con 19 estudiantes y 30 registros de notas en el caso preparado. La agrupación es visual: conserva las asignaciones, listas y planillas individuales. El panorama muestra todas las materias y permite desplegar todos sus grupos, sin truncar la sexta asignación. En el panel docente las materias encabezan sus grupos por carrera; los filtros de gestión, módulo y carrera mantienen el conteo correspondiente al período.

- Administración de estudiantes, docentes, carreras, turnos, gestiones, módulos y materias.
- Asignación docente con selección **carrera → materias de esa carrera → módulo → turno**. Desde la ficha del docente no se vuelve a elegir a la persona. El servidor valida la relación carrera/materia. Las materias comunes pueden registrarse en distintas carreras sin mezclar sus planillas.
- Inscripción en materias según carrera, turno y año académico.
- Tabla docente **Saber 40 + Hacer 40 + Ser 20 = 100**, con dos decimales. Aprobación desde 61; borradores incompletos sin nota final.
- Planillas por carrera, materia, módulo, gestión y turno: PDF carta con firmas y paginación, Excel con fórmulas, validaciones y formato condicional. Solo reprobados en rojo. Se exige guardar todas las notas finales antes de exportar. Editar Excel no modifica el portal.
- Consulta del estudiante exclusivamente de su expediente, filtrado por gestión y módulo.
- Cambios de turno y año actual con motivo, conservando inscripciones anteriores y notas. Las futuras inscripciones se hacen en el turno nuevo; no traslada automáticamente materias activas.
- Suspensión manual de consulta por mensualidades pendientes, sin eliminar datos. No hay integración con cobros.
- Actividad de notas, traslados, autorizaciones y exportaciones; contraseñas con scrypt y salt aleatorio; cambio inicial obligatorio; sesiones de ocho horas con cookie HttpOnly y SameSite.

## Catálogo desde la planilla institucional Excel

Administración puede abrir **Materias y asignaciones → Importar Excel** (también disponible en Docentes), seleccionar la planilla `.xlsx` y revisar una vista previa antes de confirmar. Se utiliza exclusivamente la hoja **BASE DE DATOS**: lista de carreras y docentes en columna B, y bloques de materias/códigos encabezados por carrera y año. Las otras hojas no se usan para cargar estudiantes, notas ni asignaciones. No se ejecutan fórmulas del archivo. Límite: 2 MB comprimido y 40 MB expandido.

La importación actualiza coincidencias por código, carrera y año, permite códigos compartidos entre carreras, conserva las materias ausentes y se ejecuta en una transacción. Una repetición del mismo catálogo no duplica los registros. Los nombres se conservan como fueron enviados, normalizando únicamente los espacios; posibles errores de redacción se corrigen desde **Editar**. La referencia revisada contiene 163 materias, nueve carreras y 23 docentes; faltan las materias de Electrónica y Diseño y Producción de Audiovisuales - Guionización.

En el catálogo puedes **buscar por código/nombre**, filtrar por **carrera y año académico**, **crear** materias y **editar** nombre, código o estado. Una materia inactiva no puede asignarse nuevamente pero conserva su historial. Si ya tiene asignaciones, no se permite cambiar su carrera o año: crea otro registro para otro plan. Un código debe ser único dentro de una misma carrera y año.

Los docentes que llegan solo con nombre se guardan en **Docentes pendientes de CI**. Desde **Completar CI y habilitar** se introduce su carnet real; recién entonces se crea su cuenta, usando CI como contraseña inicial según la regla vigente y exigiendo cambio al ingresar. No se inventan carnets ni se crean contraseñas para registros incompletos. Una coincidencia exacta de nombre normalizado con un único docente existente puede vincularse a su cuenta, conservando sus credenciales.

También existe la herramienta local:

```sh
npm run catalogo:importar -- "PLANILLA DE NOTAS 2026.xlsx"
npm run catalogo:importar -- "PLANILLA DE NOTAS 2026.xlsx" --aplicar
```

El primer comando solo revisa; el segundo guarda. El Excel original y los nombres de docentes no se incluyen en el repositorio. El catálogo real se carga en la base mediante el archivo que conserva la institución. La aplicación de este entorno recibió el catálogo; descargar el código en otra computadora no copia su base de datos.

La exportación Excel reproduce la estructura de la hoja **PLANILLA DE NOTAS**: escudo, encabezado, gestión, fecha, carrera, materia/código y curso; tabla de 20 filas iniciales, dimensiones en F/G/H, nota final en I, observación en J, y firmas. Conserva fórmulas y validaciones, formato carta y páginas adicionales. El PDF y la vista previa usan los mismos datos y el escudo extraído de la plantilla. Solo los estudiantes reprobados se resaltan en rojo; las filas vacías quedan sin resultado.

Carreras indicadas: Contaduría General, Administración de Empresas, Comercio Internacional, Mercadotecnia, Secretariado Ejecutivo, Sistemas Informáticos, Diseño Gráfico, Electrónica y Diseño y Producción de Audiovisuales - Guionización. Turnos: Mañana, Tarde, Noche y Sábados. Estos catálogos se incluyen en demostración; la base institucional empieza vacía para registrar información real.

## Reglas académicas

### Grupos reales y CI pendientes

En **Estudiantes → Registrar grupo** se eligen carrera, materia, año académico, gestión de ingreso, gestión cursada, turno, módulo, fechas confirmadas y docente; se pegan los nombres (uno por línea). El formulario sugiere materias de esa carrera/año y permite registrar una materia complementaria sin inventar código. Los docentes se pueden seleccionar del directorio del Excel o de los registros existentes.

Una misma materia se registra por carrera para conservar grupos y planillas independientes. Los estudiantes de la misma carrera/promoción se reutilizan por nombre normalizado cuando hay una única coincidencia; los homónimos ambiguos se rechazan para completar sus datos antes. Una segunda carga idéntica no duplica alumnos ni inscripciones. Un cambio de turno/año preexistente no se sobrescribe automáticamente: debe realizarse desde su trámite de traslado.

Los estudiantes pueden tener **CI pendiente**. Se conserva su identidad académica, pero no tienen contraseña ni pueden iniciar sesión. **Completar datos** permite confirmar nombre y CI sin cambiar sus IDs, inscripciones o notas. Los nombres incompletos se señalan para revisión; no se completan por inferencia. Cuando se registra un CI confirmado se exige cambiar la contraseña inicial al ingresar.

Un docente del directorio puede quedar vinculado a una asignación con CI pendiente, sin habilitar acceso. Su ficha mostrará **Completar CI y habilitar**. Completar el CI conserva las materias que ya tiene asignadas. No se generan carnets ni credenciales ficticios para preparar el expediente.

Las gestiones son distintas: por ejemplo, una promoción que ingresó en 2024 puede cursar tercero en la gestión 2026. El módulo y la materia se vinculan a la gestión cursada, sin reemplazar la de ingreso. Las fechas confirmadas del módulo actualizan su calendario y dejan auditoría.

**Grupos académicos** muestra las listas separadas por materia y carrera. Antes de registrar notas se pueden descargar **PDF borrador** y **Excel borrador**, marcados claramente como BORRADOR y con nombres de archivo distintos. Las filas pendientes no se convierten en reprobados. La exportación final sigue exigiendo todas las notas guardadas; los plazos docentes no se reabren automáticamente por cargar un grupo.

Para cargas locales privadas también existe `npm run grupos:importar -- archivo-privado.json --aplicar`. Sin `--aplicar` solo informa el contexto. El formato es:

```json
{
  "admission_year": "2024", "academic_year": "2026", "level": 3,
  "shift": "Mañana", "teacher": "Nombre del docente registrado",
  "module": {"name": "Tercer trimestre", "start_date": "2026-07-01", "end_date": "2026-09-25"},
  "groups": [{
    "career": "Carrera registrada", "subject": "Materia complementaria", "code": null,
    "students": ["Nombre completo de ejemplo", {"name": "Nombre por completar", "name_pending": true}]
  }]
}
```

No subas esos archivos, listas reales o planillas con estudiantes a GitHub. La carga real de este entorno permanece en PostgreSQL y archivos privados fuera del checkout; descargar el código no la copia a una computadora diferente. En una instalación local usa el formulario con tus listas privadas.

### Plazos de registro

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

Pendientes funcionales: materias de las dos carreras incompletas, CI de los docentes importados, edición general de otros registros y bajas administrativas, recuperación de cuentas, importación de notas desde Excel, equivalencias y cambio de carrera. Confirmar subevaluaciones, feriados y procedimiento de traslado durante un módulo. La estructura puede evolucionar mediante nuevas migraciones sin borrar datos; una base más sólida no elimina la necesidad de mantenimiento.

### Dependencias de exportación

La auditoría npm actual señala avisos moderados en `minimatch`, transitivo de ExcelJS/archiver. La exportación del portal añade contenido generado en memoria y no recibe patrones glob del usuario. La sustitución directa por minimatch 11 rompe la API interna de glob 7; no debe forzarse sin actualizar la cadena de exportación y verificar compatibilidad. La actualización de esa cadena queda pendiente antes del despliegue de producción. Esta migración de base no constituye una certificación de seguridad del sistema.

## Identidad visual

El acceso usa una tarjeta centrada sobre fondo vino oscuro, con campos de usuario/CI y contraseña, control para mostrar la clave y orientación para recuperar el acceso mediante secretaría. La interfaz incorpora el logotipo de texto en el acceso y la barra lateral, y los tamaños originales de las fuentes en los paneles. Los filtros de gestión y módulo ajustan su altura para mostrar el texto completo. El logo se muestra sin recuadro: guindo en tema claro y blanco en tema oscuro, con el fondo transparente mediante una máscara de luminancia. El archivo `public/assets/ceicom-wordmark.png` es una reproducción de la referencia visual recibida; puede reemplazarse por el archivo original del instituto en blanco sobre fondo negro o transparente, conservando ese nombre para la máscara. El escudo original `public/assets/ceicom-logo.png` sigue reservado para las planillas, PDF y Excel. Estos cambios son visuales y no requieren migraciones de base de datos.

Vista previa del nuevo acceso: [ver imagen](docs/login-preview.png).

El botón **Tema oscuro / Tema claro** permite cambiar la apariencia en el login y en la barra superior de los paneles de todos los roles. La preferencia se guarda en el navegador y se sincroniza entre pestañas del mismo sitio. El tema claro es el predeterminado; las planillas y su impresión conservan el papel blanco y el escudo en ambos temas. Vista previa: [tema oscuro](docs/dark-theme-preview.png).

## Copias de seguridad desde administración

En el menú administrativo, abre **Copias de seguridad → Crear copia de seguridad**. Se crea un archivo PostgreSQL `.dump` con todas las gestiones del esquema del sistema (tablas, relaciones, índices, datos, cuentas y migraciones). Al terminar aparece **Descargar**; también puedes descargar copias anteriores desde la misma ventana. Se guarda en `backups/` dentro de la carpeta del proyecto que ejecuta el servidor, con nombre único. Si el portal está alojado remotamente, la carpeta pertenece al servidor; la descarga guarda una segunda copia en tu computadora. Las copias no se publican como archivos estáticos ni se incluyen en Git.

Solo administradores autenticados que hayan cambiado su contraseña inicial pueden listar, crear o descargar copias. Durante la generación se rechaza otra solicitud simultánea; los archivos incompletos se eliminan y no aparecen en la lista. Se registra la creación y descarga en auditoría. La ventana lista los archivos `ceicom-*.dump` de esa carpeta.

El portal usa `pg_dump` instalado. En Windows busca automáticamente en `C:/Program Files/PostgreSQL/<versión>/bin`; también puedes definir `PG_BIN_DIR="C:/Program Files/PostgreSQL/17/bin"` en tu `.env` y reiniciar Node. Usa herramientas de versión compatible con el servidor. Para el PostgreSQL del compose del proyecto se admite `BACKUP_MODE=docker`; en modo automático se intenta ese compose únicamente si falta `pg_dump` y la conexión coincide con la instalación local Ceicom. Esta función no requiere migraciones ni dependencias npm nuevas. Para actualizar, copia también `server.js`, `db.js`, `backups.js`, la carpeta `scripts` y `public`, conservando `.env`, `backups` y tus archivos privados. La restauración se realiza con el procedimiento de base vacía de la guía; no hay restauración destructiva desde el panel.

Vista previa del panel: [copias de seguridad](docs/backups-preview.png). Las pruebas verifican una restauración real en una base temporal `ceicom_restore_*`; la conexión de pruebas necesita permiso para crear y eliminar bases, además de esquemas, y herramientas de PostgreSQL en el compose de desarrollo.
