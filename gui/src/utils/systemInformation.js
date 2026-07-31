import { frontendBuildInfo } from './frontendBuildInfo.js'
import {
  assertBackendPlatformInfo,
  isFullGitCommitSha,
} from './platformInfo.js'

export const UNKNOWN_SYSTEM_VALUE = 'Unknown'

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstString(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || ''
}

function dependencyRows(dependencies) {
  return Object.entries(record(dependencies))
    .filter(([name, version]) => name && typeof version === 'string' && version.trim())
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, version]) => ({ name, version: version.trim() }))
}

function actualCommit(value) {
  const candidate = firstString(value)
  return isFullGitCommitSha(candidate) ? candidate : ''
}

function systemInformationView(platformInfo, buildInfo) {
  const versions = platformInfo?.versions ?? {}
  const quantumsavory = platformInfo?.quantumsavory ?? {}
  const build = record(buildInfo)
  const dependencies = record(build.dependencies)

  return {
    webQuantumSavory: firstString(versions.app, build.appVersion) || UNKNOWN_SYSTEM_VALUE,
    julia: firstString(versions.julia) || UNKNOWN_SYSTEM_VALUE,
    genie: firstString(versions.genie) || UNKNOWN_SYSTEM_VALUE,
    quantumSavory: {
      version: firstString(quantumsavory.version) || UNKNOWN_SYSTEM_VALUE,
      trackedSource: firstString(quantumsavory.tracked_source),
      trackedRevision: firstString(quantumsavory.tracked_revision),
      treeHash: firstString(quantumsavory.tree_hash),
      commit: actualCommit(quantumsavory.commit),
    },
    frontend: {
      runtime: dependencyRows(dependencies.runtime),
      development: dependencyRows(dependencies.development),
    },
  }
}

/**
 * Normalize backend platform metadata and compile-time frontend dependency
 * versions for both visible diagnostics and copied panic reports.
 */
export function normalizeSystemInformation(platformInfo, buildInfo = frontendBuildInfo) {
  return systemInformationView(assertBackendPlatformInfo(platformInfo), buildInfo)
}

/** Build the same display view when platform metadata could not be loaded. */
export function unavailableSystemInformation(buildInfo = frontendBuildInfo) {
  return systemInformationView(null, buildInfo)
}
