# Manual para editar la apariencia de Ceicom Académico

Guía práctica para cambiar tamaños, colores, textos, logos e imágenes.

Preparada para el proyecto Ceicom Académico con materias por partes y migración 009. Fecha: 19 de noviembre de 2026.

Puedes consultar este manual en Markdown, en la versión HTML que abre sin instalar nada, o en PDF. Los ejemplos son opcionales: el manual no cambia la apariencia del sistema por sí solo.

## 1. Preparar tu espacio de trabajo

1. Haz una copia de la carpeta del proyecto y abre la carpeta que vas a editar con Visual Studio Code.
2. Abre la carpeta completa, la que contiene `package.json`, `public` y `server.js`.
3. Abre una terminal en esa carpeta y ejecuta `npm run dev`, con PostgreSQL disponible y la configuración habitual del proyecto.
4. Abre la dirección del sistema en el navegador. El puerto predeterminado es 3000: `http://localhost:3000`. Si configuraste otro puerto, usa el que informa la terminal.
5. Haz un cambio pequeño, guarda con Ctrl + S y recarga con Ctrl + F5. En macOS, guarda con Cmd + S y prueba Cmd + Shift + R para recargar sin caché.

Una copia `.dump` respalda la base de datos. Para conservar el diseño también necesitas una copia de los archivos del proyecto: CSS, JavaScript e imágenes. Guarda tus copias de trabajo por separado; `.env` contiene la configuración de tu conexión.

## 2. En qué archivo se modifica cada cosa

Todas las rutas de esta guía parten de la carpeta del proyecto.

| Lo que quieres cambiar | Archivo o carpeta |
| --- | --- |
| Apariencia personalizada que agregarás siguiendo esta guía | `public/personalizacion.css` |
| Estilos generales originales: títulos, tarjetas, tablas y menú | `public/style.css` |
| Login, logo ovalado, textos del pie y desplegables por docente | `public/interface.css` |
| Colores y excepciones del tema oscuro | `public/theme.css` |
| Botón de tema y preferencia guardada | `public/theme.js` y `public/theme-init.js` |
| Formularios administrativos, casillas y resúmenes por partes | `public/academic-admin.css` |
| Historial académico del estudiante | `public/academic-history.css` y `public/academic-history.js` |
| Planes de estudio | `public/study-plans.css` y `public/study-plans.js` |
| Registro de notas y vista previa de la planilla | `public/planilla.css`, `public/gradebook.js` y `public/planilla.js` |
| Textos y estructura de las pantallas principales | `public/app.js` |
| Logo, fotografías y otras imágenes públicas | `public/assets/` |
| Archivos CSS y JS que carga la página; título de la pestaña | `public/index.html` |
| Diseño de las descargas PDF y Excel | `reports.js` |

La mayor parte de las pantallas se construye desde JavaScript. Por eso el texto «Estudiantes» o un formulario pueden estar en `app.js` y no dentro de `index.html`. Algunos estilos originales están en líneas muy largas; el archivo de personalización del siguiente paso permite trabajar con bloques fáciles de leer.

## 3. Crear un archivo para tus cambios de diseño

### Activarlo una sola vez

1. Copia `docs/ejemplos/personalizacion.css` dentro de `public/`, conservando el nombre `personalizacion.css`.
2. Abre `public/index.html`.
3. Localiza esta línea existente:

```html
<link rel="stylesheet" href="/academic-history.css" />
```

4. Justo debajo agrega esta línea, antes de la etiqueta que carga `app.js`:

```html
<link rel="stylesheet" href="/personalizacion.css" />
```

5. Guarda y recarga. La plantilla ya incluye ejemplos de títulos y textos más grandes; puedes ajustar sus valores o quitar los bloques que no necesites.

Si prefieres comenzar sin esos ejemplos, crea el archivo `public/personalizacion.css` vacío y agrega únicamente los bloques de esta guía que quieras aplicar. **Es necesario guardar el archivo y agregar el enlace:** si falta uno de los dos, los cambios no aparecerán.

El enlace va después de los demás CSS para que tus reglas puedan reemplazar las originales cuando tienen suficiente prioridad. Un selector muy específico del tema oscuro puede seguir ganando; en la sección 5 se muestran ejemplos para ese caso.

### Cómo leer un bloque CSS

```css
/* Este comentario explica lo que cambia el bloque. */
.page-heading h1 {
  font-size: 32px;
  line-height: 1.25;
}
```

`.page-heading h1` identifica los títulos principales. `font-size` cambia el tamaño y `line-height` la separación entre líneas. Las llaves `{ }` agrupan las propiedades y cada propiedad termina en `;`. Para pasar de 32 a 36 píxeles cambia solamente `32px` por `36px`.

| Propiedad | Para qué sirve | Ejemplo |
| --- | --- | --- |
| `font-size` | Tamaño de letra | `font-size: 16px;` |
| `font-weight` | Grosor de letra | `font-weight: 700;` |
| `color` | Color del texto | `color: #631e30;` |
| `background-color` | Color de fondo | `background-color: #f5eaee;` |
| `padding` | Espacio dentro del recuadro | `padding: 24px;` |
| `margin` | Espacio por fuera del recuadro | `margin-bottom: 20px;` |
| `gap` | Separación entre elementos de una fila o cuadrícula | `gap: 16px;` |
| `border-radius` | Redondeo de esquinas | `border-radius: 10px;` |
| `max-width` | Ancho máximo | `max-width: 900px;` |
| `line-height` | Altura de cada línea de texto | `line-height: 1.6;` |

Cuando un bloque ya exista en tu archivo, edita ese bloque. Si pegas varias versiones del mismo selector, una regla posterior puede anular una anterior.

## 4. Cambiar títulos, textos y botones

Los siguientes ejemplos se agregan a `public/personalizacion.css`. Se usa `@media screen` para aplicarlos a la pantalla; la impresión tiene sus propias reglas.

### Título principal y descripción de cada apartado

```css
@media screen {
  .page-heading h1 {
    font-size: 32px;
    line-height: 1.25;
  }
  .page-heading p {
    font-size: 14px;
    line-height: 1.6;
  }
  .page-heading .eyebrow {
    font-size: 11px;
    letter-spacing: 1.5px;
  }
}
```

El primer bloque cambia títulos como «Estudiantes», «Docentes» y «Gestiones y módulos». El tercero cambia la frase pequeña que aparece sobre el título. Estas reglas se aplican a ambos temas.

### Recuadros, menú y ventanas de registro

```css
@media screen {
  .panel-heading h2 { font-size: 17px; }
  .panel-heading p { font-size: 13px; }
  .module-card h2 { font-size: 24px; }
  .sidebar nav .nav-link { font-size: 14px; }
  .sidebar-bottom > .nav-link { font-size: 15px; }
  .modal-header h2 { font-size: 26px; }
  .form-grid label { font-size: 14px; }
}
```

`sidebar nav` corresponde al menú principal; `sidebar-bottom` corresponde a copias de seguridad, seguridad de la cuenta y cerrar sesión. `modal-header` cambia los títulos de las ventanas emergentes.

### Tablas del panel y nombres de estudiantes

```css
@media screen {
  .app-layout .table-wrap th { font-size: 11px; }
  .app-layout .table-wrap td { font-size: 13px; }
  .app-layout .person-cell strong { font-size: 14px; }
  .app-layout .person-cell small { font-size: 12px; }
  .app-layout .cell-sub { font-size: 12px; }
}
```

Los nombres y datos secundarios tienen reglas propias: agrandar solamente `td` no siempre los agranda. Este ejemplo se limita a las tablas dentro del panel principal; la planilla emergente se trata en la sección 10.

### Botones y mensajes de pie

```css
@media screen {
  .btn { font-size: 14px; min-height: 44px; }
  .btn.compact { font-size: 13px; }
  .panel-foot { font-size: 14px; line-height: 1.7; }
  .app-footer { font-size: 14px; }
}
```

Si un botón de una sección conserva otro tamaño, inspecciónalo: por ejemplo, `.module-enrollment-actions .btn` tiene una regla más específica. En ese caso agrega tu ajuste usando ese mismo selector.

### Un tamaño distinto para celular

```css
@media screen and (max-width: 760px) {
  .page-heading h1 { font-size: 26px; }
  .modal-header h2 { font-size: 23px; }
}
```

Una medida adecuada para computadora puede resultar demasiado grande en celular. Coloca este bloque después del bloque general del título.

## 5. Cambiar colores en los temas claro y oscuro

### Paleta principal

Los colores se escriben con códigos como `#631e30`. Puedes obtener un código desde el selector de colores de Visual Studio Code al pulsar sobre la muestra de color.

```css
@media screen {
  html[data-theme="light"] {
    --wine: #631e30;
    --wine-dark: #40121d;
    --wine-soft: #f5eaee;
    --bg: #f8f9fb;
    --ink: #25262d;
    --muted: #676975;
    --line: #ececf0;
  }
  html[data-theme="dark"] {
    --wine: #e0a4b6;
    --wine-soft: #382733;
    --bg: #14161d;
    --ink: #ebe9ef;
    --muted: #b4afbc;
    --line: #363741;
    --surface: #1e2029;
    --surface-raised: #282a35;
    --text-secondary: #b9b4c2;
  }
}
```

| Variable | Uso habitual |
| --- | --- |
| `--wine` | Color institucional, enlaces y acentos |
| `--wine-dark` | Variante más oscura usada en algunos botones al pasar el cursor |
| `--wine-soft` | Fondos suaves, por ejemplo la opción seleccionada del menú |
| `--bg` | Fondo general |
| `--ink` | Texto principal |
| `--muted` | Texto secundario en componentes que usan esta variable |
| `--line` | Bordes y separadores que usan esta variable |
| `--surface` | Fondo de tarjetas y ventanas del tema oscuro |
| `--surface-raised` | Fondo secundario del tema oscuro |
| `--text-secondary` | Texto secundario en las reglas del tema oscuro |

Hay componentes con colores escritos directamente: cambiar una variable no recolorea automáticamente todo. El logo ovalado, el fondo del login, algunos botones oscuros y los documentos descargados tienen reglas específicas.

### Color de un título en cada tema

```css
@media screen {
  html[data-theme="light"] .app-layout .page-heading h1 {
    color: #631e30;
  }
  html[data-theme="dark"] .app-layout .page-heading h1 {
    color: #f0c7d5;
  }
}
```

### Botones principales del tema oscuro

```css
@media screen {
  html[data-theme="dark"] :is(.app-layout, dialog) .btn.primary {
    background: #81334f;
    color: #ffffff;
  }
  html[data-theme="dark"] :is(.app-layout, dialog) .btn.primary:hover {
    background: #98405f;
  }
  html[data-theme="dark"] .auth-card button[type="submit"] {
    background: #81334f;
  }
}
```

El último bloque corresponde al botón de iniciar sesión. Si cambias su color, revisa también su estado al pasar el cursor, definido con `:hover` en `theme.css`. Mantén texto y fondo con suficiente contraste para que se lean.

### Fondo del inicio de sesión

```css
@media screen {
  .auth-page {
    background: linear-gradient(135deg, #301018, #631e30);
  }
}
```

## 6. Cambiar espacio y tamaño de un apartado

```css
@media screen {
  .panel-heading { padding: 26px; }
  .module-grid { gap: 24px; }
  .module-card { border-radius: 12px; }
  .app-layout .table-wrap td { padding-top: 20px; padding-bottom: 20px; }
  .gradebook-modal { max-width: 1100px; }
}
```

En una tabla, aumentar `padding` da más espacio a cada fila. `gradebook-modal` cambia el ancho máximo de la ventana de notas. Si aparece una barra horizontal dentro de la tabla, puede ser necesaria para ver sus columnas en celular.

El ancho del menú lateral y el desplazamiento del contenido están relacionados (`.sidebar` y `.main-column`), además de sus reglas para celular. Para agrandar letras del menú, empieza por `font-size`; cambiar solo el ancho de uno de esos elementos puede desalinear la pantalla.

## 7. Cambiar el logo

### El logo ovalado actual

El logo del menú y del login se dibuja con `.ceicom-wordmark` en `interface.css`. Usa `public/assets/ceicom-wordmark.png` como **máscara de luminosidad**: la forma de la imagen define qué zonas se pintan y `background` define su color. Por eso tiene una regla guinda para el tema claro y una blanca para el oscuro, sin recuadro de fondo.

Para cambiar solamente su color:

```css
@media screen {
  html[data-theme="light"] .ceicom-wordmark { background: #631e30; }
  html[data-theme="dark"] .ceicom-wordmark { background: #ffffff; }
  .auth-brand { max-width: 330px; }
}
```

`auth-brand` cambia el tamaño máximo del logo del login. El del menú se adapta al espacio disponible dentro de la barra lateral.

### Usar dos imágenes nuevas: una clara y otra oscura

Guarda dos PNG con fondo transparente en `public/assets/`: `logo-claro.png` y `logo-oscuro.png`. Los nombres son ejemplos; deben coincidir con los archivos que realmente agregues. Para usar las imágenes completas en lugar de la máscara actual, agrega:

```css
@media screen {
  .ceicom-wordmark {
    mask: none;
    mask-image: none;
    aspect-ratio: 1878 / 838;
    background: transparent url('/assets/logo-claro.png') center / contain no-repeat;
  }
  html[data-theme="dark"] .ceicom-wordmark {
    background: transparent url('/assets/logo-oscuro.png') center / contain no-repeat;
  }
}
```

El ejemplo de proporción corresponde al logo ovalado actual. Si el nuevo archivo mide 1200 por 500 píxeles, usa `aspect-ratio: 1200 / 500;`. `contain` permite ver la imagen completa sin recortarla. Usa un archivo que ya tenga transparencia; el CSS no elimina un recuadro blanco que esté dentro del PNG.

### Logo de las planillas

Las planillas usan otro archivo: `public/assets/ceicom-logo.png`. Para reemplazarlo, conserva ese nombre y el formato PNG o actualiza sus referencias en `public/planilla.js` y `reports.js`. Reinicia el servidor al reemplazar esta imagen: `reports.js` la carga al arrancar.

Su tamaño se ajusta en tres lugares: `.sheet-emblem img` en `planilla.css` para pantalla e impresión desde navegador; `doc.image(logo,43,23,{fit:[64,82]})` en `reports.js` para PDF; y `ext:{width:78,height:100}` en `renderExcel()` para Excel. Revisa que una imagen ampliada no cubra los títulos.

## 8. Agregar una fotografía o imagen nueva

### Guardar el archivo y comprobar su dirección

1. Guarda una imagen real en `public/assets/portada-ceicom.jpg`. Usa un nombre sencillo, sin espacios, y respeta mayúsculas y minúsculas.
2. Abre `http://localhost:3000/assets/portada-ceicom.jpg`, adaptando el puerto si corresponde. Debe aparecer la imagen.
3. En HTML y CSS, la ruta pública comienza en `/assets/`, sin escribir `/public/`.

Los ejemplos siguientes suponen que ya agregaste ese JPG. Para las imágenes que quieras mostrar en el sitio, usa archivos dentro de `public/assets/`; la configuración de seguridad actual del portal permite imágenes del propio sitio. Los documentos privados se gestionan por sus apartados del sistema, no como imágenes públicas.

### Insertarla en el resumen del administrador y docente

En `public/app.js`, busca `function dashboard(){`. Dentro del bloque HTML que devuelve esa función, busca `<section class="welcome-banner">`. Justo antes de esa etiqueta, dentro del mismo texto delimitado por comillas invertidas, pega:

```html
<figure class="imagen-institucional">
  <img src="/assets/portada-ceicom.jpg"
       alt="Instalaciones del Instituto Tecnológico Ceicom">
  <figcaption>Nuestro instituto</figcaption>
</figure>
```

En `public/personalizacion.css` agrega:

```css
@media screen {
  .imagen-institucional { margin: 0 0 24px; }
  .imagen-institucional img {
    display: block;
    width: 100%;
    max-height: 300px;
    object-fit: cover;
    border-radius: 12px;
  }
  .imagen-institucional figcaption {
    font-size: 13px;
    color: var(--muted);
    margin-top: 8px;
  }
}
```

`cover` llena el recuadro y puede recortar bordes de una foto. Para un logo o documento que debe verse completo, usa `object-fit: contain;`. El atributo `alt` describe la imagen para lectores de pantalla y cuando no puede cargarse.

El resumen del estudiante se construye aparte, en `function studentDashboard(...)`. Si también quieres la imagen allí, agrega el bloque dentro del HTML de esa función, antes de su `<section class="welcome-banner student-banner">`. Editar solo `dashboard()` la muestra en los resúmenes del administrador y docente.

### Usar una imagen de fondo

Si prefieres una fotografía de fondo en la franja de bienvenida, este bloque cambia el fondo sin agregar una etiqueta de imagen:

```css
@media screen {
  html[data-theme="light"] .app-layout .welcome-banner {
    background: linear-gradient(#ffffffdf, #ffffffdf),
      url('/assets/portada-ceicom.jpg') center / cover no-repeat;
  }
  html[data-theme="dark"] .app-layout .welcome-banner {
    background: linear-gradient(#181b23df, #181b23df),
      url('/assets/portada-ceicom.jpg') center / cover no-repeat;
  }
}
```

La capa semitransparente ayuda a leer las letras sobre la foto. La ilustración decorativa existente del libro sigue apareciendo; si quieres ocultarla solo en pantalla, agrega `.welcome-banner .banner-art { display: none; }` dentro del mismo bloque `@media screen`.

## 9. Cambiar textos y el nombre de la pestaña

Para cambiar el título de la pestaña del navegador, edita esta línea de `public/index.html`:

```html
<title>Ceicom · Gestión académica</title>
```

Para cambiar el texto de bienvenida, busca `Bienvenido a Ceicom` dentro de `public/app.js` y reemplaza únicamente esas palabras. Visual Studio Code permite buscar en todo el proyecto con Ctrl + Shift + F; en macOS, Cmd + Shift + F.

Al editar JavaScript conserva las comillas, comillas invertidas, etiquetas HTML y expresiones como `${escape(user.name)}`. Los atributos `id`, `name` y `data-*` conectan los botones y formularios con su funcionamiento; cambia las palabras visibles sin renombrar esos atributos.

Después de editar `app.js`, comprueba su sintaxis en la terminal:

```bash
node --check public/app.js
```

Si el comando termina sin mensaje de error, la sintaxis es válida. Eso no comprueba la apariencia ni toda la funcionalidad: abre la pantalla editada y úsala para verificar el resultado.

## 10. Cambiar la planilla en pantalla, PDF y Excel

La vista previa, la impresión del navegador, la descarga PDF y el Excel tienen diseños separados. Cambiar CSS afecta la vista del navegador; los archivos PDF y Excel se construyen desde `reports.js`.

### Vista previa en pantalla

En `public/personalizacion.css` puedes agregar:

```css
@media screen {
  .sheet-title h2 { font-size: 20px; }
  .sheet-table td { font-size: 10px; }
}
```

Para cambiar cómo se imprime desde el navegador, revisa las reglas `@media print` de `public/planilla.css`. La planilla está preparada para papel carta y tiene cálculos para repartir filas entre páginas. Si aumentas mucho las letras, comprueba una lista larga para detectar cortes o contenido fuera de la hoja.

### PDF descargado desde el botón PDF

En `reports.js`, dentro de `renderPdf()`, localiza:

```javascript
doc.font('Helvetica-Bold').fontSize(16).fillColor(WINE).text('PLANILLA DE NOTAS',42,116,{width:528,align:'center'});
```

Para agrandar ese título, cambia `fontSize(16)` por `fontSize(18)`. Los números `42` y `116` son posiciones en la hoja; un cambio de tamaño puede requerir ajustar espacios alrededor. Para cambiar el color institucional del documento, edita `WINE='#72283f'` al principio del archivo. Ese color es independiente de `--wine` del CSS.

### Excel descargado desde el botón Excel

En `reports.js`, dentro de `renderExcel()`, localiza:

```javascript
merge('A7:J7','PLANILLA DE NOTAS',16,true,'center');
sheet.getRow(7).height=23;
```

El `16` es el tamaño del título y `height=23` la altura de esa fila. Si lo cambias a 18, por ejemplo, aumenta también la altura a 27 y abre el archivo descargado para comprobarlo. Los anchos están en `sheet.columns`. Los colores de Excel usan códigos ARGB de ocho caracteres: por ejemplo `FF631E30`, donde `FF` indica que el color es opaco.

Después de editar `reports.js`, ejecuta `node --check reports.js`, reinicia el servidor y vuelve a descargar los documentos. Un PDF o Excel descargado antes conserva su diseño anterior.

## 11. Probar los cambios y conservarlos

1. Guarda los archivos. Si modificaste solo CSS o HTML, recarga el navegador con Ctrl + F5. Si cambiaste el servidor, `reports.js` o la imagen que carga al iniciar, reinícialo; con `npm run dev` el proceso puede reiniciarse automáticamente al detectar cambios de archivos que está observando.
2. Comprueba el tema claro y el oscuro con el botón de tema.
3. Revisa una pantalla con título largo, una tabla, un formulario y el menú. Si el cambio afecta distintos perfiles, entra también como docente y estudiante con cuentas de prueba.
4. Prueba una ventana estrecha o el modo móvil del navegador. Los títulos deben acomodarse y los botones deben seguir siendo utilizables.
5. Si cambiaste planillas, genera una lista corta y otra larga; revisa la vista previa y vuelve a descargar PDF y Excel.
6. Anota la fecha, el archivo y el cambio realizado. Conserva una copia de `personalizacion.css`, del enlace agregado en `index.html` y de tus imágenes para incorporarlos cuando actualices el proyecto.

Para probar una regla antes de guardarla, haz clic derecho sobre un título y elige **Inspeccionar**. En la pestaña de estilos puedes modificar `font-size` temporalmente. Al recargar se pierde ese ensayo: copia el valor que te guste al archivo CSS para conservarlo.

## 12. Problemas frecuentes

| Lo que ocurre | Qué revisar |
| --- | --- |
| El cambio no aparece | Guardaste el archivo; agregaste su enlace al final de los CSS; abriste la copia correcta del proyecto; recargaste sin caché. |
| Cambia en claro pero no en oscuro | Existe una regla más específica en `theme.css`. Usa un selector con `html[data-theme="dark"]` como los ejemplos. |
| Solo algunos textos se agrandan | Nombres, subtítulos y botones compactos tienen reglas propias. Inspecciona el elemento y usa su selector. |
| La imagen no aparece | Comprueba su URL `/assets/nombre.ext`, nombre exacto y extensión. En algunos sistemas `Logo.png` y `logo.png` son archivos distintos. |
| El nuevo logo se ve muy tenue | Puede estar usándose como máscara de luminosidad. Para dos PNG completos usa el ejemplo de la sección 7. |
| El logo conserva un recuadro blanco | El fondo puede formar parte del propio archivo. Utiliza una imagen con transparencia real. |
| El título sale del recuadro | Reduce `font-size`, permite varias líneas y revisa el espacio disponible en móvil. |
| El PDF o Excel no refleja el CSS | Modifica su diseño en `reports.js`, reinicia y vuelve a descargarlo. |
| La página queda vacía después de editar JavaScript | Revisa la terminal y ejecuta `node --check` sobre el archivo editado. Deshaz el último cambio si rompió comillas o etiquetas. |
| El cambio se pierde al actualizar el proyecto | Recupera tu CSS, su enlace en `index.html` y tus imágenes desde la copia de trabajo. |

## 13. Receta rápida: agrandar un título

Si ya creaste y enlazaste `personalizacion.css`, busca su bloque `.page-heading h1`, cambia el número de `font-size`, guarda y pulsa Ctrl + F5. Comprueba una computadora y un celular. Ese es el mismo procedimiento para el resto de tamaños: identifica el apartado, ajusta su propiedad y verifica el resultado.

La plantilla opcional está en `docs/ejemplos/personalizacion.css`. Este manual también está en `docs/manual-personalizacion.html` y `docs/manual-personalizacion.pdf`.
