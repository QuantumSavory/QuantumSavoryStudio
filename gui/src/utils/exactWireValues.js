export const MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991

function pointerToken(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1')
}

function actualKind(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value
}

export class ExactJsonValueError extends TypeError {
  constructor(path, expected, value) {
    super(`Exact JSON value at ${path} must be ${expected}; received ${actualKind(value)}`)
    this.name = 'ExactJsonValueError'
    this.path = path
    this.expected = expected
    this.actual = actualKind(value)
  }
}

/**
 * Validate and clone a JSON value without invoking accessors or JSON coercion hooks.
 *
 * `forbidKind` closes the simulator-owned opaque extension: application tagged
 * objects are legal only in their dedicated schema branches, never inside `Any`.
 */
export function cloneExactJsonValue(
  value,
  { path = '/', forbidKind = false } = {},
) {
  const ancestors = new WeakSet()

  const fail = (currentPath, expected, currentValue) => {
    throw new ExactJsonValueError(currentPath, expected, currentValue)
  }
  const childPath = (currentPath, key) => (
    `${currentPath === '/' ? '' : currentPath}/${pointerToken(key)}` || '/'
  )

  const visit = (currentValue, currentPath) => {
    if (
      currentValue === null
      || typeof currentValue === 'string'
      || typeof currentValue === 'boolean'
    ) {
      return currentValue
    }
    if (typeof currentValue === 'number') {
      if (!Number.isFinite(currentValue)) {
        fail(currentPath, 'a finite JSON number', currentValue)
      }
      return currentValue
    }
    if (typeof currentValue !== 'object') {
      fail(currentPath, 'JSON null, string, finite number, boolean, array, or object', currentValue)
    }
    if (ancestors.has(currentValue)) {
      fail(currentPath, 'an acyclic JSON value', currentValue)
    }

    ancestors.add(currentValue)
    try {
      if (Array.isArray(currentValue)) {
        const allowedKeys = new Set([
          'length',
          ...Array.from({ length: currentValue.length }, (_, index) => String(index)),
        ])
        for (const key of Reflect.ownKeys(currentValue)) {
          if (typeof key !== 'string' || !allowedKeys.has(key)) {
            fail(currentPath, 'a dense JSON array without custom properties', currentValue)
          }
        }
        return Array.from({ length: currentValue.length }, (_, index) => {
          if (!Object.hasOwn(currentValue, index)) {
            fail(childPath(currentPath, index), 'a present JSON array item', undefined)
          }
          const descriptor = Object.getOwnPropertyDescriptor(currentValue, String(index))
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
            fail(childPath(currentPath, index), 'an enumerable JSON data item', currentValue)
          }
          return visit(descriptor.value, childPath(currentPath, index))
        })
      }

      const prototype = Object.getPrototypeOf(currentValue)
      if (prototype !== Object.prototype && prototype !== null) {
        fail(currentPath, 'a plain JSON object', currentValue)
      }
      if (forbidKind && Object.hasOwn(currentValue, 'kind')) {
        fail(childPath(currentPath, 'kind'), 'absent from an opaque JSON object', currentValue)
      }

      const clone = prototype === null ? Object.create(null) : {}
      for (const key of Reflect.ownKeys(currentValue)) {
        if (typeof key !== 'string') {
          fail(currentPath, 'a JSON object without symbol keys', currentValue)
        }
        const nestedPath = childPath(currentPath, key)
        const descriptor = Object.getOwnPropertyDescriptor(currentValue, key)
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          fail(nestedPath, 'an enumerable JSON data property', currentValue)
        }
        Object.defineProperty(clone, key, {
          value: visit(descriptor.value, nestedPath),
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
      return clone
    } finally {
      ancestors.delete(currentValue)
    }
  }

  return visit(value, path)
}

/** Clone the recursively untagged opaque value admitted for an `Any` branch. */
export function cloneExactOpaqueJsonValue(value, { path = '/' } = {}) {
  return cloneExactJsonValue(value, { path, forbidKind: true })
}
