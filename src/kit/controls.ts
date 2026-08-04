// ⚠️ VENDORED da marioverse-kit/controls.ts — sorgente canonica lì.
// Non editare qui: modifica il canonico e rilancia marioverse-kit/sync.sh.
/**
 * marioverse-kit · controls — il lato DOM dei primitivi di `css/mv-*.css`.
 *
 * Perché esiste: i primitivi CSS impongono un vincolo strutturale che non si
 * vede leggendo il CSS. `.mv-icon-btn` e `.mv-chip` DEVONO stare su un div,
 * mai su un <button> — misurato il 2026-08-04: a classe singola (0,1,0) un
 * <button> perde `background` e `padding` contro `button:not(.clickable-icon)`
 * di app.css, che è (0,1,1), e resta stilato a metà. Un div però non è un
 * bottone: non ha fuoco, non risponde a Invio/Spazio, non si annuncia.
 *
 * Queste funzioni sono il contratto: costruiscono il div E gli restituiscono
 * la semantica che ha perso. Chi le usa non può sbagliare accoppiata.
 *
 * Nessun import da `obsidian`, ma usa le sue estensioni del DOM
 * (createDiv/createSpan/toggleClass): gira nell'app, non sotto node:test nudo.
 * L'icona la mette il chiamante con setIcon(), che invece è un import vero.
 */

export function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

/**
 * Dà a un elemento non interattivo il contratto di un bottone: fuoco da
 * tastiera, attivazione con Invio/Spazio, e un nome accessibile.
 */
export function makeButtonLike<T extends HTMLElement>(element: T, label: string): T {
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', label);
  element.addEventListener('keydown', (event) => {
    if (!isActivationKey(event.key)) return;
    // preventDefault perché lo Spazio scrollerebbe la pagina sotto il controllo.
    event.preventDefault();
    element.click();
  });
  return element;
}

/** Bottone quadrato solo-icona. L'icona la applica il chiamante con setIcon. */
export function createIconButton(
  parent: HTMLElement,
  label: string,
  extraClass?: string,
): HTMLElement {
  const el = parent.createDiv({ cls: extraClass ? `mv-icon-btn ${extraClass}` : 'mv-icon-btn' });
  return makeButtonLike(el, label);
}

/**
 * Chip con etichetta. `pressed` va passato SOLO per un chip a due stati: su un
 * chip d'azione (un comando, non un filtro) aria-pressed sarebbe una bugia.
 */
export function createChip(
  parent: HTMLElement,
  label: string,
  options: { pressed?: boolean; extraClass?: string } = {},
): HTMLElement {
  const cls = options.extraClass ? `mv-chip ${options.extraClass}` : 'mv-chip';
  const el = parent.createDiv({ cls });
  el.createSpan({ cls: 'mv-chip__label', text: label });
  makeButtonLike(el, label);
  if (options.pressed !== undefined) setChipPressed(el, options.pressed);
  return el;
}

/**
 * Accende/spegne un chip. Lo stato vive su aria-pressed — la classe `is-on` è
 * solo l'aggancio per il CSS, e viene tenuta in sincrono da qui perché la
 * verità sia una sola.
 */
export function setChipPressed(chip: HTMLElement, pressed: boolean): void {
  chip.setAttribute('aria-pressed', String(pressed));
  chip.toggleClass('is-on', pressed);
}
