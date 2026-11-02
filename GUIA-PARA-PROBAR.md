# Probar Ceicom en tu computadora

Esta versión es para pruebas locales y contiene personas, materias y notas ficticias. Incluye las nueve carreras y los turnos Mañana, Tarde, Noche y Sábados. Las dimensiones son **Saber 40 + Hacer 40 + Ser 20 = 100**, con aprobación desde 61.

## 1. Instala Node.js

Descarga e instala **Node.js 24 LTS** desde https://nodejs.org/. Node.js incluye npm. Después de instalarlo, cierra y vuelve a abrir tu terminal.

Comprueba la instalación:

```sh
node --version
npm --version
```

Node debe mostrar `v24` o una versión posterior. No necesitas instalar MySQL, XAMPP ni configurar una base de datos: el sistema crea una base SQLite automáticamente.

## 2. Extrae el ZIP

Descomprime el archivo completo. Abre la carpeta **ceicomnotas**, donde se encuentran `package.json`, `server.js` y esta guía.

En Windows puedes abrir esa carpeta con Visual Studio Code y seleccionar **Terminal → Nueva terminal**. También puedes abrir una terminal directamente en esa carpeta. No ejecutes los comandos dentro del ZIP sin extraerlo.

## 3. Instala e inicia

Con conexión a Internet, ejecuta:

```sh
npm install
npm run dev
```

Deja la terminal abierta. Cuando veas «Ceicom iniciado en el puerto 3000», abre en Chrome, Edge o Firefox:

**http://localhost:3000**

La instalación de paquetes se hace la primera vez. En las siguientes ocasiones basta con abrir la terminal en la carpeta del proyecto y ejecutar `npm run dev`.

## 4. Accesos de prueba

| Rol | Usuario | Contraseña inicial |
| --- | --- | --- |
| Administrador | `admin` | `Ceicom2026!` |
| Docente | `4567890` | `4567890` |
| Estudiante | `7000001` | `7000001` |

El primer ingreso obliga a elegir una contraseña nueva de al menos 10 caracteres, diferente de la inicial y del CI. **Anota tu contraseña nueva**: será la que uses en los siguientes ingresos. Los botones de demostración solo completan la contraseña inicial; si ya la cambiaste, escríbela manualmente.

Cada rol tiene su propio cambio de contraseña. Para pasar a otro rol, cierra sesión desde el menú. La versión actual no tiene recuperación de contraseñas desde la interfaz.

## 5. Recorrido recomendado

1. **Administrador:** revisa Estudiantes, Docentes, Materias y asignaciones, y Gestiones y módulos. Los datos iniciales corresponden a 2026; si estás probando en otro año, selecciona **Gestión 2026** en el filtro.
2. **Docente:** entra a **Mis materias y notas**, selecciona Gestión 2026 y Módulo 4, y abre **Programación I → Registrar notas**. Verás cinco estudiantes de Sistemas Informáticos. Completa Saber, Hacer y Ser para cada uno. Ejemplos: `20 + 30 + 10 = 60` (reprobado), `20 + 30 + 11 = 61` (aprobado) y `40 + 40 + 20 = 100`.
3. Pulsa **Guardar calificaciones** y luego **Generar planilla de notas**. Puedes descargar **PDF** en tamaño carta o **Excel** editable cuando todos los estudiantes de esa materia tengan una nota final guardada. El rojo se usa solo para reprobados. Los cambios en el Excel no actualizan el portal.
4. **Estudiante:** entra con `7000001`, selecciona Gestión 2026 y consulta tus notas. Ese usuario corresponde a Valentina Rojas, una de las estudiantes de Programación I.
5. **Administrador:** abre el expediente de un estudiante y prueba un cambio de turno o una suspensión de consulta. La suspensión es manual y no se conecta con cobros. El cambio de turno conserva las notas anteriores; las nuevas materias se inscriben por separado.

Si estás probando después del cierre del módulo, la edición docente estará bloqueada. Entra como administrador, abre **Materias y asignaciones**, localiza Programación I del Módulo 4 de 2026 y usa el botón con candado para autorizar una reapertura con motivo. El administrador también puede editar las notas directamente.

## 6. Cerrar y volver a abrir

Para detener el servidor, pulsa **Ctrl+C** en la terminal. Para volver a iniciarlo:

```sh
npm run dev
```

Tus registros se conservan en `data/ceicom.sqlite`. No borres esa carpeta si deseas conservar lo que probaste. Para una prueba completamente nueva, extrae el ZIP en otra carpeta y repite la instalación; así mantienes intacta la copia anterior.

## 7. Comprobar las pruebas

```sh
npm test
```

La versión entregada tiene 12 pruebas. Usan bases temporales y no modifican tu base de trabajo.

## Problemas frecuentes

- **«node» o «npm» no se reconoce:** instala Node.js 24 y vuelve a abrir la terminal. Si continúa, comprueba que Node está incluido en PATH durante la instalación.
- **PowerShell bloquea npm.ps1:** ejecuta `npm.cmd install` y `npm.cmd run dev`, o utiliza Símbolo del sistema (CMD). No hace falta cambiar las políticas de seguridad de Windows.
- **No encuentra package.json:** abre la terminal dentro de `ceicomnotas`, no en la carpeta que contiene el ZIP.
- **Puerto 3000 ocupado / EADDRINUSE:** cierra la otra instancia que hayas iniciado. Alternativamente, usa otro puerto: en PowerShell, `$env:PORT=3001; npm.cmd run dev`; en CMD, `set PORT=3001` y después `npm run dev`; en macOS/Linux, `PORT=3001 npm run dev`. Abre `http://localhost:3001` en ese caso.
- **No hay materias:** selecciona Gestión 2026 y Módulo 4. Comprueba que estás usando el docente de prueba indicado arriba.
- **No permite exportar:** guarda las notas finales de todos los estudiantes. Un espacio vacío deja la nota pendiente. Si aparecen puntajes de una escala anterior por revisar, corrígelos dentro de los límites 40/40/20.
- **No permite registrar notas:** revisa el plazo del módulo. La administración puede autorizar una reapertura.

El paquete incluye código fuente, dependencias declaradas y su archivo de versiones, pruebas y documentación. No incluye `node_modules`, la base de datos del entorno, archivos `.env` privados ni historial Git. Los paquetes se descargan con `npm install`. El escudo es provisional. Esta entrega es para evaluación local; antes de usarla con datos reales se necesitan configuración de producción, HTTPS, respaldos y completar las funciones administrativas pendientes descritas en `README.md`.
