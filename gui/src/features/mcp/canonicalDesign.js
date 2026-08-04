import { encodeProject } from '../../utils/projectDocument.js'

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, sortValue(value[key])]),
    )
  }
  return value
}

export function canonicalDesignJson(project, context = {}) {
  const document = encodeProject(project, context)
  delete document.map
  return JSON.stringify(sortValue(document))
}

export async function encodeCanonicalDesign(project, context = {}) {
  const json = canonicalDesignJson(project, context)
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 is unavailable in this browser context.')
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(json),
  )
  const hash = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return {
    document: JSON.parse(json),
    hash,
  }
}
