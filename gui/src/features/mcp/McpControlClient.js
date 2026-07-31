import { requestJson } from '../../utils/httpClient.js'

export class McpControlClient {
  constructor(baseUrl = '') {
    this.baseUrl = String(baseUrl).replace(/\/$/, '')
    this.headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
  }

  url(path) {
    return `${this.baseUrl}/_mcp${path}`
  }

  async request(path, { method = 'GET', body, signal } = {}) {
    return requestJson(this.url(path), {
      method,
      headers: this.headers,
      body,
      signal,
    })
  }

  status(options) {
    return this.request('/status', options)
  }

  start() {
    return this.request('/start', { method: 'POST', body: {} })
  }

  stop(bindingId = null) {
    return this.request('/stop', {
      method: 'POST',
      body: bindingId ? { binding_id: bindingId } : {},
    })
  }

  bind(binding) {
    return this.request('/editor/bind', { method: 'POST', body: binding })
  }

  unbind(binding) {
    return this.request('/editor/unbind', { method: 'POST', body: binding })
  }

  heartbeat(binding, options) {
    return this.request('/editor/heartbeat', {
      method: 'POST',
      body: binding,
      ...options,
    })
  }

  commands(binding, options = {}) {
    const query = new URLSearchParams({
      binding_id: binding.binding_id,
      generation: String(binding.generation),
    })
    return this.request(`/editor/commands?${query}`, options)
  }

  commit(payload, options) {
    return this.request('/editor/commit', {
      method: 'POST',
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
    return this.request(`/activity?${query}`, { signal })
  }

  clearActivity() {
    return this.request('/activity/clear', { method: 'POST', body: {} })
  }
}
