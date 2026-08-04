import { expect, test } from '@playwright/test'

const BACKEND_URL = 'http://127.0.0.1:8000'
const MCP_PORT = Number(process.env.WEBQUANTUMSAVORY_MCP_PORT || 8001)
const MCP_URL = `http://127.0.0.1:${MCP_PORT}/mcp`
const PROTOCOL_VERSION = '2025-06-18'

async function rpc(message, sessionId = null) {
  const headers = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    Origin: `http://127.0.0.1:${MCP_PORT}`,
  }
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId
    headers['MCP-Protocol-Version'] = PROTOCOL_VERSION
  }
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  })
  const text = await response.text()
  return {
    response,
    body: text ? JSON.parse(text) : null,
  }
}

async function initializeClient(requestId) {
  const initialized = await rpc({
    jsonrpc: '2.0',
    id: requestId,
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'webquantumsavory-browser-e2e',
        version: '1.0.0',
      },
    },
  })
  expect(initialized.response.status).toBe(200)
  expect(initialized.body.result.protocolVersion).toBe(PROTOCOL_VERSION)
  const sessionId = initialized.response.headers.get('mcp-session-id')
  expect(sessionId).toBeTruthy()

  const notification = await rpc({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  }, sessionId)
  expect(notification.response.status).toBe(202)
  return sessionId
}

test.describe('Local MCP collaboration', () => {
  test.skip(
    process.env.WEBQUANTUMSAVORY_ENABLE_MCP !== 'true',
    'The real sidecar scenario runs only when the local MCP gate is enabled.',
  )

  test('shares live design, revision, lifecycle, activity, and restart state', async ({ page }) => {
    test.setTimeout(180_000)
    let requestId = 10
    let sessionId = null

    await page.goto('/')
    await expect(page.locator('#app')).toBeVisible()
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

    await page.locator('.hamburger-btn').click()
    await page.getByText('New', { exact: true }).click()
    await expect(page.locator('.modal-dialog')).toBeVisible()
    await page.locator('input[placeholder="Project name"]').fill('MCP Browser E2E')
    await page.locator('.modal-dialog button.primary').click()
    await expect(page.locator('.modal-dialog')).not.toBeVisible()

    const mcpTab = page.getByRole('tab', { name: 'MCP', exact: true })
    await expect(mcpTab).toBeVisible({ timeout: 15_000 })
    await mcpTab.click()
    const panel = page.locator('#bottom-panel-mcp-content')
    const statusValue = label => panel
      .locator('.mcp-status-grid dt')
      .filter({ hasText: new RegExp(`^${label}$`) })
      .locator('..')
      .locator('dd')

    try {
      await panel.getByRole('button', { name: 'Initialize MCP' }).click()
      await expect(statusValue('Listener')).toHaveText('running', { timeout: 30_000 })
      await expect(statusValue('Project')).toHaveText('MCP Browser E2E')
      await expect(statusValue('Synchronization')).toHaveText('Synchronized')
      await expect(statusValue('Revision')).toHaveText('0')
      await expect(statusValue('Endpoint')).toContainText(MCP_URL)

      sessionId = await initializeClient(requestId++)
      const tools = await rpc({
        jsonrpc: '2.0',
        id: requestId++,
        method: 'tools/list',
        params: {},
      }, sessionId)
      expect(tools.response.status).toBe(200)
      const toolNames = tools.body.result.tools.map(tool => tool.name)
      expect(toolNames).toHaveLength(15)
      expect(toolNames).toContain('design_edit')
      expect(toolNames).not.toContain('topology_edit')
      expect(toolNames).not.toContain('design_transaction')
      expect(toolNames).toContain('simulation_run')

      const callTool = async (name, args = {}) => {
        const result = await rpc({
          jsonrpc: '2.0',
          id: requestId++,
          method: 'tools/call',
          params: { name, arguments: args },
        }, sessionId)
        expect(result.response.status).toBe(200)
        return result.body.result
      }

      const initialDesign = await callTool('design_get')
      expect(initialDesign.isError).toBe(false)
      expect(initialDesign.structuredContent.revision).toBe(0)
      expect(initialDesign.structuredContent.document).toMatchObject({
        schemaVersion: 2,
        name: 'MCP Browser E2E',
        annotations: [],
        variables: [],
        simulationConfig: expect.any(Object),
        net: expect.any(Object),
      })
      expect(initialDesign.structuredContent.document).not.toHaveProperty('map')

      const topology = await callTool('design_edit', {
        operation_id: 'browser-e2e-topology',
        expected_revision: 0,
        operations: [
          {
            kind: 'topology.create_node',
            id: 'node-left',
            value: { name: 'Agent Left', position: [-10, 0] },
          },
          {
            kind: 'topology.create_node',
            id: 'node-right',
            value: { name: 'Agent Right', position: [10, 0] },
          },
          {
            kind: 'topology.create_edge',
            id: 'edge-link',
            value: {
              source: 'node-left',
              target: 'node-right',
              isLogic: false,
            },
          },
        ],
      })
      expect(topology.isError).toBe(false)
      expect(topology.structuredContent.revision).toBe(1)
      expect(topology.structuredContent.affected_ids)
        .toEqual(expect.arrayContaining(['node-left', 'node-right', 'edge-link']))
      await expect(page.locator('.node-list-item')).toHaveCount(2)
      await expect(page.locator('.node-list-item')).toContainText(['Agent Left', 'Agent Right'])
      await expect(page.locator('.edge-list-item')).toHaveCount(1)

      const slots = await callTool('design_edit', {
        operation_id: 'browser-e2e-slots',
        expected_revision: 1,
        operations: [
          {
            kind: 'slots.create',
            id: 'slot-left',
            node_id: 'node-left',
            value: { type: 'Qubit' },
          },
          {
            kind: 'slots.create',
            id: 'slot-right',
            node_id: 'node-right',
            value: { type: 'Qubit' },
          },
        ],
      })
      expect(slots.isError).toBe(false)
      expect(slots.structuredContent.revision).toBe(2)
      await expect(page.locator('.node-list-slotcount')).toContainText(['1 slots', '1 slots'])
      await expect(statusValue('Project state')).toHaveText('Unsaved changes')

      const protocolCatalog = await callTool('catalog_list', { kind: 'protocols' })
      const entangler = protocolCatalog.structuredContent.protocols.find(entry => (
        entry.placement === 'edge' && entry.type.endsWith('.EntanglerProt')
      ))
      expect(entangler).toBeTruthy()
      const protocol = await callTool('design_edit', {
        operation_id: 'browser-e2e-protocol',
        expected_revision: 2,
        operations: [{
          kind: 'protocols.create',
          id: 'protocol-entangler',
          placement: 'edge',
          owner_id: 'edge-link',
          value: { type: entangler.type },
        }],
      })
      expect(protocol.isError).toBe(false)
      expect(protocol.structuredContent.revision).toBe(3)

      await page.getByRole('tab', { name: 'Description' }).click()
      const description = page.getByTestId('description-panel')
      await description.getByRole('button', { name: 'Edit project description' }).click()
      await description
        .getByRole('textbox', { name: 'Project description in Markdown' })
        .fill('GUI revision between MCP reads.')
      await description.getByRole('button', { name: 'Save project description' }).click()
      await mcpTab.click()
      await expect(statusValue('Revision')).toHaveText('4', { timeout: 10_000 })
      await expect.poll(async () => {
        const response = await fetch(`${BACKEND_URL}/_mcp/activity?cursor=0&limit=500`)
        expect(response.status).toBe(200)
        const { activity } = await response.json()
        const guiCommit = activity.find(entry => (
          entry.phase === 'gui_commit' && entry.revision_after === 4
        ))
        return guiCommit?.summary || null
      }, { timeout: 10_000 }).toBe('GUI applied 1 design operation.')
      const activityResponse = await fetch(`${BACKEND_URL}/_mcp/activity?cursor=0&limit=500`)
      const { activity } = await activityResponse.json()
      expect(activity.map(entry => entry.summary))
        .not.toContain('Unclassified GUI design change')

      const stale = await callTool('design_edit', {
        operation_id: 'browser-e2e-stale',
        expected_revision: 3,
        operations: [{
          kind: 'topology.update_node',
          node_id: 'node-left',
          value: { name: 'Stale Agent Left' },
        }],
      })
      expect(stale.isError).toBe(true)
      expect(stale.structuredContent).toMatchObject({
        code: 'REVISION_CONFLICT',
        retryable: true,
        current_revision: 4,
      })
      await expect(page.locator('.node-list-item').first()).toContainText('Agent Left')

      const currentDesign = await callTool('design_get')
      expect(currentDesign.structuredContent.revision).toBe(4)
      expect(currentDesign.structuredContent.document.description)
        .toBe('GUI revision between MCP reads.')

      const prepared = await callTool('simulation_prepare', {
        operation_id: 'browser-e2e-prepare',
      })
      expect(prepared.isError).toBe(false)
      await expect(page.locator('#runnerPanel .stop-btn')).toBeEnabled()

      const running = await callTool('simulation_run', {
        operation_id: 'browser-e2e-run',
        duration: 0.001,
      })
      expect(running.isError).toBe(false)
      await expect.poll(async () => {
        const status = await callTool('simulation_status')
        return status.structuredContent.phase
      }, { timeout: 15_000 }).toMatch(/^(running|completed)$/)

      const reset = await callTool('simulation_reset', {
        operation_id: 'browser-e2e-reset',
      })
      expect(reset.isError).toBe(false)
      await expect(page.locator('#runnerPanel .stop-btn')).toBeDisabled()

      await expect(panel.locator('.mcp-activity')).toContainText('design_edit', {
        timeout: 10_000,
      })
      await expect(panel.locator('.mcp-activity')).toContainText('simulation_reset')
      await expect(statusValue('Agent')).toHaveText(/^(Session initialized|Last request)/)

      const firstSession = sessionId
      await panel.getByRole('button', { name: 'Stop MCP' }).click()
      await expect(statusValue('Listener')).toHaveText('stopped', { timeout: 15_000 })
      await expect(statusValue('Project')).toHaveText('No project bound')

      await panel.getByRole('button', { name: 'Initialize MCP' }).click()
      await expect(statusValue('Listener')).toHaveText('running', { timeout: 30_000 })
      await expect(statusValue('Project')).toHaveText('MCP Browser E2E')
      sessionId = await initializeClient(requestId++)
      expect(sessionId).not.toBe(firstSession)
    } finally {
      const stopButton = panel.getByRole('button', { name: 'Stop MCP' })
      if (await stopButton.isVisible().catch(() => false)) {
        await stopButton.click()
        await expect(statusValue('Listener')).toHaveText('stopped', { timeout: 15_000 })
      } else {
        await fetch(`${BACKEND_URL}/_mcp/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }).catch(() => {})
      }
    }
  })
})
