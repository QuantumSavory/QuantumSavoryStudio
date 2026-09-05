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
      const qubit = node.createNewSlot()
      qubit.assignment = index === 0
      const qumode = node.createNewSlot()
      qumode.type = 'Qumode'
      qumode.isLocked = index === 1
    })
  })
  await expect(markers.locator('.slot-icon')).toHaveCount(4)

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

  await markers.first().hover()
  await expect(markers.first().locator('.node-name')).toBeVisible()
  await expect(markers.first().locator('.slot-icon')).toHaveCount(2)
  await expect(markers.first().locator('.slot-icon').first()).toBeVisible()

  await page.mouse.move(20, 20)
  await expect(markers.first().locator('.node-name')).toBeHidden()
  await expect(markers.locator('.slot-icon')).toHaveCount(4)
})
