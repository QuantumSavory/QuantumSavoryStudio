export function backendPlatformInfo({
  julia = '1.12.1',
  genie = '5.33.8',
  quantumsavory = '0.8.0',
  app = '2.0.0',
  trackedRevision = 'main',
  trackedSource = 'https://github.com/QuantumSavory/QuantumSavory.jl.git',
  treeHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  commit = null,
  unsafeCodeEvaluation = false,
  mcpAvailable = false,
} = {}) {
  return {
    versions: {
      julia,
      genie,
      quantumsavory,
      app,
    },
    quantumsavory: {
      version: quantumsavory,
      tracked_revision: trackedRevision,
      tracked_source: trackedSource,
      tree_hash: treeHash,
      commit,
    },
    capabilities: {
      unsafe_code_evaluation: unsafeCodeEvaluation,
      mcp: {
        available: mcpAvailable,
        local_only: true,
        start_mode: 'manual',
      },
    },
  }
}

export function durablePlatformInfo({
  julia = '1.12.1',
  genie = '5.33.8',
  quantumSavory = '0.8.0',
  app = '2.0.0',
} = {}) {
  return {
    versions: {
      julia,
      genie,
      quantumSavory,
      app,
    },
  }
}
