import { requestJson } from '../../utils/httpClient.js'
import {
  httpOperation,
  httpOperationPath,
} from '../../utils/httpOperations.js'

export class McpControlClient {
  constructor(baseUrl = '') {
    this.baseUrl = String(baseUrl).replace(/\/$/, '')
    this.headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
  }

  operationUrl(operationId, options = {}) {
    return `${this.baseUrl}${httpOperationPath(operationId, options)}`
  }

  async request(operationId, { query, body, signal } = {}) {
    const operation = httpOperation(operationId)
    return requestJson(this.operationUrl(operationId, { query }), {
      method: operation.method,
      headers: this.headers,
      body,
      signal,
    })
  }

  status(options) {
    return this.request('getMcpStatus', options)
  }

  start() {
    return this.request('startMcp', { body: {} })
  }

  stop(bindingId = null) {
    return this.request('stopMcp', {
      body: bindingId ? { binding_id: bindingId } : {},
    })
  }

  bind(binding) {
    return this.request('bindMcpEditor', { body: binding })
  }

  unbind(binding) {
    return this.request('unbindMcpEditor', { body: binding })
  }

  heartbeat(binding, options) {
    return this.request('heartbeatMcpEditor', {
      body: binding,
      ...options,
    })
  }

  commands(binding, options = {}) {
    const query = new URLSearchParams({
      binding_id: binding.binding_id,
      generation: String(binding.generation),
    })
    return this.request('pollMcpEditorCommands', { query, ...options })
  }

  commit(payload, options) {
    return this.request('commitMcpEditorCommand', {
      body: payload,
      ...options,
    })
  }

  activity({ cursor = 0, limit = 100, category, status, signal } = {}) {
    const query = new URLSearchParams({
      cursor: String(cursor),
      limit: String(limit),
    })
    if (category) query.set('category', category)
    if (status) query.set('status', status)
    return this.request('getMcpActivity', { query, signal })
  }

  clearActivity() {
    return this.request('clearMcpActivity', { body: {} })
  }
}
