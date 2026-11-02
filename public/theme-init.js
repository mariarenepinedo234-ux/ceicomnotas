// Aplicar la preferencia antes de pintar la interfaz evita destellos al recargar.
(() => {
  let theme='light';
  try {if(localStorage.getItem('ceicom-theme')==='dark')theme='dark';} catch {}
  document.documentElement.dataset.theme=theme;
})();
