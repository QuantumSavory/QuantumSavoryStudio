import { test, expect } from '@playwright/test'
import { SLOT_TYPE_CATALOG } from '../catalogFixtures.js'
import { backendPlatformInfo } from '../platformInfoFixtures.js'

async function mockBackendMetadata(page) {
  await page.route('**/known_functions', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { known_functions: [] },
  }))
  await page.route('**/background_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { background_types: [] },
  }))
  await page.route('**/slot_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { slot_types: SLOT_TYPE_CATALOG },
  }))
  await page.route('**/protocol_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { protocol_types: [] },
  }))
  await page.route('**/states_zoo_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { states_zoo_types: [] },
  }))
  await page.route('**/simulation_log_groups', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: {
      simulation_log_groups: [
        'backend',
        'network',
        'protocol',
        'simulation',
        'visualization',
      ],
    },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: backendPlatformInfo(),
  }))
  await page.route('**/export_script', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: {
      success: true,
      script: 'using QuantumSavory\n\nsim = Simulation()\nrun(sim, 1.0)\n',
      filename: 'simulation.jl',
    },
  }))
}

async function loadApp(page) {
  await mockBackendMetadata(page)
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  const simulationLogGroupsLoaded = page.waitForResponse(
    response => response.url().endsWith('/simulation_log_groups') && response.ok(),
  )
  await page.goto('/')
  await Promise.all([protocolTypesLoaded, simulationLogGroupsLoaded])
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function replaceApplicationLogs(page, logs) {
  await page.evaluate(newLogs => {
    const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const applicationLogs = setupState?.applicationLogs?.value ?? setupState?.applicationLogs
    if (!Array.isArray(applicationLogs)) {
      throw new Error('Reactive application logs are unavailable')
    }

    applicationLogs.splice(0, applicationLogs.length, ...newLogs)
  }, logs.map((log, index) => ({
    id: `bottom_panel_log_${index}`,
    timestamp: '2025-01-01T00:00:00.000Z',
    message: `Log ${index}`,
    source: 'Test',
    count: 1,
    ...log,
  })))
}

async function replaceProjectNodes(page, names) {
  await page.evaluate(nodeNames => {
    const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const projectData = setupState?.projectData?.value ?? setupState?.projectData
    if (!Array.isArray(projectData?.net?.nodes)) {
      throw new Error('Reactive project nodes are unavailable')
    }
    projectData.net.nodes.splice(0, projectData.net.nodes.length, ...nodeNames.map((name, index) => ({
      id: `node_${index + 1}`,
      name,
      position: [-72 + index, 42],
      data: { slots: [], protocols: [] },
    })))
  }, names)
}

test.describe('Bottom panel logs', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page)
  })

  test('keeps level counters in the Logs tab and preserves empty-log behavior', async ({ page }) => {
    const panel = page.locator('#logsPanel')
    const panelHeader = panel.locator('.panel-title')
    const logsTab = page.locator('#bottom-panel-logs-tab')

    await expect(panelHeader.locator('.panel-title-text-title')).toHaveText('Tools')
    await expect(panelHeader).not.toContainText('Logs, Variables, and Layout Tools')
    await expect(panelHeader.locator('.log-count-badge')).toHaveCount(0)
    await expect(logsTab.locator('.log-count-badge')).toHaveCount(0)
    await expect(panel.locator('.empty-logs')).toHaveText('No logs available')

    await replaceApplicationLogs(page, [
      { level: 'info', count: 9 },
      { level: 'trace' },
      { level: null },
      { level: 'warning' },
      { level: 'WARN' },
      { level: 'error' },
      { level: 'success' },
      { level: 'debug' },
    ])

    const expectedBadges = [
      { level: 'info', count: 3 },
      { level: 'warning', count: 2 },
      { level: 'error', count: 1 },
      { level: 'success', count: 1 },
      { level: 'debug', count: 1 },
    ]

    await expect(panel.locator('.log-count-badge')).toHaveCount(expectedBadges.length)
    await expect(logsTab.locator('.log-count-badge')).toHaveCount(expectedBadges.length)
    await expect(panelHeader.locator('.log-count-badge')).toHaveCount(0)
    await expect(page.locator('#bottom-panel-variables-tab .log-count-badge')).toHaveCount(0)
    await expect(page.locator('#bottom-panel-description-tab .log-count-badge')).toHaveCount(0)
    await expect(page.locator('#bottom-panel-states-zoo-tab .log-count-badge')).toHaveCount(0)
    await expect(page.locator('#bottom-panel-layout-tools-tab .log-count-badge')).toHaveCount(0)
    await expect(page.locator('#bottom-panel-export-script-tab .log-count-badge')).toHaveCount(0)

    for (const { level, count } of expectedBadges) {
      const badge = logsTab.locator(`.badge-${level}`)
      const accessibleText = `${count} ${level} logs`
      await expect(badge).toHaveText(String(count))
      await expect(badge).toHaveAttribute('aria-label', accessibleText)
      await expect(badge).toHaveAttribute('title', accessibleText)
      await expect(badge).toHaveClass(new RegExp(`\\bbadge-${level}\\b`))
    }

    await panel.getByRole('button', { name: 'Clear' }).click()
    await expect(logsTab.locator('.log-count-badge')).toHaveCount(0)
    await expect(panel.locator('.empty-logs')).toHaveText('No logs available')
  })

  test('composes severity, source, and Simulator group filters', async ({ page }) => {
    const panel = page.locator('#logsPanel')
    const logEntries = panel.getByRole('article')
    const bottomTabs = panel.locator('.bottom-tabs').getByRole('tab')

    await expect(bottomTabs).toHaveCount(7)
    await replaceApplicationLogs(page, [
      {
        level: 'info',
        source: 'Map',
        message: 'Map interaction completed',
      },
      {
        level: 'warning',
        source: 'Backend',
        message: 'Web request needs attention',
      },
      {
        level: 'warning',
        source: 'QuantumSavory',
        group: 'protocol',
        message: 'Protocol retry scheduled',
      },
      {
        level: 'error',
        source: 'Simulator',
        group: 'network',
        message: 'Network delivery failed',
      },
    ])

    await expect(logEntries).toHaveCount(4)

    await panel.locator('.log-filters summary').click()
    for (const group of [
      'backend',
      'network',
      'protocol',
      'simulation',
      'visualization',
    ]) {
      await expect(panel.getByLabel(group, { exact: true })).toBeAttached()
    }

    const protocolLog = panel.getByRole('article', {
      name: 'warning log from Simulator · Protocol',
      exact: true,
    })
    await expect(protocolLog.locator('.log-source')).toHaveText('[Simulator · Protocol]')
    await protocolLog.getByRole('button', {
      name: 'Show raw JSON for Simulator · Protocol log',
      exact: true,
    }).click()
    await expect(protocolLog.locator('[aria-label="Raw log JSON"]'))
      .toContainText('"group": "protocol"')

    const warningFilter = panel.getByLabel('Warning', { exact: true })
    const simulatorFilter = panel.getByLabel('Simulator', { exact: true })
    const protocolFilter = panel.getByLabel('protocol', { exact: true })

    await warningFilter.check()
    await expect(logEntries).toHaveCount(2)
    await expect(panel.getByText('Web request needs attention', { exact: true })).toBeVisible()
    await expect(panel.getByText('Protocol retry scheduled', { exact: true })).toBeVisible()

    await simulatorFilter.check()
    await expect(logEntries).toHaveCount(1)
    await expect(panel.getByText('Protocol retry scheduled', { exact: true })).toBeVisible()

    await protocolFilter.check()
    await expect(logEntries).toHaveCount(1)
    await expect(panel.locator('.log-match-count')).toHaveText('1 matching / 4 total')
  })

  test('retains roving focus and keyboard tab selection', async ({ page }) => {
    const logsTab = page.locator('#bottom-panel-logs-tab')
    const descriptionTab = page.locator('#bottom-panel-description-tab')
    const variablesTab = page.locator('#bottom-panel-variables-tab')
    const statesZooTab = page.locator('#bottom-panel-states-zoo-tab')
    const layoutToolsTab = page.locator('#bottom-panel-layout-tools-tab')
    const exportScriptTab = page.locator('#bottom-panel-export-script-tab')
    const tagsQueriesTab = page.locator('#bottom-panel-tags-queries-tab')

    await expect(page.locator('#logsPanel .bottom-tabs').getByRole('tab')).toHaveText([
      /Logs/,
      'Description',
      'Variables',
      'States Zoo',
      'Layout Tools',
      'Export Script',
      'Tags & Queries',
    ])
    await expect(logsTab).toHaveAttribute('aria-selected', 'true')
    await expect(logsTab).toHaveAttribute('tabindex', '0')
    await expect(descriptionTab).toHaveAttribute('tabindex', '-1')
    await expect(variablesTab).toHaveAttribute('tabindex', '-1')
    await expect(statesZooTab).toHaveAttribute('tabindex', '-1')
    await expect(layoutToolsTab).toHaveAttribute('tabindex', '-1')
    await expect(exportScriptTab).toHaveAttribute('tabindex', '-1')
    await expect(tagsQueriesTab).toBeDisabled()
    await expect(tagsQueriesTab).toHaveAttribute('aria-disabled', 'true')

    await logsTab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(descriptionTab).toBeFocused()
    await expect(descriptionTab).toHaveAttribute('aria-selected', 'true')
    await expect(descriptionTab).toHaveAttribute('tabindex', '0')
    await expect(descriptionTab).toHaveAttribute('aria-controls', 'bottom-panel-description-content')
    await expect(page.locator('#bottom-panel-description-content')).toBeVisible()
    await expect(page.locator('#bottom-panel-description-content')).toHaveAttribute(
      'aria-labelledby',
      'bottom-panel-description-tab',
    )

    await page.keyboard.press('ArrowRight')
    await expect(variablesTab).toBeFocused()
    await expect(variablesTab).toHaveAttribute('aria-selected', 'true')
    await expect(variablesTab).toHaveAttribute('tabindex', '0')
    await expect(page.locator('#bottom-panel-variables-content')).toBeVisible()

    await page.keyboard.press('ArrowRight')
    await expect(statesZooTab).toBeFocused()
    await expect(statesZooTab).toHaveAttribute('aria-selected', 'true')
    await expect(statesZooTab).toHaveAttribute('tabindex', '0')
    await expect(statesZooTab).toHaveAttribute('aria-controls', 'bottom-panel-states-zoo-content')
    await expect(page.locator('#bottom-panel-states-zoo-content')).toBeVisible()
    await expect(page.locator('#bottom-panel-states-zoo-content')).toHaveAttribute(
      'aria-labelledby',
      'bottom-panel-states-zoo-tab',
    )

    await page.keyboard.press('ArrowRight')
    await expect(layoutToolsTab).toBeFocused()
    await expect(layoutToolsTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#bottom-panel-layout-tools-content')).toBeVisible()

    await page.keyboard.press('End')
    await expect(exportScriptTab).toBeFocused()
    await expect(exportScriptTab).toHaveAttribute('aria-selected', 'true')
    await expect(exportScriptTab).toHaveAttribute('aria-controls', 'bottom-panel-export-script-content')
    await expect(page.locator('#bottom-panel-export-script-content')).toBeVisible()
    await expect(page.locator('#bottom-panel-export-script-content')).toHaveAttribute(
      'aria-labelledby',
      'bottom-panel-export-script-tab',
    )

    await page.keyboard.press('Home')
    await expect(logsTab).toBeFocused()
    await expect(logsTab).toHaveAttribute('aria-selected', 'true')
    await expect(logsTab).toHaveAttribute('tabindex', '0')
    await expect(page.locator('#bottom-panel-logs-content')).toBeVisible()

    await page.keyboard.press('ArrowLeft')
    await expect(exportScriptTab).toBeFocused()
    await expect(exportScriptTab).toHaveAttribute('aria-selected', 'true')
  })

  test('filters structured pair events without changing Logs-tab severity counts', async ({ page }) => {
    await replaceProjectNodes(page, ['Amherst', 'Cambridge', 'Boston'])
    await replaceApplicationLogs(page, [
      {
        id: 'pair-a',
        level: 'debug',
        source: 'Simulator',
        message: 'Entangled a pair',
        raw: {
          group: 'protocol',
          event: 'pair_entangled',
          sim_time: 1,
          protocol: 'EntanglerProt',
          nodes: [1, 2],
        },
      },
      {
        id: 'pair-b',
        level: 'warning',
        source: 'Simulator',
        message: 'Entangled a pair',
        raw: {
          group: 'protocol',
          event: 'pair_entangled',
          sim_time: 2,
          protocol: 'CustomProtocol',
          nodes: [2, 3],
        },
      },
      {
        id: 'network-event',
        level: 'error',
        source: 'Simulator',
        message: 'Forwarded a message',
        raw: {
          group: 'network',
          event: 'message_forwarded',
          sim_time: 2,
          protocol: 'RoutingProtocol',
          src_node: 1,
          dst_node: 3,
        },
      },
    ])

    const panel = page.locator('#logsPanel')
    const logsTab = page.locator('#bottom-panel-logs-tab')
    await panel.locator('.log-filters summary').click()
    await panel.getByLabel('Debug', { exact: true }).check()
    await panel.getByLabel('Warning', { exact: true }).check()
    await panel.getByLabel('Simulator', { exact: true }).check()
    await panel.getByLabel('protocol', { exact: true }).check()
    await panel.getByLabel('pair_entangled', { exact: true }).check()
    await panel.getByLabel('Cambridge', { exact: true }).check()
    await panel.getByLabel('Simulated time from').fill('1')
    await panel.getByLabel('Simulated time to').fill('2')

    await expect(panel.locator('.log-entry-container')).toHaveCount(2)
    await expect(panel.locator('.log-match-count')).toHaveText('2 matching / 3 total')
    await panel.getByLabel('CustomProtocol', { exact: true }).check()
    await expect(panel.locator('.log-entry-container')).toHaveCount(1)
    await expect(panel.locator('.log-entry-container')).toHaveAttribute('data-log-id', 'pair-b')

    await expect(logsTab.locator('.badge-debug')).toHaveText('1')
    await expect(logsTab.locator('.badge-warning')).toHaveText('1')
    await expect(logsTab.locator('.badge-error')).toHaveText('1')

    await panel.locator('.log-filters summary').click()
    await panel.getByRole('button', { name: 'Clear all' }).click()
    await expect(panel.locator('.log-entry-container')).toHaveCount(3)
    await expect(panel.locator('.log-match-count')).toHaveText('3 matching / 3 total')
  })
})
