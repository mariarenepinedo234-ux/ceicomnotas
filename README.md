# Ceicom · Gestión académica

Primera versión web del registro académico del Instituto Tecnológico Ceicom. Node.js 24+, servidor HTTP y SQLite integrados, interfaz adaptable sin servicios externos. PDFKit genera PDF y ExcelJS genera libros Excel `.xlsx`.

## Iniciar

```sh
npm install
npm run dev
```

El servidor escucha en el puerto **3000**. `npm start` lo inicia sin recarga del servidor. El navegador se actualiza manualmente tras modificar la interfaz. La base se crea en `data/ceicom.sqlite` y persiste al reiniciar; no se versiona. `PORT`, `DB_PATH` y `COOKIE_SECURE` son variables opcionales del proceso (ver `.env.example`; el archivo `.env` no se carga automáticamente).

## Accesos de demostración

| Rol | Usuario | Contraseña inicial |
| --- | --- | --- |
| Administrador | `admin` | `Ceicom2026!` |
| Docente | `4567890` | `4567890` |
| Estudiante | `7000001` | `7000001` |

**Datos ficticios.** El primer ingreso obliga a cambiar la contraseña (mínimo 10 caracteres). Después se usa la nueva contraseña; los botones de demostración solo completan las credenciales iniciales. Los usuarios nuevos usan su CI como usuario y contraseña inicial según el requisito de la versión 1. La contraseña se guarda con scrypt y salt aleatorio, nunca en texto claro. Las sesiones duran ocho horas y usan cookie HttpOnly y SameSite. Hay límite de intentos de acceso por dirección de conexión.

## Flujo disponible

1. Administración crea carreras, turnos, gestiones y módulos (hasta cuatro por gestión, sin superposición), materias por carrera y año, docentes y estudiantes.
2. Asigna una materia a un docente, módulo y turno. Primero selecciona la carrera: el selector de materias muestra únicamente las de esa carrera, con su año académico. Cambiar la carrera limpia la materia seleccionada; si no hay materias, debes registrarlas antes de asignar. Desde la ficha de un docente, ese docente se utiliza automáticamente. Las materias comunes se registran en cada carrera que las incluya, y sus asignaciones y planillas permanecen separadas. El servidor también comprueba que la materia pertenezca a la carrera elegida. Inscribe a los estudiantes en esas asignaciones, verificando carrera, año y turno. Registrar un estudiante no lo inscribe automáticamente en materias.
3. El docente ve únicamente sus asignaciones y estudiantes agrupados por carrera. En una tabla registra Saber (0–40), Hacer (0–40) y Ser (0–20). La suma de las tres dimensiones calcula la nota final (1–100); desde 61 se aprueba. Puede guardar borradores incompletos, que no cuentan como reprobados.
4. El estudiante consulta exclusivamente sus notas por gestión y módulo. Puede imprimir el expediente desde el navegador.
5. Administración puede cambiar turno y año actual con motivo obligatorio. **Las inscripciones ya existentes permanecen con el turno cursado y sus notas**. Las futuras se hacen en el nuevo turno; esta versión no traslada automáticamente materias activas, no calcula equivalencias ni cambia la carrera del estudiante.
6. Puede suspender manualmente la consulta por mensualidades pendientes, sin borrar notas ni impedir que el docente las registre. El bloqueo se aplica en el servidor y muestra un aviso al estudiante. No hay integración con cobros.

El panel incluye resumen, actividad reciente, progreso de registro, catálogo de materias, calendario, expedientes y formularios funcionales. La identidad visual provisional usa vino y crema; el emblema es genérico, pendiente del logo oficial.

## Carreras y turnos iniciales

Contaduría General, Administración de Empresas, Comercio Internacional, Mercadotecnia, Secretariado Ejecutivo, Sistemas Informáticos, Diseño Gráfico, Electrónica y Diseño y Producción de Audiovisuales - Guionización.

Turnos: Mañana, Tarde, Noche y Sábados. Los módulos de ejemplo son trimestres de 2026; sus fechas son ilustrativas y deben sustituirse al preparar una base institucional.

## Regla de cierre

Se interpreta **72 horas sin sábados ni domingos** como 72 horas transcurridas dentro de lunes a viernes, no como 72 horas de una jornada laboral de ocho horas. Se cuenta desde las 23:59:59 del último día del módulo, en `America/La_Paz` (UTC−4). Ejemplo: módulo terminado el viernes 30/10/2026 → cierre el miércoles 04/11/2026 a las 23:59:59. No excluye feriados. La administración puede autorizar una reapertura con motivo y vencimiento de 1 a 168 horas corridas; también puede corregir notas directamente. Cada nota, reapertura, traslado y suspensión queda registrado en la actividad.

## Planilla de notas para docentes

1. Abre **Mis materias y notas**. Filtra por gestión, módulo y carrera; las materias se presentan agrupadas por carrera, con su turno y año académico.
2. Pulsa **Registrar notas**. Cada estudiante ocupa una fila. Ingresa los puntos obtenidos en **Saber (40), Hacer (40) y Ser (20)**, con hasta dos decimales. No son porcentajes: se suman directamente. Los topes suman 100. Los estudiantes aparecen en orden alfabético según el nombre completo registrado.
3. Pulsa **Guardar calificaciones**. Si falta una dimensión, se guarda un borrador sin nota final. Para corregir una nota completa puedes volver a editarla mientras el plazo esté abierto. El servidor valida límites, calcula el total y guarda todos los cambios en una sola transacción.
4. Pulsa **Generar planilla de notas**, desde la tabla o la tarjeta de la materia. La vista previa usa solo datos guardados. Si quedan cambios sin guardar, la interfaz pide guardarlos primero. El PDF y Excel final se habilitan cuando todos los estudiantes inscritos tienen nota final y existe al menos una inscripción.
5. Descarga **PDF** o **Excel**. Cada planilla corresponde a una carrera, materia, módulo, gestión y turno; no mezcla estudiantes de otras asignaciones. El PDF es carta vertical (612 × 792 puntos), con 20 filas por página en grupos normales, encabezados repetidos, numeración, espacios para firmas y páginas adicionales para grupos grandes. Los nombres largos pueden reducir las filas que caben en una página. La vista previa divide en grupos de 20 filas; el PDF ajusta además la altura de los nombres.

El diseño conserva la estructura de la muestra proporcionada y usa vino, crema y azules suaves. **Solo los estudiantes con nota final menor a 61 se resaltan en rojo**, con texto explícito «REPROBADO». Aprobados, pendientes y filas vacías no llevan ese resaltado. El emblema es provisional, pendiente de disponer del escudo oficial como archivo de buena calidad.

El Excel contiene fórmulas de total y observación, validación de los límites por dimensión, formato condicional que se actualiza al editar, encabezados congelados y configuración de impresión en carta. No se protege la hoja para permitir edición. Las filas vacías no generan ceros ni reprobados. **Editar el Excel no modifica el sistema**; los cambios institucionales deben registrarse en el portal con los permisos y plazos correspondientes. No se incluye importación desde Excel en esta versión.

Al abrir una base de la primera versión se añaden las tres columnas de forma automática y aditiva, conservando los totales y todas las inscripciones. Las notas anteriores sin desglose muestran «—» en las dimensiones; sus totales no se distribuyen ni se inventan. Para sustituir un total anterior por un desglose, completa las tres dimensiones y guarda. Dejar un desglose nuevo incompleto y guardarlo reemplaza el total por un borrador pendiente. La API mantiene compatibilidad con notas finales directas de la primera versión y elimina el desglose al recibir una corrección de ese tipo, evitando inconsistencias.

Rutas: `GET /api/reports/:offeringId` devuelve la vista previa; `?format=pdf` y `?format=xlsx` descargan los documentos finales. Solo administración o el docente asignado pueden acceder. El cierre del plazo bloquea la edición del docente, pero permite consultar y exportar notas ya completas. Cada exportación queda registrada en la actividad.

## Validar

```sh
npm test
```

Las 12 pruebas usan bases temporales aisladas y el servidor real: autenticación, cambio inicial obligatorio, permisos por rol, notas y transacciones, vencimientos, reapertura, suspensión de consulta, conservación del expediente tras traslado, catálogos, fechas, entrega de recursos web, cálculo por dimensiones, borradores, migración de datos anteriores, autorización de exportaciones, estructura PDF carta y multipágina, y lectura del Excel generado para comprobar fórmulas, validaciones y formato condicional. Se comprobó además en Chromium el registro dimensional, la vista previa, las descargas reales y la interfaz móvil.

## Decisiones pendientes y alcance

- Máximos confirmados: Saber 40, Hacer 40 y Ser 20. Queda por definir si se necesitan subevaluaciones dentro de cada dimensión. Actualmente se registra un puntaje por dimensión.
- Confirmar fechas institucionales y el significado de las 72 horas, así como feriados y procedimiento de traslado durante un módulo.
- Logo oficial, nombres de materias y plan de estudios reales.
- Esta es una base funcional para desarrollo, **no un despliegue de producción**. Antes de usar datos personales: crear base limpia sin usuarios de ejemplo, aprovisionar administrador de forma segura, retirar accesos de demostración, habilitar HTTPS con `COOKIE_SECURE=true`, respaldos y restauración, revisar acceso por red y política institucional de privacidad, y completar recuperación de contraseñas. No existe todavía recuperación de contraseña desde la interfaz.
- SQLite está pensado para una única instancia local. No ejecutar varias réplicas que escriban el mismo archivo en almacenamiento de red.
- Incluye exportación de planillas por carrera/materia en PDF y Excel basada en la muestra enviada. Queda pendiente la importación de planillas, así como confirmar detalles del formato y el escudo oficial. La impresión del expediente personal sigue siendo una vista básica del navegador.
- Catálogos y usuarios pueden crearse y consultarse; la edición general, eliminación, equivalencias y cambio de carrera quedan para una siguiente iteración. La administración puede consultar y corregir todas las notas existentes.

No eliminar una base existente para actualizar el sistema. Respaldar antes de cualquier migración. La carga inicial solo ocurre si no existen usuarios.
