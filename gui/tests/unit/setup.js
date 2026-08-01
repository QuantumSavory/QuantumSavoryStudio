import { afterEach } from 'vitest'
import { config, enableAutoUnmount } from '@vue/test-utils'

enableAutoUnmount(afterEach)

config.global.directives.tooltip = {
  beforeMount() {},
  updated() {},
}

// MapLibre creates its worker URL while the module loads. jsdom implements URL
// but not the object-URL methods available in browsers.
if (typeof window !== 'undefined' && typeof window.URL.createObjectURL !== 'function') {
  Object.defineProperties(window.URL, {
    createObjectURL: {
      configurable: true,
      value: () => 'blob:vitest-maplibre-worker',
    },
    revokeObjectURL: {
      configurable: true,
      value: () => {},
    },
  })
}

// vue-highlight-code observes its editable surface in the browser. Keep the
// shared expression editor mountable in jsdom without changing production
// behavior.
if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
