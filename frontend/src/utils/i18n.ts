import es from '../i18n/es.json';
import en from '../i18n/en.json';
import qu from '../i18n/qu.json';

export type Idioma = 'es' | 'en' | 'qu';
const diccionarios = { es, en, qu } as const;
const CLAVE = 'volunturno-idioma';

export function idiomaActual(): Idioma {
  if (typeof window === 'undefined') return 'es';
  const guardado = localStorage.getItem(CLAVE);
  return guardado === 'en' || guardado === 'qu' ? guardado : 'es';
}

export function traducir(clave: string, idioma: Idioma = idiomaActual()): string {
  const buscar = (raiz: unknown): unknown =>
    clave.split('.').reduce<unknown>((nodo, parte) =>
      (nodo && typeof nodo === 'object')
        ? (nodo as Record<string, unknown>)[parte]
        : undefined, raiz);
  const traducido = buscar(diccionarios[idioma]);
  const respaldo = buscar(diccionarios.es);
  return typeof traducido === 'string' ? traducido
    : typeof respaldo === 'string' ? respaldo : clave;
}

export function aplicarTraducciones() {
  if (typeof document === 'undefined') return;
  const idioma = idiomaActual();
  document.documentElement.lang = idioma === 'en' ? 'en-US' : idioma === 'qu' ? 'qu-PE' : 'es-PE';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(elemento => {
    const clave = elemento.dataset.i18n;
    if (clave) {
      const valor = traducir(clave, idioma);
      if (valor !== clave) elemento.textContent = valor;
    }
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]').forEach(elemento => {
    const clave = elemento.dataset.i18nPlaceholder;
    if (clave) elemento.placeholder = traducir(clave, idioma);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach(elemento => {
    const clave = elemento.dataset.i18nAriaLabel;
    if (clave) {
      const valor = traducir(clave, idioma);
      if (valor !== clave) elemento.setAttribute('aria-label', valor);
    }
  });
}

export function establecerIdioma(idioma: Idioma) {
  localStorage.setItem(CLAVE, idioma);
  aplicarTraducciones();
  document.dispatchEvent(new CustomEvent('volunturno:idioma', { detail: { idioma } }));
}

export function formatoFecha(fecha: Date, idioma: Idioma = idiomaActual()): string {
  return new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(fecha);
}

export function formatoHora(fecha: Date, idioma: Idioma = idiomaActual()): string {
  return new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-PE', {
    hour: 'numeric', minute: '2-digit', hour12: idioma === 'en'
  }).format(fecha);
}

export function formatoMoneda(monto: number, idioma: Idioma = idiomaActual()): string {
  return new Intl.NumberFormat(idioma === 'en' ? 'en-US' : 'es-PE', {
    style: 'currency', currency: 'PEN'
  }).format(monto);
}
