import { generateUUid } from '../../utils/Utils.js'
import {
  encodeCanonicalDesign,
  selectCanonicalDesignSections,
} from './canonicalDesign.js'
import { MCP_CONTRACT_VERSION } from './contractRegistry.js'

const HEARTBEAT_INTERVAL = 2_000
const COMMAND_RETRY_INTERVAL = 1_000
const TERMINAL_BINDING_ERRORS = new Set([
  'NO_EDITOR_BOUND',
  'EDITOR_LEASE_EXPIRED',
  'PROJECT_CHANGED',
])

function bridgeError(error, fallbackCode = 'INTERNAL_ERROR') {
  return {
    code: error?.code || fallbackCode,
    message: error?.message || 'The editor could not process the command.',
    status: error?.status ?? 400,
    retryable: error?.retryable === true || error?.details?.retryable === true,
    details: error?.details || {},
    method: error?.method,
    url: error?.url,
    cause: typeof error?.toJSON === 'function' ? error.toJSON().cause : undefined,
  }
}

export class McpEditorBridge {
  constructor({
    client,
    getProject,
    getProjectName,
    getSimulationName,
    designCommands,
    validateDesign,
    simulationController,
    flushEditors = async () => ({ valid: true }),
    onState = () => {},
  }) {
    this.client = client
    this.getProject = getProject
    this.getProjectName = getProjectName
    this.getSimulationName = getSimulationName
    this.designCommands = designCommands
    this.validateDesign = validateDesign
    this.simulationController = simulationController
    this.flushEditors = flushEditors
    this.onState = onState
    this.editorId = generateUUid('editor', 16)
    this.generation = 0
    this.binding = null
    this.revision = 0
    this.hash = null
    this.running = false
    this.heartbeatTimer = null
    this.commandAbortController = null
    this.commandPollTimer = null
    this.heartbeatAbortController = null
  }

  state(extra = {}) {
    const state = {
      bound: Boolean(this.binding),
      binding: this.binding,
      revision: this.revision,
      hash: this.hash,
      editorId: this.editorId,
      ...extra,
    }
    this.onState(state)
    return state
  }

  bindingIdentity() {
    if (!this.binding) return null
    return {
      binding_id: this.binding.binding_id,
      generation: this.generation,
    }
  }

  async initialize() {
    await this.client.start()
    return this.bindCurrentProject()
  }

  async bindCurrentProject() {
    await this.unbind({ bestEffort: false })
    const encoded = await encodeCanonicalDesign(this.getProject())
    this.generation += 1
    const response = await this.client.bind({
      editor_id: this.editorId,
      generation: this.generation,
      project_name: this.getProjectName(),
      simulation_name: this.getSimulationName(),
      contract_version: MCP_CONTRACT_VERSION,
      snapshot: encoded.document,
      hash: encoded.hash,
    })
    this.binding = response.binding
    this.revision = response.binding.revision
    this.hash = encoded.hash
    this.running = true
    this.startHeartbeat()
    this.pollCommands()
    return this.state({ synchronized: true })
  }

  async stop() {
    if (this.binding) {
      await this.unbind()
    } else {
      this.stopLoops()
    }
    const response = await this.client.stop()
    return this.state({ server: response.server })
  }

  async unbind({ bestEffort = false } = {}) {
    if (!this.binding) return
    const identity = this.bindingIdentity()
    this.stopLoops()
    try {
      await this.client.unbind(identity)
    } catch (error) {
      if (!bestEffort) throw error
    } finally {
      this.binding = null
      this.revision = 0
      this.hash = null
      this.state({ synchronized: false })
    }
  }

  startHeartbeat() {
    if (!this.binding) return
    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(async () => {
      if (!this.binding) return
      this.heartbeatAbortController?.abort()
      this.heartbeatAbortController = new AbortController()
      try {
        await this.client.heartbeat(this.bindingIdentity(), {
          signal: this.heartbeatAbortController.signal,
        })
        this.state({ heartbeat: 'ok' })
      } catch (error) {
        if (error?.name === 'AbortError') return
        if (TERMINAL_BINDING_ERRORS.has(error?.code)) {
          this.stopLoops()
          this.binding = null
          this.state({ heartbeat: 'failed', synchronized: false, error: bridgeError(error) })
          return
        }
        this.state({ heartbeat: 'failed', error: bridgeError(error) })
      }
    }, HEARTBEAT_INTERVAL)
  }

  async pollCommands() {
    if (!this.binding || !this.running) return
    this.commandAbortController = new AbortController()
    try {
      const response = await this.client.commands(this.bindingIdentity(), {
        signal: this.commandAbortController.signal,
      })
      if (!this.binding || !this.running) return
      if (response.command) await this.handleCommand(response.command)
    } catch (error) {
      if (error?.name !== 'AbortError' && this.binding) {
        this.state({ commandPolling: 'failed', error: bridgeError(error) })
      }
    } finally {
      if (this.binding && this.running) {
        clearTimeout(this.commandPollTimer)
        this.commandPollTimer = setTimeout(() => this.pollCommands(), COMMAND_RETRY_INTERVAL)
      }
    }
  }

  async flushForCommand() {
    const result = await this.flushEditors()
    if (result?.busy) {
      const error = new Error('An editor interaction is still active.')
      error.code = 'EDITOR_BUSY'
      error.retryable = true
      throw error
    }
    if (result?.valid === false) {
      const error = new Error('An editor contains an invalid draft.')
      error.code = 'EDITOR_HAS_INVALID_DRAFT'
      error.details = result.details || {}
      throw error
    }
    await this.designCommands.flush?.()
  }

  async handleCommand(command) {
    let durableActionApplied = false
    try {
      await this.flushForCommand()
      await this.designCommands.runExclusive(async () => {
        let result
        let documentChanged = false
        if (command.base_revision !== this.revision) {
          const error = new Error('The browser revision changed before command execution.')
          error.code = 'REVISION_CONFLICT'
          error.retryable = true
          throw error
        }
        const payload = command.payload || {}
        if (payload.type === 'flush') {
          result = { summary: 'Editor drafts flushed.' }
        } else if (payload.type === 'design_get') {
          const encoded = await encodeCanonicalDesign(this.getProject())
          result = {
            project_name: this.getProjectName(),
            hash: encoded.hash,
            document: selectCanonicalDesignSections(encoded.document, payload.sections),
          }
        } else if (payload.type === 'validate') {
          result = await this.validateDesign(this.getProject())
        } else if (payload.type === 'design_command') {
          result = await this.designCommands.executeToolNow(
            payload.tool,
            payload.arguments,
            { origin: 'mcp' },
          )
          documentChanged = true
          durableActionApplied = true
        } else if (payload.type === 'simulation_action') {
          const action = this.simulationController[payload.action]
          if (typeof action !== 'function') {
            throw new Error(`Unknown simulation action: ${payload.action}`)
          }
          const accepted = await action(payload.duration)
          if (!accepted) {
            throw new Error(`Simulation action was not accepted: ${payload.action}`)
          }
          result = { summary: `Simulation ${payload.action} accepted.` }
          durableActionApplied = true
        } else {
          throw new Error(`Unknown browser command type: ${payload.type}`)
        }
        const encoded = await encodeCanonicalDesign(this.getProject())
        const canonicalChanged = encoded.hash !== this.hash
        documentChanged ||= canonicalChanged
        const response = await this.client.commit({
          ...this.bindingIdentity(),
          command_id: command.command_id,
          operation_id: command.operation_id,
          base_revision: command.base_revision,
          success: true,
          document_changed: documentChanged,
          snapshot: encoded.document,
          hash: encoded.hash,
          result,
        })
        this.revision = response.revision
        this.hash = encoded.hash
        this.state({ synchronized: true, lastCommand: command.command_id })
      })
    } catch (error) {
      if (durableActionApplied) {
        const identity = this.bindingIdentity()
        this.stopLoops()
        try {
          if (identity) await this.client.unbind(identity)
        } catch {
          // Lease expiry closes the backend wait if explicit unbinding cannot.
        }
        this.binding = null
        this.state({
          synchronized: false,
          error: bridgeError(error, 'OUTCOME_UNKNOWN'),
        })
        return
      }
      try {
        await this.client.commit({
          ...this.bindingIdentity(),
          command_id: command.command_id,
          operation_id: command.operation_id,
          base_revision: command.base_revision,
          success: false,
          error: bridgeError(error),
        })
      } catch {
        this.state({ synchronized: false })
      }
    }
  }

  async publishGuiCommit(summary = 'GUI design change') {
    if (!this.binding) return
    const encoded = await encodeCanonicalDesign(this.getProject())
    if (encoded.hash === this.hash) return
    const response = await this.client.commit({
      ...this.bindingIdentity(),
      origin: 'gui',
      base_revision: this.revision,
      summary,
      snapshot: encoded.document,
      hash: encoded.hash,
    })
    this.revision = response.revision
    this.hash = encoded.hash
    this.state({ synchronized: true })
  }

  stopLoops() {
    this.running = false
    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    this.commandAbortController?.abort()
    this.commandAbortController = null
    clearTimeout(this.commandPollTimer)
    this.commandPollTimer = null
    this.heartbeatAbortController?.abort()
    this.heartbeatAbortController = null
  }

  sendUnbindBeacon() {
    const identity = this.bindingIdentity()
    if (!identity || typeof navigator === 'undefined' || !navigator.sendBeacon) return false
    return navigator.sendBeacon(
      this.client.operationUrl('unbindMcpEditor'),
      new Blob([JSON.stringify(identity)], { type: 'application/json' }),
    )
  }

  dispose() {
    this.stopLoops()
    this.sendUnbindBeacon()
    this.binding = null
  }
}
