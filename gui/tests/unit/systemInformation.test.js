import { describe, expect, it } from 'vitest'

import {
  UNKNOWN_SYSTEM_VALUE,
  normalizeSystemInformation,
  unavailableSystemInformation,
} from '../../src/utils/systemInformation.js'
import { assertBackendPlatformInfo } from '../../src/utils/platformInfo.js'
import { backendPlatformInfo } from '../platformInfoFixtures.js'

const buildInfo = {
  appVersion: '1.8.0',
  dependencies: {
    runtime: { vue: '3.5.21', '@lucide/vue': '1.24.0' },
    development: { vitest: '3.2.7', vite: '6.4.3' },
  },
}

describe('system information normalization', () => {
  it('maps the exact backend DTO to one deterministic display view', () => {
    const commit = '0123456789abcdef0123456789abcdef01234567'
    const platformInfo = backendPlatformInfo({
      app: '1.8.1',
      quantumsavory: '0.7.1',
      trackedRevision: 'master',
      commit,
    })

    expect(assertBackendPlatformInfo(platformInfo)).toBe(platformInfo)
    expect(normalizeSystemInformation(platformInfo, buildInfo)).toEqual({
      webQuantumSavory: '1.8.1',
      julia: '1.12.1',
      genie: '5.33.8',
      quantumSavory: {
        version: '0.7.1',
        trackedSource: 'https://github.com/QuantumSavory/QuantumSavory.jl.git',
        trackedRevision: 'master',
        treeHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        commit,
      },
      frontend: {
        runtime: [
          { name: '@lucide/vue', version: '1.24.0' },
          { name: 'vue', version: '3.5.21' },
        ],
        development: [
          { name: 'vite', version: '6.4.3' },
          { name: 'vitest', version: '3.2.7' },
        ],
      },
    })
  })

  it('keeps frontend diagnostics in the explicit unavailable view', () => {
    const information = unavailableSystemInformation(buildInfo)
    expect(information.webQuantumSavory).toBe('1.8.0')
    expect(information.julia).toBe(UNKNOWN_SYSTEM_VALUE)
    expect(information.genie).toBe(UNKNOWN_SYSTEM_VALUE)
    expect(information.quantumSavory.version).toBe(UNKNOWN_SYSTEM_VALUE)
    expect(information.frontend.runtime).toHaveLength(2)
  })

  it.each([
    ['missing fields', { versions: {} }],
    ['top-level legacy alias', {
      ...backendPlatformInfo(),
      quantumSavory: backendPlatformInfo().quantumsavory,
    }],
    ['camel version alias', {
      ...backendPlatformInfo(),
      versions: {
        ...backendPlatformInfo().versions,
        quantumSavory: '0.8.0',
      },
    }],
    ['camel source alias', {
      ...backendPlatformInfo(),
      quantumsavory: {
        ...backendPlatformInfo().quantumsavory,
        trackedSource: 'legacy',
      },
    }],
    ['camel capability alias', {
      ...backendPlatformInfo(),
      capabilities: {
        ...backendPlatformInfo().capabilities,
        unsafeCodeEvaluation: false,
      },
    }],
    ['noncanonical commit', backendPlatformInfo({ commit: 'master' })],
  ])('rejects %s rather than normalizing an alternate shape', (_label, value) => {
    expect(() => normalizeSystemInformation(value, buildInfo)).toThrow(TypeError)
  })
})
