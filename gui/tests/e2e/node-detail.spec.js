import { expect, test } from '@playwright/test'

async function mapZoom(page) {
  return page.evaluate(() => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const exposedMap = setup?.baseMapInstance?.map
    return (exposedMap?.value ?? exposedMap).getZoom()
  })
}

async function setMapZoom(page, zoom) {
  await page.evaluate(value => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const exposedMap = setup?.baseMapInstance?.map
    const map = exposedMap?.value ?? exposedMap
    map.setZoom(value)
  }, zoom)
}

test('reduces node detail as nearby markers converge', async ({ page }) => {
  await page.goto('/')
  const canvas = page.locator('.maplibregl-canvas')
  await expect(canvas).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'New' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Project' })
  await dialog.getByPlaceholder('Project name').fill('Node Detail')
  await dialog.getByRole('button', { name: 'Create' }).click()

  await page.keyboard.down('Alt')
  await canvas.click({ position: { x: 420, y: 300 } })
  await canvas.click({ position: { x: 620, y: 300 } })
  await page.keyboard.up('Alt')

  const markers = page.locator('.node-marker')
  await expect(markers).toHaveCount(2)
  await page.evaluate(() => {
    const setup = document.querySelector('#app').__vue_app__._instance.setupState
    setup.projectData.net.nodes.forEach((node, index) => {
      const slotCount = index === 0 ? 50 : 2
      for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
        const slot = node.createNewSlot()
        slot.type = slotIndex % 2 === 0 ? 'Qubit' : 'Qumode'
        slot.assignment = (slotIndex + index) % 2 === 0
        slot.isLocked = slotIndex === index
      }
    })
  })
  await expect(markers.locator('.slot-icon')).toHaveCount(52)
  await page.mouse.move(20, 20)

  const detailLevels = () => markers.evaluateAll(elements => (
    elements.map(element => element.dataset.detailLevel)
  ))
  await expect.poll(detailLevels).toEqual(['full', 'full'])
  await expect(markers.first().locator('.node-name')).toBeVisible()

  const initialZoom = await mapZoom(page)
  await setMapZoom(page, initialZoom - 1)
  await expect.poll(detailLevels).toEqual(['slots', 'slots'])
  await expect(markers.first().locator('.node-name')).toBeHidden()
  await expect(markers.first().locator('.slot-icon').first()).toBeVisible()
  const slotsBounds = await markers.first().boundingBox()

  await setMapZoom(page, initialZoom - 2.5)
  await expect.poll(detailLevels).toEqual(['dot', 'dot'])
  await expect(markers.first().locator('.slot-icon').first()).toBeHidden()
  const dotBounds = await markers.first().boundingBox()
  expect(dotBounds.width).toBeLessThan(slotsBounds.width)
  expect(dotBounds.width).toBeCloseTo(dotBounds.height, 0)
  const hiddenSlotOffsets = await markers.first().evaluate(marker => {
    const markerBounds = marker.getBoundingClientRect()
    const markerCenter = {
      x: markerBounds.left + markerBounds.width / 2,
      y: markerBounds.top + markerBounds.height / 2,
    }
    return [...marker.querySelectorAll('.slot-icon')].map(slot => {
      const slotBounds = slot.getBoundingClientRect()
      return Math.hypot(
        slotBounds.left + slotBounds.width / 2 - markerCenter.x,
        slotBounds.top + slotBounds.height / 2 - markerCenter.y,
      )
    })
  })
  expect(Math.max(...hiddenSlotOffsets)).toBeLessThan(1)

  const dotStyles = await markers.evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      zIndex: style.zIndex,
    }
  }))
  expect(dotStyles[0]).toEqual(dotStyles[1])
  expect(await markers.first().evaluate(element => (
    getComputedStyle(element).transitionDuration
      .split(',')
      .some(duration => Number.parseFloat(duration) > 0)
  ))).toBe(true)
  await expect(markers.first()).toHaveAttribute('role', 'button')
  await expect(markers.first()).toHaveAttribute('aria-label', 'Node 1')

  await markers.first().hover()
  const revealHeights = await markers.first().evaluate(async element => {
    const heights = []
    const end = performance.now() + 250
    while (performance.now() < end) {
      await new Promise(resolve => requestAnimationFrame(resolve))
      heights.push(element.getBoundingClientRect().height)
    }
    return heights
  })
  expect(Math.max(...revealHeights)).toBeLessThanOrEqual(revealHeights.at(-1) + 1)
  await expect(markers.first().locator('.node-name')).toBeVisible()
  await expect(markers.first().locator('.slot-icon')).toHaveCount(50)
  await expect(markers.first().locator('.slot-icon').first()).toBeVisible()

  const hoveredBounds = await markers.first().boundingBox()
  await page.evaluate(() => {
    const setup = document.querySelector('#app').__vue_app__._instance.setupState
    const exposedMap = setup.baseMapInstance?.map
    const map = exposedMap?.value ?? exposedMap
    map.panBy([400, 0], { duration: 0 })
  })
  await expect.poll(async () => (await markers.first().boundingBox()).x)
    .toBeLessThan(hoveredBounds.x - 300)
  await expect(markers.first().locator('.node-name')).toBeHidden()

  await markers.first().focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(markers.first()).toBeFocused()
  await expect(markers.first().locator('.node-name')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(markers.first()).toHaveClass(/is-selected/)
  await expect(markers.first()).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Menu' }).first().focus()
  await expect(markers.first().locator('.node-name')).toBeHidden()

  const stateSlotId = await page.evaluate(() => {
    const setup = document.querySelector('#app').__vue_app__._instance.setupState
    const baseMap = setup.baseMapInstance?.value ?? setup.baseMapInstance
    const node = setup.projectData.net.nodes[0]
    const slot = node.data.slots.at(-1)
    const shown = baseMap.showSlotConnectionState({
      id: 'node-detail-state',
      slots: [{ nodeId: node.id, slotId: slot.id }],
    })
    return shown ? slot.id : null
  })
  expect(stateSlotId).not.toBeNull()
  await expect(page.locator('.connection-line')).toHaveCount(1)

  const slotConnectionOffset = () => page.evaluate(slotId => {
    const mapBounds = document.querySelector('.map-container').getBoundingClientRect()
    const slotBounds = document.querySelector(`[data-slot-id="${slotId}"]`).getBoundingClientRect()
    const line = document.querySelector('.connection-line')
    return Math.hypot(
      Number(line.getAttribute('x1')) - (slotBounds.left + slotBounds.width / 2 - mapBounds.left),
      Number(line.getAttribute('y1')) - (slotBounds.top + slotBounds.height / 2 - mapBounds.top),
    )
  }, stateSlotId)
  const markerConnectionOffset = () => page.evaluate(() => {
    const mapBounds = document.querySelector('.map-container').getBoundingClientRect()
    const markerBounds = document.querySelector('.node-marker').getBoundingClientRect()
    const line = document.querySelector('.connection-line')
    return Math.hypot(
      Number(line.getAttribute('x1')) - (markerBounds.left + markerBounds.width / 2 - mapBounds.left),
      Number(line.getAttribute('y1')) - (markerBounds.top + markerBounds.height / 2 - mapBounds.top),
    )
  })
  await expect.poll(markerConnectionOffset).toBeLessThan(1)

  await markers.first().focus()
  await expect.poll(async () => (await markers.first().boundingBox()).width)
    .toBeGreaterThan(dotBounds.width + 20)
  await expect.poll(slotConnectionOffset).toBeLessThan(1)

  await page.getByRole('button', { name: 'Menu' }).first().focus()
  await expect.poll(async () => (await markers.first().boundingBox()).width)
    .toBeLessThan(dotBounds.width + 1)
  await expect.poll(markerConnectionOffset).toBeLessThan(1)
  await expect(markers.locator('.slot-icon')).toHaveCount(52)
})
