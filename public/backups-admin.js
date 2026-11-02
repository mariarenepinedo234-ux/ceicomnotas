export async function openBackups({api,modal,icon,escape,dateTime,toast}){
  modal('Copias de seguridad',`<section id="backup-manager"><p role="status">Consultando copias guardadas…</p></section>`,'Respalda toda la información académica y conserva una copia en tu computadora.');
  const manager=document.querySelector('#backup-manager');
  const size=bytes=>new Intl.NumberFormat('es-BO',{maximumFractionDigits:1}).format(bytes/1024/1024)+' MB';
  let copies=[],busy=false;
  function render(message='',error=''){
    if(!manager.isConnected)return;
    manager.innerHTML=`<div class="notice">${icon('shield')}<div><strong>Una copia de todas las gestiones</strong><p>Incluye estudiantes, docentes, materias, notas y cuentas de acceso. Se guarda en la carpeta backups del proyecto donde está funcionando el sistema. Puedes descargarla para conservarla en otro lugar.</p></div></div><button class="btn primary" id="create-backup" ${busy?'disabled':''}>${icon('download')} ${busy?'Generando copia…':'Crear copia de seguridad'}</button><p class="backup-status" role="status">${escape(message)}</p><p class="form-error" role="alert">${escape(error)}</p><div class="table-wrap"><table><thead><tr><th>FECHA Y ARCHIVO</th><th>TAMAÑO</th><th>DESCARGAR</th></tr></thead><tbody>${copies.map(copy=>`<tr><td><strong>${escape(dateTime(copy.created_at))}</strong><small class="cell-sub backup-filename">${escape(copy.saved_path)}</small></td><td>${size(copy.size)}</td><td><a class="btn secondary compact" href="${escape(copy.download_url)}" download>${icon('download')} Descargar</a></td></tr>`).join('')||'<tr><td colspan="3">Todavía no hay copias guardadas.</td></tr>'}</tbody></table></div><p class="backup-help">La descarga es un archivo .dump para recuperar los datos en PostgreSQL. Guarda estas copias en un lugar privado.</p>`;
    manager.querySelector('#create-backup').onclick=async()=>{
      busy=true;render('La copia puede tardar unos minutos. Espera a que termine.');
      try{
        const copy=await api('backups',{});copies=[copy,...copies];busy=false;
        render('Copia guardada correctamente. Ya puedes descargarla.');
        toast('Copia de seguridad guardada.');
      }catch(error){busy=false;render('',error.message);}
    };
  }
  try{copies=(await api('backups')).backups;render();}catch(error){if(manager.isConnected)manager.innerHTML=`<p class="form-error" role="alert">${escape(error.message)}</p>`;}
}
