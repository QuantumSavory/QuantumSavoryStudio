const PLATFORM_INFO_KEYS = Object.freeze(['versions', 'quantumsavory', 'capabilities'])
const PLATFORM_VERSION_KEYS = Object.freeze(['julia', 'genie', 'quantumsavory', 'app'])
const QUANTUMSAVORY_INFO_KEYS = Object.freeze([
  'version',
  'tracked_revision',
  'tracked_source',
  'tree_hash',
  'commit',
])
const CAPABILITY_KEYS = Object.freeze(['unsafe_code_evaluation', 'mcp'])
const MCP_CAPABILITY_KEYS = Object.freeze(['available', 'local_only', 'start_mode'])
const FULL_COMMIT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

function exactRecord(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  const actualKeys = Object.keys(value).sort()
  const sortedExpectedKeys = [...expectedKeys].sort()
  if (
    actualKeys.length !== sortedExpectedKeys.length
    || actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new TypeError(`${label} must contain exactly: ${expectedKeys.join(', ')}`)
  }
  return value
}

function requireNullableString(value, label) {
  if (value !== null && typeof value !== 'string') {
    throw new TypeError(`${label} must be a string or null`)
  }
}

export function isFullGitCommitSha(value) {
  return typeof value === 'string' && FULL_COMMIT_SHA.test(value)
}

/** Validate and return the exact snake_case `/platform_info` response DTO. */
export function assertBackendPlatformInfo(platformInfo) {
  const source = exactRecord(platformInfo, PLATFORM_INFO_KEYS, 'platformInfo')
  const versions = exactRecord(
    source.versions,
    PLATFORM_VERSION_KEYS,
    'platformInfo.versions',
  )
  for (const key of PLATFORM_VERSION_KEYS) {
    requireNullableString(versions[key], `platformInfo.versions.${key}`)
  }

  const quantumsavory = exactRecord(
    source.quantumsavory,
    QUANTUMSAVORY_INFO_KEYS,
    'platformInfo.quantumsavory',
  )
  for (const key of QUANTUMSAVORY_INFO_KEYS) {
    requireNullableString(quantumsavory[key], `platformInfo.quantumsavory.${key}`)
  }
  if (quantumsavory.version !== versions.quantumsavory) {
    throw new TypeError(
      'platformInfo.quantumsavory.version must match platformInfo.versions.quantumsavory',
    )
  }
  if (quantumsavory.commit !== null && !isFullGitCommitSha(quantumsavory.commit)) {
    throw new TypeError(
      'platformInfo.quantumsavory.commit must be a full lowercase Git SHA or null',
    )
  }

  const capabilities = exactRecord(
    source.capabilities,
    CAPABILITY_KEYS,
    'platformInfo.capabilities',
  )
  if (typeof capabilities.unsafe_code_evaluation !== 'boolean') {
    throw new TypeError('platformInfo.capabilities.unsafe_code_evaluation must be boolean')
  }
  const mcp = exactRecord(
    capabilities.mcp,
    MCP_CAPABILITY_KEYS,
    'platformInfo.capabilities.mcp',
  )
  if (typeof mcp.available !== 'boolean') {
    throw new TypeError('platformInfo.capabilities.mcp.available must be boolean')
  }
  if (mcp.local_only !== true) {
    throw new TypeError('platformInfo.capabilities.mcp.local_only must be true')
  }
  if (mcp.start_mode !== 'manual') {
    throw new TypeError('platformInfo.capabilities.mcp.start_mode must be manual')
  }
  return source
}

/** Return a detached immutable snapshot of an admitted backend DTO. */
export function snapshotBackendPlatformInfo(platformInfo) {
  const source = assertBackendPlatformInfo(platformInfo)
  return Object.freeze({
    versions: Object.freeze({ ...source.versions }),
    quantumsavory: Object.freeze({ ...source.quantumsavory }),
    capabilities: Object.freeze({
      unsafe_code_evaluation: source.capabilities.unsafe_code_evaluation,
      mcp: Object.freeze({ ...source.capabilities.mcp }),
    }),
  })
}
