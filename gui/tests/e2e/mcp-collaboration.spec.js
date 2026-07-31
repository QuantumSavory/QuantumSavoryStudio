import { expect, test } from '@playwright/test'

const BACKEND_PORT = Number(process.env.WEBQUANTUMSAVORY_CI_SERVER_PORT || 8000)
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`
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
      expect(toolNames).toContain('topology_edit')
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
      const readResource = async uri => {
        const result = await rpc({
          jsonrpc: '2.0',
          id: requestId++,
          method: 'resources/read',
          params: { uri },
        }, sessionId)
        expect(result.response.status).toBe(200)
        return result.body.result.contents[0]
      }

      const initialDesign = await callTool('design_get')
      expect(initialDesign.isError).toBe(false)
      expect(initialDesign.structuredContent.revision).toBe(0)

      const topology = await callTool('topology_edit', {
        expected_revision: 0,
        actions: [
          {
            action: 'create_node',
            client_ref: 'left',
            value: { name: 'Agent Left', position: [-10, 0] },
          },
          {
            action: 'create_node',
            client_ref: 'right',
            value: { name: 'Agent Right', position: [10, 0] },
          },
          {
            action: 'create_edge',
            client_ref: 'link',
            value: {
              source: { client_ref: 'left' },
              target: { client_ref: 'right' },
              isLogic: false,
            },
          },
        ],
      })
      expect(topology.isError).toBe(false)
      expect(topology.structuredContent.revision).toBe(1)
      expect(topology.structuredContent.created_ids).toMatchObject({
        left: expect.any(String),
        right: expect.any(String),
        link: expect.any(String),
      })
      await expect(page.locator('.node-list-item')).toHaveCount(2)
      await expect(page.locator('.node-list-item')).toContainText(['Agent Left', 'Agent Right'])
      await expect(page.locator('.edge-list-item')).toHaveCount(1)

      const incompleteRun = await callTool('simulation_run', {
        duration: 0.001,
      })
      expect(incompleteRun.isError).toBe(true)
      expect(incompleteRun.structuredContent).toMatchObject({
        code: 'SIMULATION_DESIGN_INVALID',
        message: 'The design is not ready for simulation.',
        details: {
          issues: [
            {
              code: 'NODE_MISSING_SLOT',
              message: 'Agent Left requires at least one slot',
              details: { node_name: 'Agent Left' },
            },
            {
              code: 'NODE_MISSING_SLOT',
              message: 'Agent Right requires at least one slot',
              details: { node_name: 'Agent Right' },
            },
          ],
        },
      })

      const slots = await callTool('slots_edit', {
        expected_revision: 1,
        actions: [
          {
            action: 'create',
            node_id: topology.structuredContent.created_ids.left,
            client_ref: 'left-slot',
            value: { type: 'Qubit' },
          },
          {
            action: 'create',
            node_id: topology.structuredContent.created_ids.right,
            client_ref: 'right-slot',
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
      const protocol = await callTool('protocols_edit', {
        expected_revision: 2,
        actions: [{
          action: 'create',
          placement: 'edge',
          owner_id: topology.structuredContent.created_ids.link,
          client_ref: 'entangler',
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

      const stale = await callTool('topology_edit', {
        expected_revision: 3,
        actions: [{
          action: 'update_node',
          node_id: topology.structuredContent.created_ids.left,
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

      const running = await callTool('simulation_run', {
        duration: 0.001,
      })
      expect(running.isError).toBe(false)
      expect(running.structuredContent.prepared_revision).toBe(4)
      await expect.poll(async () => {
        const status = await callTool('simulation_status')
        return {
          phase: status.structuredContent.phase,
          prepared: status.structuredContent.prepared_source_revision,
        }
      }, { timeout: 15_000 }).toMatchObject({
        phase: expect.stringMatching(/^(running|completed)$/),
        prepared: 4,
      })

      const protocolResult = await callTool('simulation_protocol_result', {
        protocol_id: protocol.structuredContent.created_ids.entangler,
      })
      expect(protocolResult.isError).toBe(false)
      expect(protocolResult.content.map(item => item.type)).toEqual([
        'text',
        'resource_link',
        'resource_link',
      ])
      const protocolHtml = await readResource(
        protocolResult.structuredContent.resources.html,
      )
      expect(protocolHtml).toMatchObject({
        mimeType: 'text/html',
        uri: protocolResult.structuredContent.resources.html,
      })
      expect(protocolHtml.text.length).toBeGreaterThan(0)
      const protocolPng = await readResource(
        protocolResult.structuredContent.resources.png,
      )
      expect(protocolPng).toMatchObject({
        mimeType: 'image/png',
        uri: protocolResult.structuredContent.resources.png,
      })
      expect(Buffer.from(protocolPng.blob, 'base64').subarray(0, 8))
        .toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

      const resetAfterMcpRun = await callTool('simulation_reset')
      expect(resetAfterMcpRun.isError).toBe(false)
      await expect(page.locator('#runnerPanel .stop-btn')).toBeDisabled()

      const guiRunAccepted = page.waitForResponse(
        response => response.url().endsWith('/run_simulation')
          && response.status() === 202,
      )
      await expect(page.locator('#runnerPanel .run-btn')).toBeEnabled()
      await page.locator('#runnerPanel .run-btn').click()
      await guiRunAccepted
      await expect.poll(async () => {
        const status = await callTool('simulation_status')
        return status.structuredContent.prepared_source_revision
      }, { timeout: 15_000 }).toBe(4)

      const resetAfterGuiRun = await callTool('simulation_reset')
      expect(resetAfterGuiRun.isError).toBe(false)

      const prepared = await callTool('simulation_prepare')
      expect(prepared.isError).toBe(false)
      expect(prepared.structuredContent.prepared_revision).toBe(4)
      await expect(page.locator('#runnerPanel .stop-btn')).toBeEnabled()

      const reset = await callTool('simulation_reset')
      expect(reset.isError).toBe(false)
      await expect(page.locator('#runnerPanel .stop-btn')).toBeDisabled()

      await expect(panel.locator('.mcp-activity')).toContainText('topology_edit', {
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
