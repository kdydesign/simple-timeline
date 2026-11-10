import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
afterEach(cleanup)

// JSDOM omits browser pointer capture and scrolling. The Electron suites exercise
// the real APIs; these test-only shims let Radix's keyboard/focus logic run here.
const captures = new WeakMap<Element, Set<number>>()
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function (id) { return captures.get(this)?.has(id) ?? false }
  Element.prototype.setPointerCapture = function (id) {
    const ids = captures.get(this) ?? new Set<number>()
    ids.add(id); captures.set(this, ids)
  }
  Element.prototype.releasePointerCapture = function (id) { captures.get(this)?.delete(id) }
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
// Radix Switch measures its hidden form input. JSDOM has no layout engine;
// real dimensions and resizing are covered by the Electron suites.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
