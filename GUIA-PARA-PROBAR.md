# Ceicom con PostgreSQL · Instalación y pruebas

Esta versión usa **PostgreSQL 17** como base principal. Ya no crea ni utiliza SQLite al iniciar el servidor. Se conserva una herramienta para importar los archivos SQLite de la versión anterior.

## Opción recomendada: PostgreSQL con Docker Desktop

### 1. Requisitos

- Instala **Node.js 24 LTS** desde https://nodejs.org/.
- Instala **Docker Desktop** desde https://www.docker.com/products/docker-desktop/ y ábrelo. En Windows utiliza su motor Linux/WSL 2.
- Extrae el ZIP completo del repositorio. Abre una terminal dentro de la carpeta que contiene `package.json`.
- Comprueba `node --version` y `docker compose version`.

No necesitas MySQL, XAMPP ni instalar PostgreSQL por separado si utilizas Docker Desktop. La primera instalación requiere Internet para descargar paquetes e imagen.

### 2. Elige una base institucional o de demostración

**Para comenzar sin personas, materias ni notas ficticias:**

```sh
npm install
npm run configurar
docker compose up -d --wait db
npm run db:migrate
npm run crear-admin
npm run dev
```

`crear-admin` solicita usuario, nombre y contraseña en la terminal. La contraseña no se muestra y debe tener al menos 8 caracteres. El primer acceso exige cambiarla. Anota tus credenciales; no hay recuperación de contraseña desde la interfaz todavía.

**Para explorar con datos ficticios**, desde una carpeta y configuración nuevas:

```sh
npm install
npm run configurar -- --demo
docker compose up -d --wait db
npm run dev
```

Abre **http://localhost:3000**. Mantén la terminal del servidor abierta. Para detenerlo, pulsa **Ctrl+C**. Las próximas veces basta con `docker compose up -d --wait db` y `npm run dev`.

`configurar` genera una contraseña de PostgreSQL aleatoria en el archivo privado `.env`. Nunca sobrescribe un `.env` existente. Node y Docker Compose leen ese archivo. No lo publiques ni compartas. `SEED_DEMO=false` es el modo institucional; `true` permite la carga inicial de demostración en una base completamente vacía. Cambiarlo a false no borra datos que ya existan.

Si cambias `POSTGRES_PORT`, modifica también el puerto en `DATABASE_URL` y `TEST_DATABASE_URL`. La contraseña de un volumen PostgreSQL existente no cambia por editar `.env`: conserva juntos la configuración y el volumen, o cambia la contraseña mediante las herramientas de PostgreSQL.

### 3. Accesos solo de demostración

| Rol | Usuario | Contraseña inicial |
| --- | --- | --- |
| Administrador | `admin` | `Ceicom2026!` |
| Docente | `4567890` | `4567890` |
| Estudiante | `7000001` | `7000001` |

Estos accesos no se crean en modo institucional. La primera vez debes cambiar cada contraseña por una diferente de al menos 8 caracteres. Después usa la nueva; los botones de demostración completan únicamente la contraseña inicial.

El ejemplo tiene nueve carreras, cuatro turnos, materias y módulos de 2026. Selecciona **Gestión 2026 → Módulo 4** para probar Programación I. El docente ve las materias por carrera y registra **Saber 40 + Hacer 40 + Ser 20**. Ejemplos: 20+30+10=60 (reprobado), 20+30+11=61 (aprobado), 40+40+20=100. Guarda todas las notas finales para descargar la planilla PDF o Excel. El estudiante `7000001` corresponde a Valentina Rojas.

Si el módulo ya venció, el administrador puede autorizar una reapertura desde Materias y asignaciones. El cierre restringe la edición, pero permite consultar y descargar planillas completas.

## Conservar los datos de la versión SQLite

**No borres `data/ceicom.sqlite` ni tu carpeta anterior.** Antes de actualizar, detén el sistema anterior y guarda una copia completa de su carpeta `data`, incluidos los archivos `-wal` y `-shm` si existen. Conserva los respaldos en una ubicación privada.

1. Extrae el proyecto nuevo en otra carpeta para conservar la versión anterior.
2. Ejecuta `npm install`, `npm run configurar`, `docker compose up -d --wait db` y `npm run db:migrate`.
3. No ejecutes `crear-admin` ni habilites demostración antes de importar: la base destino debe estar vacía.
4. Ejecuta, ajustando la ruta del archivo y usando comillas si contiene espacios:

```sh
npm run db:importar -- "C:/ruta/al/proyecto-anterior/data/ceicom.sqlite"
```

En macOS/Linux usa la ruta local correspondiente. También puedes copiar tu respaldo a `data/ceicom.sqlite` en el proyecto nuevo y ejecutar:

```sh
npm run db:importar -- ./data/ceicom.sqlite
npm run dev
```

La importación abre SQLite en modo de solo lectura y conserva identificadores, contraseñas ya cambiadas, expedientes, puntajes y actividad. Verifica cada valor importado y los conteos. Se ejecuta en una transacción: si hay un error, no se importa ninguna fila. Rechaza un destino con registros; no fusiona ni reemplaza bases existentes. Las sesiones antiguas no se importan: todos deben iniciar sesión de nuevo.

Las notas anteriores sin desglose conservan su total. Si un puntaje de la escala anterior supera Hacer 40 o Ser 20, se conserva y exige revisión antes de exportar una nueva planilla. Si el origen contiene fechas o relaciones inválidas, se informa el fallo y debe corregirse antes de repetir la importación.

Una base PostgreSQL ya usada, incluso si no tiene registros, conserva la posición de sus secuencias. La importación reajusta las secuencias para que los nuevos registros reciban identificadores disponibles.

## Opción alternativa: PostgreSQL instalado o alojado

Puedes usar un PostgreSQL 17 ya instalado, o un servicio administrado. Crea una base y un usuario propietario con contraseña propia. En `.env` configura:

```dotenv
DATABASE_URL=postgresql://USUARIO:CONTRASENA@SERVIDOR:5432/ceicom
SEED_DEMO=false
PORT=3000
COOKIE_SECURE=false
```

Codifica los caracteres especiales de usuario/contraseña como parte de una URL. Para un servidor remoto, utiliza el TLS y certificado que exija el proveedor; no desactives su verificación. `npm run configurar` es un ayudante para Docker local, no aprovisiona servidores remotos.

Ejecuta `npm install`, `npm run db:migrate`, `npm run crear-admin` y `npm run dev`. No necesitas los comandos Docker en esta opción. Para importar SQLite, sigue el procedimiento anterior antes de crear el administrador.

## Respaldos y recuperación

### Cargar carreras, materias y docentes desde el Excel institucional

Actualiza los archivos del proyecto conservando `.env`, SQLite y el volumen PostgreSQL. Ejecuta `npm install`, `npm run db:migrate` y `npm run dev`. Entra como administrador, abre **Materias y asignaciones → Importar Excel**, elige tu archivo `PLANILLA DE NOTAS 2026.xlsx`, revisa el resumen y pulsa **Confirmar importación**.

El catálogo real de este archivo tiene 163 materias con códigos por carrera/año. Las materias de Electrónica y Diseño y Producción de Audiovisuales - Guionización quedan pendientes; puedes agregarlas en **Crear materia** o completar el archivo e importarlo nuevamente. Usa **Editar** en el catálogo para corregir nombres, códigos o desactivar registros. Cambiar de carrera/año una materia que ya se dictó está restringido para conservar el historial.

Los 23 docentes del archivo no incluyen CI. Aparecerán en **Docentes → Docentes pendientes de CI**. Completa cada carnet con **Completar CI y habilitar** para crear su acceso. No se importan los estudiantes ni las notas de ejemplo de otras hojas.

Importante: descargar la nueva versión de GitHub no descarga la base ni los nombres de docentes. Debes importar tu Excel en tu instalación. El archivo original se conserva y no se publica en GitHub. El escudo institucional sí está incorporado al diseño de la aplicación y las planillas.

### Registrar grupos y completar datos pendientes

Antes de ingresar listas reales, ejecuta las migraciones de la versión actual con `npm run db:migrate`. En **Estudiantes → Registrar grupo**, selecciona la carrera y materia, gestión de ingreso y gestión cursada por separado, año académico, turno, módulo y docente. Revisa las fechas del módulo y pega los estudiantes uno por línea. Repite el registro para cada carrera y materia. El sistema no duplica a un estudiante ya registrado en la misma carrera/promoción cuando su nombre coincide de forma inequívoca.

Los CI pueden quedar pendientes sin inventar números. Se registran materias e inscripciones, pero no se habilita el ingreso del estudiante. Usa **Completar datos** cuando tengas nombre y CI confirmados. Un docente del Excel que todavía no tenga CI puede figurar académicamente en sus materias; completa su CI desde su ficha para habilitar el acceso.

En la tabla **Grupos académicos**, el botón **Planilla** permite revisar cada lista y descargarla como borrador PDF/Excel. Se marca BORRADOR mientras falten notas; las filas vacías no son reprobados. Los documentos finales requieren todas las notas. Cargar grupos de un período ya terminado no abre el plazo del docente: administración registra las notas o autoriza una reapertura.

Las listas reales de este entorno no se publican en el ZIP de GitHub. En tu computadora debes registrar tus listas en el formulario o importar un archivo JSON privado según README.md. Conserva tus bases y archivos de respaldo.

### Respaldar o recuperar PostgreSQL

Desde el panel **Administración**, abre **Copias de seguridad** en el menú lateral y pulsa **Crear copia de seguridad**. Al finalizar, pulsa **Descargar**. El respaldo también queda en `backups/` en la carpeta del proyecto que ejecuta Node; si usas un servidor remoto, esa carpeta estará en el servidor. Cada archivo tiene un nombre distinto y puedes volver a descargarlo desde la lista.

Con PostgreSQL instalado en Windows, el sistema busca sus herramientas en `C:/Program Files/PostgreSQL/<versión>/bin`. Si indica que falta `pg_dump`, agrega a tu `.env` la ruta de la versión que tienes instalada, por ejemplo:

```dotenv
PG_BIN_DIR="C:/Program Files/PostgreSQL/17/bin"
```

Reinicia con `npm run dev`. No reemplaces las demás variables de tu `.env`. Las herramientas deben tener una versión compatible con tu servidor. El archivo descargado es un respaldo de PostgreSQL `.dump`, no un Excel.

Para aplicar esta actualización debes copiar también los archivos `server.js`, `db.js`, `backups.js`, las carpetas `scripts` y `public`; conserva `.env`, `backups` y tus archivos privados. No necesitas importar tablas ni modificar la base existente.

Con el PostgreSQL de Docker, para generar un respaldo privado:

```sh
npm run db:backup
```

O con nombre elegido:

```sh
npm run db:backup -- backups/ceicom-respaldo.dump
```

Se usa `pg_dump` en formato de respaldo PostgreSQL, con las tablas, índices, relaciones y migraciones del esquema `public`. El comando no sobrescribe un archivo existente. Conserva copias fuera de esa computadora, con acceso restringido: contienen datos personales y hashes de contraseñas.

Para restaurar, crea una **base vacía**, configura `DATABASE_URL` para apuntar a ella, detén el portal y ejecuta:

```sh
npm run db:restore -- backups/ceicom-respaldo.dump
```

El destino debe estar dentro del PostgreSQL de Docker configurado; una base diferente requiere crearla primero. La restauración se niega si hay tablas en el destino. Después ejecuta `npm run db:migrate` y `npm run dev`. No borra ni reemplaza automáticamente la base original.

Con un PostgreSQL externo o instalado, instala sus herramientas cliente `pg_dump`/`pg_restore` y usa `--native`:

```sh
npm run db:backup -- backups/ceicom-respaldo.dump --native
npm run db:restore -- backups/ceicom-respaldo.dump --native
```

Las herramientas deben estar en PATH o en la carpeta indicada mediante `PG_BIN_DIR`. El cliente PostgreSQL debe ser de una versión compatible con el servidor (17 en la instalación recomendada). Los respaldos son manuales por ahora: antes de producción programa su ejecución periódica y prueba la restauración en un destino separado.

## Pruebas y problemas frecuentes

Configura `TEST_DATABASE_URL` con una conexión **de desarrollo** cuyo usuario pueda crear esquemas y bases temporales. El archivo generado para Docker apunta al mismo servidor local y las pruebas crean y eliminan exclusivamente esquemas aleatorios `ceicom_test_*`; no usan las tablas de `public`. La prueba de restauración crea y elimina una base temporal `ceicom_restore_*` y usa las herramientas del compose de desarrollo. No apuntes las pruebas a producción.

```sh
npm test
```

Las pruebas ejecutan PostgreSQL real, no simulaciones. Verifican roles, notas, reportes, importación, administrador, migraciones y transacciones simultáneas.

- **Falta DATABASE_URL:** comprueba `.env`. Si venías de SQLite, el antiguo `DB_PATH` ya no configura la base; usa `DATABASE_URL`.
- **ECONNREFUSED / no conecta:** abre Docker Desktop, ejecuta `docker compose up -d --wait db` y revisa `docker compose ps`. Si usas PostgreSQL instalado, comprueba que el servicio esté iniciado.
- **Puerto 5432 ocupado:** elige otro `POSTGRES_PORT` en `.env` y actualiza las dos URL de conexión. Reinicia el servicio Docker sin eliminar el volumen.
- **PowerShell bloquea npm.ps1:** usa `npm.cmd install` y `npm.cmd run dev`, o abre CMD. No cambies las políticas de seguridad de Windows.
- **No encuentra package.json:** abre la terminal en la carpeta donde está ese archivo.
- **Puerto 3000 ocupado:** detén la otra instancia o cambia `PORT=3001` en `.env` y abre `http://localhost:3001`.
- **No hay usuarios ni materias:** es normal en modo institucional. Crea el administrador desde la terminal y registra los catálogos reales desde el panel. En demostración, elige Gestión 2026.
- **Contraseña incorrecta:** si ya la cambiaste, escribe la nueva. Los accesos iniciales no sustituyen contraseñas actualizadas.

Los datos están en el volumen persistente `ceicom_postgres`, no en SQLite. `docker compose stop db` conserva los datos; `docker compose down` también conserva el volumen. **No ejecutes `docker compose down -v`** si deseas conservar la base. No pierdas el `.env` que corresponde al volumen.

Esta es una base de desarrollo preparada para evolucionar hacia uso institucional. Antes de cargar expedientes reales: configurar alojamiento, HTTPS, usuarios PostgreSQL de privilegios mínimos, respaldos automáticos, recuperación de cuentas y revisión de privacidad. La instalación local de Docker usa un usuario propietario para facilitar migraciones; no es la política de permisos de producción.
