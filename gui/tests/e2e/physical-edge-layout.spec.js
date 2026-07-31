import { expect, test } from '@playwright/test'

async function mockBackendMetadata(page) {
  await page.route('**/known_functions', route => route.fulfill({
    json: { known_functions: [] },
  }))
  await page.route('**/background_types', route => route.fulfill({
    json: { background_types: [] },
  }))
  await page.route('**/slot_types', route => route.fulfill({
    json: { slot_types: ['Qubit', 'Qumode'] },
  }))
  await page.route('**/protocol_types', route => route.fulfill({
    json: { protocol_types: [] },
  }))
  await page.route('**/states_zoo_types', route => route.fulfill({
    json: { states_zoo_types: [] },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    json: {
      versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
      capabilities: { unsafe_code_evaluation: false },
    },
  }))
}

async function createTwoNodeProject(page) {
  await mockBackendMetadata(page)
  await page.goto('/')
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 15_000 })

  await page.keyboard.down('Alt')
  await canvas.click({ position: { x: 400, y: 300 } })
  await canvas.click({ position: { x: 650, y: 400 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(2)

  const firstNode = page.locator('.node-marker').first()
  const secondNode = page.locator('.node-marker').nth(1)
  await firstNode.hover()
  await firstNode.locator('.connector.output').dragTo(secondNode)
  await expect(page.locator('.edge-list-item')).toHaveCount(1)
  return { canvas, firstNode, secondNode }
}

test('edits physical curves and overrides while keeping virtual links nonphysical', async ({ page }) => {
  const { canvas, firstNode, secondNode } = await createTwoNodeProject(page)

  await expect(page.locator('.edge-badge-distance')).toHaveCount(1)
  await expect(page.locator('.edge-badge-delay')).toHaveCount(1)
  await expect(page.locator('.edge-badge-stack')).not.toContainText('dB/km')
  await page.locator('.edge-list-item').first().click()
  await expect(page.getByText('PHYSICAL PROPAGATION', { exact: true })).toBeVisible()

  await page.locator('#bottom-panel-layout-tools-tab').click()
  await expect(page.locator('#default-refractive-index')).toHaveValue('1.468')
  const defaultLoss = page.locator('#default-loss-db-per-km')
  await expect(defaultLoss).toHaveValue('0.2')
  await expect(
    page.locator('.defaults-card [data-quantity="lossDbPerKm"] .quantity-field__unit'),
  ).toHaveText('dB/km')
  await defaultLoss.fill('0.3')
  await defaultLoss.press('Tab')
  await expect.poll(() => page.evaluate(() => window.projectData.net.physicalConfig)).toMatchObject({
    refractiveIndex: 1.468,
    lossDbPerKm: 0.3,
  })
  await defaultLoss.fill('0.2')
  await defaultLoss.press('Tab')

  const edgeLoss = page.locator('#edge-loss-db-per-km')
  const edgeTransmissivity = page.locator('#edge-transmissivity')
  await expect(edgeLoss).toHaveValue('0.2')
  await expect(
    page.locator('.physical-edge-controls [data-quantity="lossDbPerKm"] .quantity-field__unit'),
  ).toHaveText('dB/km')
  expect(Number(await edgeTransmissivity.inputValue())).toBeGreaterThan(0)
  expect(Number(await edgeTransmissivity.inputValue())).toBeLessThan(1)

  await edgeLoss.fill('0.4')
  await edgeLoss.press('Tab')
  const distanceInput = page.locator('#edge-distance-meters')
  await distanceInput.fill('1000')
  await distanceInput.press('Tab')
  await expect(edgeTransmissivity).toHaveValue('0.912')

  await edgeTransmissivity.fill('0.5')
  await edgeTransmissivity.press('Tab')
  await expect(page.locator('#edge-loss-db-per-km')).toHaveText('n/a')
  await expect.poll(() => page.evaluate(() => (
    window.projectData.net.edges[0].data.physicalOverrides
  ))).toMatchObject({
    distanceMeters: 1000,
    lossDbPerKm: 0.4,
    transmissivity: 0.5,
  })

  await page.locator('#curve-editing-enabled').check()
  await canvas.click({ position: { x: 525, y: 350 } })
  const handle = page.locator('.curve-point-handle')
  await expect(handle).toHaveCount(1)
  await expect(handle).toHaveClass(/curve-point-smooth/)
  await handle.click()
  await expect(handle).toHaveClass(/curve-point-sharp/)
  await handle.click()
  await expect(handle).toHaveCount(0)

  const delayInput = page.locator('#edge-delay-seconds')
  await delayInput.fill('0.25')
  await delayInput.press('Tab')
  await expect(page.locator('#edge-distance-meters')).toHaveText('n/a')
  await expect(page.locator('#edge-refractive-index')).toHaveText('n/a')
  await expect(page.locator('#edge-transmissivity')).toHaveValue('0.5')
  await expect(page.locator('.edge-badge-distance')).toHaveCount(0)
  await expect(page.locator('.edge-badge-delay')).toHaveText('250 ms')

  await page.getByRole('button', { name: 'Reset propagation delay to automatic' }).click()
  await expect(page.locator('.edge-badge-distance')).toHaveCount(1)
  await page.getByRole('button', { name: 'Reset transmissivity to automatic' }).click()
  await expect(page.locator('#edge-loss-db-per-km')).toHaveValue('0.4')
  await expect(page.locator('#edge-transmissivity')).toHaveValue('0.912')
  await page.getByRole('button', { name: 'Reset fiber loss to automatic' }).click()
  await expect(page.locator('#edge-loss-db-per-km')).toHaveValue('0.2')
  await expect(page.locator('#edge-transmissivity')).toHaveValue('0.955')
  await page.locator('#physical-badges-visible').uncheck()
  await expect(page.locator('.edge-badge-stack')).toHaveCount(0)
  await page.locator('#physical-badges-visible').check()

  await firstNode.hover()
  await firstNode.locator('.connector.output').dragTo(secondNode)
  const duplicateDialog = page.getByRole('dialog', { name: 'Duplicate physical edge' })
  await expect(duplicateDialog).toContainText('Only one physical edge may connect a pair of nodes.')
  await duplicateDialog.getByRole('button', { name: 'OK' }).click()
  await expect(page.locator('.edge-list-item')).toHaveCount(1)

  await firstNode.hover()
  await page.keyboard.down('Shift')
  await firstNode.locator('.connector.output').dragTo(secondNode)
  await page.keyboard.up('Shift')
  await expect(page.locator('.edge-list-item')).toHaveCount(2)
  await page.locator('.edge-list-item').nth(1).click()
  await expect(page.getByText('PHYSICAL PROPAGATION', { exact: true })).toHaveCount(0)
  await expect(page.locator('.curve-point-handle')).toHaveCount(0)
  await expect(page.locator('.edge-badge-stack')).toHaveCount(1)
})

test('rejects an out-of-world node drag without breaking a curved edge', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  const { canvas, secondNode } = await createTwoNodeProject(page)

  await page.locator('.edge-list-item').first().click()
  await page.locator('#bottom-panel-layout-tools-tab').click()
  await page.locator('#curve-editing-enabled').check()
  await canvas.click({ position: { x: 525, y: 350 } })
  await expect(page.locator('.curve-point-handle')).toHaveCount(1)

  const originalPosition = await page.evaluate(() => (
    [...window.projectData.net.nodes[1].position]
  ))
  const zoomOut = page.getByTitle('Zoom out')
  for (let index = 0; index < 12; index += 1) await zoomOut.click()

  const markerBefore = await secondNode.boundingBox()
  const canvasBox = await canvas.boundingBox()
  expect(markerBefore).not.toBeNull()
  expect(canvasBox).not.toBeNull()
  const start = {
    x: markerBefore.x + markerBefore.width / 2,
    y: markerBefore.y + markerBefore.height / 2,
  }
  const leftRoom = start.x - canvasBox.x - 10
  const rightRoom = canvasBox.x + canvasBox.width - start.x - 10
  const direction = rightRoom >= leftRoom ? 1 : -1
  const travel = Math.min(Math.max(leftRoom, rightRoom), 700)
  expect(travel).toBeGreaterThan(520)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + direction * travel, start.y, { steps: 12 })
  await page.mouse.up()

  const warning = page.getByRole('dialog', { name: 'Unable to update design' })
  await expect(warning).toContainText('impossible to draw or measure')
  await expect.poll(() => page.evaluate(() => (
    [...window.projectData.net.nodes[1].position]
  ))).toEqual(originalPosition)
  await expect(page.locator('.edge-badge-distance')).toHaveCount(1)
  await expect(page.locator('.edge-badge-delay')).toHaveCount(1)
  expect(pageErrors).toEqual([])

  const markerAfter = await secondNode.boundingBox()
  // At a whole-world zoom, MapLibre's world-copy choice and subpixel rounding
  // can shift the restored marker by a few display pixels.
  expect(Math.abs(markerAfter.x - markerBefore.x)).toBeLessThan(5)
  expect(Math.abs(markerAfter.y - markerBefore.y)).toBeLessThan(5)
  await warning.getByRole('button', { name: 'OK' }).click()
})
