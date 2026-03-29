/**
 * Recuperação de foco e overlays órfãos (fora de #root), para evitar
 * estado em que o usuário não consegue digitar após modais/PDF/diálogos.
 */

const SELECTOR_FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'

export function isFocusLost() {
  const ae = document.activeElement
  return ae === document.body || ae === document.documentElement || ae == null
}

/**
 * Foca o primeiro campo editável visível dentro do container (default: área principal).
 * @returns {boolean} true se focou algum elemento
 */
export function recoverInputFocus(containerSelector = '.layout-main') {
  const container = document.querySelector(containerSelector)
  if (!container) return false

  const list = container.querySelectorAll(SELECTOR_FOCUSABLE)
  for (const el of list) {
    if (!(el instanceof HTMLElement)) continue
    if (el.offsetParent === null && !el.getClientRects?.().length) continue
    try {
      el.focus({ preventScroll: true })
      if (document.activeElement === el) return true
    } catch {
      /* ignore */
    }
  }
  return false
}

/**
 * Remove apenas overlays com classe .modal-overlay que não estão dentro de #root
 * (ex.: bugs de extensões ou manipulação externa ao React).
 * @returns {number} quantidade removida
 */
export function removeGhostModalOverlays() {
  const root = document.getElementById('root')
  if (!root) return 0
  let removed = 0
  document.querySelectorAll('.modal-overlay').forEach((el) => {
    if (!root.contains(el)) {
      try {
        el.remove()
        removed += 1
      } catch {
        /* ignore */
      }
    }
  })
  return removed
}

/**
 * Executa remoção de overlays fantasmas + tentativa de foco no primeiro campo da área principal.
 */
export function runInputRecovery(options = {}) {
  const { log = true } = options
  const ghostOverlaysRemoved = removeGhostModalOverlays()
  const focusRestored = recoverInputFocus()
  if (log && (ghostOverlaysRemoved > 0 || focusRestored)) {
    console.warn('[GestorDesk] Recuperação de entrada:', { ghostOverlaysRemoved, focusRestored })
  }
  return { ghostOverlaysRemoved, focusRestored }
}
