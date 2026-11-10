// Restore keyboard position without treating app-driven focus as a tooltip request.
let restoring = false
export function isRestoringFocus() { return restoring }
export function restoreFocus(element: HTMLElement | null | undefined) {
  const previous = restoring
  restoring = true
  try { element?.focus({preventScroll:true}) }
  finally { restoring = previous }
}
