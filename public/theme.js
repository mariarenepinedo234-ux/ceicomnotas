const moon='<path d="M20.9 13.4A9 9 0 0 1 10.6 3.1 9 9 0 1 0 20.9 13.4Z"/>';
const sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>';
const isDark=()=>document.documentElement.dataset.theme==='dark';
export function themeButton(){
  const dark=isDark(),label=dark?'Cambiar a tema claro':'Cambiar a tema oscuro';
  return `<button type="button" class="theme-toggle" data-theme-toggle aria-label="${label}" title="${label}" aria-pressed="${dark}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${dark?sun:moon}</svg><span>${dark?'Tema claro':'Tema oscuro'}</span></button>`;
}
function updateButtons(){document.querySelectorAll('[data-theme-toggle]').forEach(button=>{const template=document.createElement('template');template.innerHTML=themeButton();const next=template.content.firstElementChild;button.innerHTML=next.innerHTML;for(const name of ['aria-label','aria-pressed','title'])button.setAttribute(name,next.getAttribute(name));});}
function applyTheme(theme){document.documentElement.dataset.theme=theme;updateButtons();}
export function bindThemeButtons(){
  document.querySelectorAll('[data-theme-toggle]').forEach(button=>{button.onclick=()=>{const theme=isDark()?'light':'dark';try{localStorage.setItem('ceicom-theme',theme);}catch{}applyTheme(theme);};});
}
window.addEventListener('storage',event=>{if(event.key==='ceicom-theme'||event.key===null)applyTheme(event.newValue==='dark'?'dark':'light');});
