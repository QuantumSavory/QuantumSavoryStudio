import { expect, test } from '@playwright/test'
import { backendPlatformInfo } from '../platformInfoFixtures.js'
import { SLOT_TYPE_CATALOG } from '../catalogFixtures.js'

const SIDEBAR_WIDTH_STORAGE_KEY = 'rightSidebar_width'

async function mockBackend(page) {
  await page.route('http://localhost:8000/**', route => {
    const requestPath = new URL(route.request().url()).pathname
    const responses = {
      '/known_functions': { known_functions: [] },
      '/background_types': { background_types: [] },
      '/slot_types': { slot_types: SLOT_TYPE_CATALOG },
      '/protocol_types': { protocol_types: [] },
      '/states_zoo_types': { states_zoo_types: [] },
      '/platform_info': backendPlatformInfo(),
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

test.describe('Resizable simulation sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
  })

  test('resizes from the left while retaining its right anchor and persists the width', async ({ page }) => {
    await loadApp(page)

    const sidebar = page.locator('.sidebar-right')
    const resizer = page.locator('#right-sidebar-resizer')
    const resizePane = resizer.locator('[data-testid="resize-bounding-pane"]')
    const initial = await bounds(sidebar)
    const initialToggle = await bounds(page.getByRole('button', { name: 'Hide simulation sidebar' }))

    await expect(resizePane).toHaveCount(1)
    await expect(resizer.locator('[data-testid="resize-bounding-knob"]')).toHaveCount(0)
    await resizePane.hover()
    await expect(resizePane).toHaveCSS('cursor', 'ew-resize')
    await expect(resizePane.locator('[data-testid="resize-bounding-splitter"]'))
      .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

    await dragFrom(page, initial.x + 1, initial.y + initial.height / 2, -140, 0)
    const resized = await bounds(sidebar)

    expect(resized.width).toBeGreaterThan(initial.width + 120)
    expectNear(resized.x + resized.width, initial.x + initial.width)
    expectNear(resized.height, initial.height)
    const resizedToggle = await bounds(page.getByRole('button', { name: 'Hide simulation sidebar' }))
    expectNear(resizedToggle.x, initialToggle.x - (resized.width - initial.width))

    const savedWidth = await page.evaluate(key => Number(localStorage.getItem(key)), SIDEBAR_WIDTH_STORAGE_KEY)
    expectNear(savedWidth, resized.width)
    const cascadedWidth = await page.locator('.app').evaluate(element => (
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--app-shell-sidebar-width'))
    ))
    expectNear(cascadedWidth, resized.width)

    await page.reload()
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
    const restored = await bounds(sidebar)
    expectNear(restored.width, resized.width)
    expectNear(restored.x + restored.width, initial.x + initial.width)
  })

  test('supports keyboard resizing and preserves the width while hidden', async ({ page }) => {
    await loadApp(page)

    const sidebar = page.locator('.sidebar-right')
    const resizeTarget = page.getByRole('separator', { name: 'Resize simulation sidebar width' })
    const initial = await bounds(sidebar)

    await expect(resizeTarget).toHaveAttribute('aria-controls', 'simulation-sidebar')
    await expect(resizeTarget).toHaveAttribute('aria-orientation', 'vertical')
    await expect(resizeTarget).toHaveAttribute('aria-valuemin', '280')
    await resizeTarget.focus()
    await page.keyboard.press('ArrowLeft')

    const resized = await bounds(sidebar)
    expectNear(resized.width, initial.width + 16)
    expectNear(resized.x, initial.x - 16)
    expectNear(resized.x + resized.width, initial.x + initial.width)
    await expect(resizeTarget).toHaveAttribute('aria-valuenow', String(Math.round(resized.width)))

    await page.keyboard.press('ArrowRight')
    const restoredWithKeyboard = await bounds(sidebar)
    expectNear(restoredWithKeyboard.width, initial.width)
    expectNear(restoredWithKeyboard.x, initial.x)

    await page.keyboard.press('ArrowLeft')
    const resizedAgain = await bounds(sidebar)
    await page.getByRole('button', { name: 'Hide simulation sidebar' }).click()
    await expect(page.getByRole('separator', { name: 'Resize simulation sidebar width' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Show simulation sidebar' }).click()

    const restored = await bounds(sidebar)
    expectNear(restored.width, resizedAgain.width)
    await expect(page.getByRole('separator', { name: 'Resize simulation sidebar width' }))
      .toHaveAttribute('aria-valuenow', String(Math.round(resizedAgain.width)))
  })

  test('clamps saved and live widths to leave usable main-panel space', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 })
    await page.addInitScript(({ storageKey }) => {
      localStorage.setItem(storageKey, '900')
    }, { storageKey: SIDEBAR_WIDTH_STORAGE_KEY })
    await loadApp(page)

    const sidebar = page.locator('.sidebar-right')
    const bottomPanel = page.locator('#bottom-panel-resizer')
    const initial = await bounds(sidebar)

    expectNear(initial.width, 670)
    expectNear(initial.x, 320)
    await expect.poll(() => page.evaluate(
      key => localStorage.getItem(key),
      SIDEBAR_WIDTH_STORAGE_KEY,
    )).toBe('670')

    const initialBottomPanel = await bounds(bottomPanel)
    expect(initialBottomPanel.x + initialBottomPanel.width).toBeLessThanOrEqual(initial.x - 8)

    await page.setViewportSize({ width: 950, height: 800 })
    await expect.poll(async () => Math.round((await bounds(sidebar)).width)).toBe(620)
    const clamped = await bounds(sidebar)
    const clampedBottomPanel = await bounds(bottomPanel)

    expectNear(clamped.x, 320)
    expect(clampedBottomPanel.x + clampedBottomPanel.width).toBeLessThanOrEqual(clamped.x - 8)
    await expect.poll(() => page.evaluate(
      key => localStorage.getItem(key),
      SIDEBAR_WIDTH_STORAGE_KEY,
    )).toBe('620')
  })
})
