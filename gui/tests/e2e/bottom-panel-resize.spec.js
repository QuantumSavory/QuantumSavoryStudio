import { expect, test } from '@playwright/test'

const PANEL_SIZE_STORAGE_KEY = 'bottomPanel_size'
const BOTTOM_PANEL_COLLAPSED_STORAGE_KEY = 'panelCollapsed_logs_panel'
const SELECTED_PANEL_STORAGE_KEY = 'panelCollapsed_selected_element'
const LEGACY_SELECTED_PANEL_STORAGE_KEYS = [
  'panelCollapsed_node_panel',
  'panelCollapsed_edge_panel',
  'panelCollapsed_void_panel',
]

async function mockBackend(page) {
  await page.route('http://localhost:8000/**', route => {
    const requestPath = new URL(route.request().url()).pathname
    const responses = {
      '/known_functions': { known_functions: [] },
      '/background_types': { background_types: [] },
      '/slot_types': { slot_types: ['Qubit', 'Qumode'] },
      '/protocol_types': { protocol_types: [] },
      '/states_zoo_types': { states_zoo_types: [] },
      '/platform_info': {
        versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
        capabilities: { unsafe_code_evaluation: false },
      },
      '/export_script': {
        success: true,
        script: 'using QuantumSavory\nrun(Simulation(), 1.0)\n',
        filename: 'resize-test.jl',
      },
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: responses[requestPath] || { success: true, logs: [], count: 0 },
    })
  })
}

async function loadApp(page) {
  await mockBackend(page)
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  await page.goto('/')
  await protocolTypesLoaded
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function bounds(locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected element to have a bounding box')
  return box
}

async function dragFrom(page, x, y, deltaX, deltaY) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 5 })
  await page.mouse.up()
}

function expectNear(actual, expected, tolerance = 2) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

test.describe('Resizable bottom Tools panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
  })

  test('resizes from the top and right while preserving its bottom-left anchor', async ({ page }) => {
    await loadApp(page)

    const resizer = page.locator('#bottom-panel-resizer')
    const initial = await bounds(resizer)
    const resizePanes = resizer.locator('[data-testid="resize-bounding-pane"]')

    await expect(resizePanes).toHaveCount(2)
    await expect(resizer.locator('[data-testid="resize-bounding-knob"]')).toHaveCount(0)

    const paneDimensions = await resizePanes.evaluateAll(panes => (
      panes.map((pane, index) => {
        const { width, height } = pane.getBoundingClientRect()
        return { index, width, height }
      })
    ))
    const topPane = resizePanes.nth(paneDimensions.find(pane => pane.width > pane.height).index)
    const rightPane = resizePanes.nth(paneDimensions.find(pane => pane.height > pane.width).index)

    await topPane.hover()
    await expect(topPane).toHaveCSS('cursor', 'ns-resize')
    await expect(topPane.locator('[data-testid="resize-bounding-splitter"]'))
      .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await rightPane.hover()
    await expect(rightPane).toHaveCSS('cursor', 'ew-resize')
    await expect(rightPane.locator('[data-testid="resize-bounding-splitter"]'))
      .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

    await dragFrom(page, initial.x + initial.width / 2, initial.y + 1, 0, -120)
    const taller = await bounds(resizer)

    expect(taller.height).toBeGreaterThan(initial.height + 100)
    expectNear(taller.x, initial.x)
    expectNear(taller.y + taller.height, initial.y + initial.height)
    expectNear(taller.width, initial.width)

    await dragFrom(page, taller.x + taller.width - 1, taller.y + taller.height / 2, 140, 0)
    const wider = await bounds(resizer)

    expect(wider.width).toBeGreaterThan(taller.width + 120)
    expectNear(wider.x, initial.x)
    expectNear(wider.y + wider.height, initial.y + initial.height)
    expectNear(wider.height, taller.height)
  })

  test('persists completed dimensions and restores them after reload', async ({ page }) => {
    await loadApp(page)

    const resizer = page.locator('#bottom-panel-resizer')
    const initial = await bounds(resizer)
    await dragFrom(page, initial.x + initial.width - 1, initial.y + initial.height / 2, 110, 0)
    const resizedWidth = await bounds(resizer)
    await dragFrom(page, resizedWidth.x + resizedWidth.width / 2, resizedWidth.y + 1, 0, -90)
    const resized = await bounds(resizer)

    const savedSize = await page.evaluate(storageKey => (
      JSON.parse(localStorage.getItem(storageKey))
    ), PANEL_SIZE_STORAGE_KEY)
    expectNear(savedSize.width, resized.width)
    expectNear(savedSize.height, resized.height)

    await page.reload()
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
    const restored = await bounds(resizer)
    expectNear(restored.width, resized.width)
    expectNear(restored.height, resized.height)
    expectNear(restored.x, resized.x)
    expectNear(restored.y + restored.height, 1080)
  })

  test('stays compact while collapsed and restores its expanded size', async ({ page }) => {
    await loadApp(page)

    const resizer = page.locator('#bottom-panel-resizer')
    const initial = await bounds(resizer)
    await dragFrom(page, initial.x + initial.width / 2, initial.y + 1, 0, -80)
    const expanded = await bounds(resizer)

    const collapseToggle = page.locator('#logsPanel .panel-title.collapsable')
    await expect(collapseToggle).toHaveAttribute('role', 'button')
    await expect(collapseToggle).toHaveAttribute('aria-expanded', 'true')
    await collapseToggle.focus()
    await page.keyboard.press('Enter')
    const collapsed = await bounds(resizer)
    await expect(collapseToggle).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(() => page.evaluate(
      key => localStorage.getItem(key),
      BOTTOM_PANEL_COLLAPSED_STORAGE_KEY
    )).toBe('true')
    expectNear(collapsed.height, 36)
    expectNear(collapsed.x, expanded.x)
    expectNear(collapsed.y + collapsed.height, expanded.y + expanded.height)
    await expect(resizer.locator('[data-testid="resize-bounding-pane"]')).toHaveCount(0)
    await expect(page.getByRole('separator', { name: /Resize Tools panel/ })).toHaveCount(0)

    await collapseToggle.focus()
    await page.keyboard.press('Space')
    const restored = await bounds(resizer)
    await expect(collapseToggle).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(() => page.evaluate(
      key => localStorage.getItem(key),
      BOTTOM_PANEL_COLLAPSED_STORAGE_KEY
    )).toBe('false')
    expectNear(restored.width, expanded.width)
    expectNear(restored.height, expanded.height)
    expectNear(restored.y + restored.height, expanded.y + expanded.height)
    await expect(resizer.locator('[data-testid="resize-bounding-pane"]')).toHaveCount(2)
  })

  test('migrates legacy selected-panel collapse state into the controlled layout registry', async ({ page }) => {
    await page.addInitScript(({ legacyKeys }) => {
      legacyKeys.forEach((key, index) => localStorage.setItem(key, index === 0 ? 'true' : 'false'))
    }, { legacyKeys: LEGACY_SELECTED_PANEL_STORAGE_KEYS })
    await loadApp(page)

    const selectedPanelToggle = page.locator(
      '.custom-panels-container > .custom-panel:first-child .panel-title.collapsable'
    )
    await expect(selectedPanelToggle).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), SELECTED_PANEL_STORAGE_KEY))
      .toBe('true')
    await expect.poll(() => page.evaluate(
      keys => keys.map(key => localStorage.getItem(key)),
      LEGACY_SELECTED_PANEL_STORAGE_KEYS
    )).toEqual([null, null, null])

    await selectedPanelToggle.click()
    await expect(selectedPanelToggle).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), SELECTED_PANEL_STORAGE_KEY))
      .toBe('false')

    await page.reload()
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
    await expect(selectedPanelToggle).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(() => page.evaluate(
      keys => keys.map(key => localStorage.getItem(key)),
      LEGACY_SELECTED_PANEL_STORAGE_KEYS
    )).toEqual([null, null, null])
  })

  test('clamps saved dimensions to viewport and visible sidebar space', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 })
    await page.addInitScript(({ storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify({ width: 1400, height: 1000 }))
    }, { storageKey: PANEL_SIZE_STORAGE_KEY })
    await loadApp(page)

    const resizer = page.locator('#bottom-panel-resizer')
    const initial = await bounds(resizer)
    expectNear(initial.x, 50)
    expectNear(initial.width, 710)
    expectNear(initial.height, 750)
    expectNear(initial.y + initial.height, 800)

    const sidebar = await bounds(page.locator('.sidebar-right'))
    expect(initial.x + initial.width).toBeLessThanOrEqual(sidebar.x - 8)

    await page.setViewportSize({ width: 1000, height: 700 })
    await expect.poll(async () => Math.round((await bounds(resizer)).width)).toBe(610)
    await expect.poll(async () => Math.round((await bounds(resizer)).height)).toBe(650)
    const clamped = await bounds(resizer)
    expectNear(clamped.width, 610)
    expectNear(clamped.height, 650)
    expectNear(clamped.x, 50)
    expectNear(clamped.y + clamped.height, 700)

    const savedSize = await page.evaluate(storageKey => (
      JSON.parse(localStorage.getItem(storageKey))
    ), PANEL_SIZE_STORAGE_KEY)
    expect(savedSize).toEqual({ width: 610, height: 650 })

    await page.setViewportSize({ width: 850, height: 700 })
    await expect.poll(async () => Math.round((await bounds(resizer)).width)).toBe(460)
    const narrowPanel = await bounds(resizer)
    const narrowSidebar = await bounds(page.locator('.sidebar-right'))
    expect(narrowPanel.x + narrowPanel.width).toBeLessThanOrEqual(narrowSidebar.x - 8)
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: 'Continue anyway' }).click()

    const narrowSavedSize = await page.evaluate(storageKey => (
      JSON.parse(localStorage.getItem(storageKey))
    ), PANEL_SIZE_STORAGE_KEY)
    expect(narrowSavedSize).toEqual({ width: 460, height: 650 })
  })

  test('replaces malformed saved dimensions with safe defaults', async ({ page }) => {
    await page.addInitScript(({ storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify({ width: 'wide', height: -20 }))
    }, { storageKey: PANEL_SIZE_STORAGE_KEY })
    await loadApp(page)

    const resizer = page.locator('#bottom-panel-resizer')
    const panelBounds = await bounds(resizer)
    expectNear(panelBounds.width, 800)
    expectNear(panelBounds.height, 180)

    const normalizedSize = await page.evaluate(storageKey => (
      JSON.parse(localStorage.getItem(storageKey))
    ), PANEL_SIZE_STORAGE_KEY)
    expect(normalizedSize).toEqual({ width: 800, height: 180 })
  })

  test('offers keyboard resizing and lets active content fill the panel', async ({ page }) => {
    await loadApp(page)

    const resizer = page.locator('#bottom-panel-resizer')
    const initial = await bounds(resizer)
    const heightTarget = page.getByRole('separator', { name: 'Resize Tools panel height' })
    const widthTarget = page.getByRole('separator', { name: 'Resize Tools panel width' })

    await heightTarget.focus()
    await page.keyboard.press('ArrowUp')
    await widthTarget.focus()
    await page.keyboard.press('ArrowRight')

    const resized = await bounds(resizer)
    expectNear(resized.height, initial.height + 16)
    expectNear(resized.width, initial.width + 16)
    await expect(heightTarget).toHaveAttribute('aria-valuenow', String(Math.round(resized.height)))
    await expect(widthTarget).toHaveAttribute('aria-valuenow', String(Math.round(resized.width)))

    await page.getByRole('tab', { name: 'Description' }).click()
    const descriptionPanel = await bounds(page.getByTestId('description-panel'))
    const descriptionTabPanel = await bounds(page.locator('#bottom-panel-description-content'))
    expect(descriptionPanel.height).toBeGreaterThan(descriptionTabPanel.height - 12)
    expectNear(
      descriptionPanel.y + descriptionPanel.height,
      descriptionTabPanel.y + descriptionTabPanel.height,
    )

    await page.getByRole('tab', { name: 'Logs' }).click()
    const logsPanel = await bounds(page.locator('#bottom-panel-logs-content > .logs-panel-content'))
    const logsTabPanel = await bounds(page.locator('#bottom-panel-logs-content'))
    expect(logsPanel.height).toBeGreaterThan(logsTabPanel.height - 12)
    expectNear(logsPanel.y + logsPanel.height, logsTabPanel.y + logsTabPanel.height)
  })

  test('lets the generated script field grow with the panel height', async ({ page }) => {
    await page.addInitScript(({ storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify({ width: 800, height: 400 }))
    }, { storageKey: PANEL_SIZE_STORAGE_KEY })
    await loadApp(page)

    await page.getByRole('tab', { name: 'Export Script' }).click()
    const code = page.getByLabel('Generated Julia script')
    await expect(code).toContainText('using QuantumSavory')

    const resizer = page.locator('#bottom-panel-resizer')
    const initialPanel = await bounds(resizer)
    const initialCode = await bounds(code)

    await dragFrom(page, initialPanel.x + initialPanel.width / 2, initialPanel.y + 1, 0, -160)
    await expect.poll(async () => (await bounds(resizer)).height)
      .toBeGreaterThan(initialPanel.height + 140)

    const tallerPanel = await bounds(resizer)
    const tallerCode = await bounds(code)
    const panelGrowth = tallerPanel.height - initialPanel.height
    const codeGrowth = tallerCode.height - initialCode.height

    expect(codeGrowth).toBeGreaterThan(panelGrowth - 12)
  })
})
