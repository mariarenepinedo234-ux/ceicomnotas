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

Abre `http://localhost:3000`. El administrador se crea en la terminal con una contraseña elegida por ti. El primer acceso obliga a cambiarla. Las contraseñas elegidas deben tener entre 8 y 160 caracteres y ser distintas del usuario/CI y de la anterior. No existen contraseñas predeterminadas en modo institucional. El catálogo académico revisado se carga con `npm run catalogo:actualizar` y se puede editar desde el panel.

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

La importación actualiza coincidencias por código, carrera y año, permite códigos compartidos entre carreras, conserva las materias ausentes y se ejecuta en una transacción. Una repetición del mismo catálogo no duplica los registros. Los nombres de materias y estudiantes se guardan en mayúsculas, conservando tildes y Ñ; posibles errores de redacción se corrigen desde **Editar**. La referencia original contenía 163 materias y 23 docentes. La revisión de noviembre de 2026 contiene 235 materias de las nueve carreras y completa Electrónica y Audiovisuales; sus datos de materias están disponibles con `npm run catalogo:actualizar`.

En el catálogo puedes **buscar por código/nombre**, filtrar por **carrera y año académico**, **crear** materias y **editar** nombre, código o estado. Una materia inactiva no puede asignarse nuevamente pero conserva su historial. Si ya tiene asignaciones, no se permite cambiar su carrera o año: crea otro registro para otro plan. Un código debe ser único dentro de una misma carrera y año.

Los docentes que llegan solo con nombre se guardan en **Docentes pendientes de CI**. Desde **Completar CI y habilitar** se introduce su carnet real; recién entonces se crea su cuenta, usando CI como contraseña inicial según la regla vigente y exigiendo cambio al ingresar. No se inventan carnets ni se crean contraseñas para registros incompletos. Una coincidencia exacta de nombre normalizado con un único docente existente puede vincularse a su cuenta, conservando sus credenciales.

También existe la herramienta local:

```sh
npm run catalogo:importar -- "PLANILLA DE NOTAS 2026.xlsx"
npm run catalogo:importar -- "PLANILLA DE NOTAS 2026.xlsx" --aplicar
```

El primer comando solo revisa; el segundo guarda. El Excel original y los nombres de docentes no se incluyen en el repositorio. El catálogo corregido de materias se puede aplicar desde el archivo revisado incluido, sin datos personales, mediante `npm run catalogo:actualizar`; el directorio docente se importa desde el Excel privado de la institución. La aplicación de este entorno recibió el catálogo; descargar el código en otra computadora no copia su base de datos.

La exportación Excel reproduce la estructura de la hoja **PLANILLA DE NOTAS**: escudo, encabezado, gestión, fecha, carrera, materia/código y curso; tabla de 20 filas iniciales, dimensiones en F/G/H, nota final en I, observación en J, y firmas. Conserva fórmulas y validaciones, formato carta y páginas adicionales. El PDF y la vista previa usan los mismos datos y el escudo extraído de la plantilla. Solo los estudiantes reprobados se resaltan en rojo; las filas vacías quedan sin resultado.

Carreras indicadas: Contaduría General, Administración de Empresas, Comercio Internacional, Mercadotecnia, Secretariado Ejecutivo, Sistemas Informáticos, Diseño Gráfico, Electrónica y Diseño y Producción de Audiovisuales - Guionización. Turnos: Mañana, Tarde, Noche y Sábados. Estos catálogos se incluyen en demostración; la base institucional empieza vacía para registrar información real.

## Reglas académicas

### Grupos reales y CI pendientes

En **Estudiantes → Registrar grupo** se eligen carrera, materia registrada, año académico, gestión de ingreso, gestión cursada, turno, módulo y docente registrado. Se marcan estudiantes existentes en una lista con casillas, búsqueda y selección de visibles. Las personas y materias nuevas deben registrarse por separado; no se crean desde este formulario.

Una misma materia se registra por carrera y trimestre para conservar grupos y planillas independientes. El formulario identifica estudiantes por sus IDs, sin confundir homónimos, y una repetición no duplica inscripciones. La importación histórica por CLI es un flujo separado que puede reutilizar nombres inequívocos o crear personas autorizadas en una carga inicial. Los cambios actuales de carrera/turno/año se realizan desde la edición del estudiante y conservan sus inscripciones anteriores.

Los estudiantes pueden tener **CI pendiente**. Se conserva su identidad académica, pero no tienen contraseña ni pueden iniciar sesión. **Completar datos** permite confirmar nombre y CI sin cambiar sus IDs, inscripciones o notas. Los nombres incompletos se señalan para revisión; no se completan por inferencia. Cuando se registra un CI confirmado se exige cambiar la contraseña inicial al ingresar.

Un docente del directorio puede quedar vinculado a una asignación con CI pendiente, sin habilitar acceso. Su ficha mostrará **Completar CI y habilitar**. Completar el CI conserva las materias que ya tiene asignadas. No se generan carnets ni credenciales ficticios para preparar el expediente.

Las gestiones son distintas: por ejemplo, una promoción que ingresó en 2024 puede cursar tercero en la gestión 2026. El módulo y la materia se vinculan a la gestión cursada, sin reemplazar la de ingreso. Las fechas del módulo se corrigen en Gestiones y módulos → Editar trimestre, con auditoría.

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

Pendientes funcionales: CI de los docentes importados, edición y bajas de otros catálogos, recuperación de cuentas sin intervención administrativa, importación de notas desde Excel, equivalencias y validación de convalidaciones al cambiar de carrera. Confirmar subevaluaciones, feriados y procedimiento de traslado durante un módulo. La estructura puede evolucionar mediante nuevas migraciones sin borrar datos; una base más sólida no elimina la necesidad de mantenimiento.

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

Al asignar materias a docentes, el selector filtra la carrera elegida y agrupa las materias activas en **1º año, 2º año y 3º año**, en ese orden. Dentro de cada año se respeta la posición del Excel, guardada en `catalog_order`, independientemente del ID de registro. Las complementarias sin posición se muestran después de las oficiales de ese año, usando su código numérico cuando existe. Se conservan los códigos para identificar cada materia. La migración 006 incorpora el campo de orden y se aplica al actualizar el catálogo.

## Mayúsculas en los datos académicos

Los nombres de estudiantes y materias se convierten a mayúsculas al escribir y se guardan así desde los formularios, la edición, la carga de grupos y la importación de materias. Los datos existentes se presentan en mayúsculas en todos los paneles y selectores, sin modificar sus identificadores ni reescribir el historial. Las planillas, PDF y Excel usan mayúsculas también para turno, módulo, fecha y textos impresos; conservan las fórmulas, notas, colores de reprobados y formato carta. Los carnets y contraseñas mantienen su contenido exacto. No requiere migraciones. Para actualizar, copia `public`, `server.js`, `reports.js`, `rosters.js` y `catalog.js`; conserva `.env`, `backups` y tus datos.

## Planes de estudio y avance en PDF

Administración tiene el apartado **Planes de estudio** con **Subir plan PDF**: indica título, carrera, año académico (1º, 2º o 3º) y un PDF de hasta 20 MB. Puedes subir varios planes para cada carrera/año. La lista se agrupa por carrera y año; los filtros y el buscador permiten encontrar títulos, nombres de archivos o carreras, sin distinguir mayúsculas ni tildes.

Los docentes registrados pueden consultar la biblioteca completa, abrir el PDF en otra pestaña y descargarlo. Los estudiantes y visitantes no tienen acceso a la lista ni a los documentos. Los controles y endpoints de subida y eliminación exigen sesión administrativa y cambio de contraseña inicial. Solo administración puede eliminar, con confirmación, para después subir una versión actualizada. La eliminación retira tanto el registro como el contenido del PDF y queda registrada en auditoría, igual que la publicación.

El PDF se almacena como `BYTEA` en PostgreSQL junto con sus datos de clasificación. La lista no carga el contenido de los archivos. Los documentos no se guardan dentro de `public`, no tienen enlaces públicos y quedan incluidos en los respaldos `.dump` existentes. Se verificó la restauración de un PDF desde un respaldo en una base temporal. Se admite un archivo por carga; se comprueban extensión, tipo, encabezado, final de PDF y tamaño máximo. No se modifica el archivo original ni las notas.

Para instalar esta actualización, detén el servidor y actualiza el proyecto completo, conservando `.env`, `backups` y tus archivos privados. Incluye los nuevos módulos `study-plans.js` (servidor y cliente), los estilos y `migrations/004_study_plans.sql`. Ejecuta:

```sh
npm install
npm run db:migrate
npm run dev
```

La migración agrega la tabla `study_plans`; conserva los estudiantes, docentes, materias y notas existentes. No edites las migraciones anteriores. Actualiza el navegador con Ctrl + F5. Vista previa con datos de prueba: [planes de estudio](docs/study-plans-preview.png).

## Administración de estudiantes, inscritos y trimestres

**Registrar grupo**, en Estudiantes, inscribe únicamente personas ya registradas. Elige carrera, año académico, materia del catálogo, ingreso, gestión cursada, turno, trimestre existente y docente registrado. La lista de casillas muestra a los estudiantes que coinciden con esos datos; permite buscar por nombre o CI y seleccionar/desmarcar los visibles. Cambiar carrera, año, ingreso o turno reinicia la selección. No se crean estudiantes, docentes, materias ni trimestres desde este formulario. Primero registra cualquier persona que falte con **Nuevo estudiante**. El guardado agrega inscripciones y conserva las notas existentes.

**Editar inscritos** está disponible en Grupos académicos y en Materias y asignaciones. Muestra una lista actualizada con los inscritos marcados y otros estudiantes registrados elegibles. Puedes agregar y retirar personas. Los inscritos anteriores siguen visibles aunque después hayan cambiado de carrera/turno/año. Las notas de quienes permanecen se conservan. Retirar estudiantes con notas o borradores exige marcar una confirmación específica; se eliminan esas inscripciones y sus notas. Si la lista o las notas cambiaron mientras se revisaba, el servidor rechaza la operación y exige reabrirla.

En cada estudiante, **Editar / Completar datos** permite corregir nombre, CI, carrera, turno, ingreso y año actual. El historial anterior conserva sus materias y notas. Corregir un CI existente cambia el usuario, conserva su contraseña y cierra las sesiones abiertas. Completar por primera vez un CI habilita la contraseña inicial basada en ese CI y exige cambiarla. **Restablecer clave** permite asignar una contraseña temporal de 8 a 160 caracteres distinta del CI; cierra las sesiones y obliga a elegir una clave personal al volver a ingresar. Las contraseñas no se muestran ni se guardan en auditoría.

El botón **Eliminar estudiante** revisa su identidad y muestra cuántas inscripciones y registros con notas se borrarían en todas las gestiones. Exige escribir **ELIMINAR ESTUDIANTE**. Elimina únicamente esa persona, sus sesiones e inscripciones; conserva la auditoría y los demás estudiantes. En **Gestiones y módulos**, **Editar trimestre** corrige nombre y fechas, respetando la gestión, los cuatro módulos y los períodos sin superposición. Se puede cambiar de gestión si no hay asignaciones. **Eliminar trimestre** muestra las asignaciones, inscripciones y notas afectadas y exige escribir **ELIMINAR TRIMESTRE**: elimina ese período y sus registros relacionados, conservando las personas, el catálogo y los demás períodos. Las revisiones caducan si cambia la información antes de confirmar. Estas eliminaciones son permanentes en la base activa; una copia previa permite recuperar el estado anterior.

Todas estas funciones y sus endpoints son exclusivos de administración. La nueva migración `005_admin_management.sql` permite registrar la misma materia en varios trimestres de una gestión, manteniendo cada lista y planilla separada. No elimina filas ni modifica las notas existentes. La importación histórica por CLI sigue siendo un flujo distinto para cargas iniciales autorizadas; el endpoint web de grupos ya no acepta listas de nombres para crear personas.

Para actualizar, detén el portal y copia la versión completa del proyecto, conservando `.env`, `backups` y los archivos privados. Ejecuta `npm install`, `npm run db:migrate` y `npm run dev`; actualiza el navegador con Ctrl + F5. Se requieren el nuevo módulo `academic-admin.js` del servidor, los módulos/estilos del cliente y la migración 005, además de los archivos actualizados. Ejemplo con datos de prueba: [selección de estudiantes registrados](docs/registered-students-preview.png).

## Catálogo corregido de noviembre de 2026

Materias y asignaciones ya no muestra **Importar Excel**. El catálogo revisado del archivo recibido el 11 de noviembre de 2026 está incorporado en `catalogs/ceicom-2026.json`: 235 materias de nueve carreras, con 21 nombres corregidos y 72 materias añadidas para completar Electrónica y Diseño y Producción de Audiovisuales - Guionización (36 por carrera). El archivo publicado contiene únicamente carreras, códigos, años y nombres de materias; no incluye el Excel ni los datos personales de sus otras hojas.

Tras actualizar el proyecto completo, conservando `.env`, `backups` y los archivos privados, ejecuta:

```sh
npm install
npm run catalogo:actualizar
npm run dev
```

El comando aplica el catálogo a la base de tu `.env` en una transacción. Actualiza nombres por código, carrera y año, conservando IDs, estado activo/inactivo, asignaciones, inscritos y notas. Si una materia sin código coincide de forma inequívoca con un nombre anterior conocido, se corrige y se completa su código sobre el mismo ID. Añade las materias faltantes y conserva las complementarias, como Informática (Power BI), que no están en el archivo oficial. Una segunda ejecución no duplica materias; vuelve a aplicar los nombres oficiales revisados. El total del sistema puede superar las 235 materias del archivo si hay complementarias o registros históricos propios.

Para revisar solamente el contenido preparado, usa `npm run catalogo:actualizar -- --revisar`. Para correcciones posteriores hechas por la institución se mantienen **Crear materia**, **Editar** y la herramienta de importación por terminal. El importador de Docentes conserva su acceso; para usarlo emplea el Excel actualizado. Presiona Ctrl + F5 después de aplicar el catálogo.

## Orden de materias por carrera y año

La migración `006_subject_order.sql` agrega `subjects.catalog_order` y asigna las posiciones del Excel revisado a las materias existentes por carrera, año y código. No cambia nombres, códigos, IDs, asignaciones ni notas. Tanto la importación Excel como `npm run catalogo:actualizar` conservan desde ahora las posiciones de las filas del archivo dentro de cada carrera/año. El comando de actualización vuelve a aplicar los nombres y el orden del catálogo revisado.

El catálogo, la asignación docente, el registro de grupos y la inscripción individual usan el mismo criterio: carrera, 1º/2º/3º año y posición del Excel. Para los códigos habituales se ve la secuencia 101, 102, 103…; las carreras con numeraciones repetidas, como Electrónica, mantienen el orden exacto de las filas. Las complementarias se mantienen después de las oficiales de su año.

Actualiza el proyecto completo, conservando `.env`, `backups` y tus archivos privados, y ejecuta `npm install`, `npm run catalogo:actualizar` y `npm run dev`. El comando aplica las migraciones pendientes antes de cargar el catálogo; también puedes ejecutar `npm run db:migrate` por separado. Actualiza el navegador con Ctrl + F5.
