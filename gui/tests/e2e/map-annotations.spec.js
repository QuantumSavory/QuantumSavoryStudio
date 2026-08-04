import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

async function mockBackend(page, { parseRequests = [], scriptRequests = [] } = {}) {
  await page.route('**/known_functions', route => route.fulfill({
    json: { known_functions: [] },
  }))
  await page.route('**/background_types', route => route.fulfill({
    json: { background_types: [] },
  }))
  await page.route('**/protocol_types', route => route.fulfill({
    json: { protocol_types: [] },
  }))
  await page.route('**/states_zoo_types', route => route.fulfill({
    json: { states_zoo_types: [] },
  }))
  await page.route('**/slot_types', route => route.fulfill({
    json: { slot_types: ['Qubit', 'Qumode'] },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    json: {
      versions: { julia: 'test', quantumSavory: 'test', app: 'test' },
      capabilities: { unsafe_code_evaluation: false },
    },
  }))
  await page.route('**/destroy_simulation', route => route.fulfill({
    json: { success: true },
  }))
  await page.route('**/get_state?**', route => route.fulfill({
    status: 404,
    json: { success: false, error_code: 'NOT_FOUND', message: 'Simulation not found' },
  }))
  await page.route('**/logs/**', route => route.fulfill({
    json: { success: true, logs: [] },
  }))
  await page.route('**/parse_network_graph', route => {
    parseRequests.push(route.request().postDataJSON())
    return route.fulfill({ json: { success: true, message: 'Parsed' } })
  })
  await page.route('**/export_script', route => {
    scriptRequests.push(route.request().postDataJSON())
    return route.fulfill({
      json: {
        success: true,
        script: 'using QuantumSavory\nrun(Simulation(), 1.0)\n',
        filename: 'annotation-test.jl',
      },
    })
  })
}

async function loadApp(page, requests = {}) {
  await mockBackend(page, requests)
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  await page.goto('/')
  await protocolTypesLoaded
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 })
}

async function dragFrom(page, start, end) {
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
}

async function box(locator) {
  const bounds = await locator.boundingBox()
  if (!bounds) throw new Error('Expected a visible element with a bounding box')
  return bounds
}

async function currentAnnotations(page) {
  return page.evaluate(() => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    return JSON.parse(JSON.stringify(setup.projectData.annotations))
  })
}

async function currentAnnotationAreaBounds(page, annotationId) {
  return page.evaluate((id) => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const exposedMap = setup?.baseMapInstance?.map
    const map = exposedMap?.value ?? exposedMap
    const source = map?.getSource(`annotation-source-${id}-area`)
    const feature = source?.serialize?.().data
    const ring = feature?.geometry?.coordinates?.[0]
    if (!Array.isArray(ring)) return null
    const longitudes = ring.map(position => position[0])
    const latitudes = ring.map(position => position[1])
    return {
      west: Math.min(...longitudes),
      south: Math.min(...latitudes),
      east: Math.max(...longitudes),
      north: Math.max(...latitudes),
    }
  }, annotationId)
}

async function createSimulationTopology(page) {
  const canvas = page.locator('.maplibregl-canvas')
  await page.keyboard.down('Alt')
  await canvas.click({ position: { x: 280, y: 150 } })
  await canvas.click({ position: { x: 440, y: 190 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(2)

  const firstNode = page.locator('.node-marker').first()
  await firstNode.hover()
  await firstNode.locator('.connector.output').dragTo(page.locator('.node-marker').nth(1))
  await expect(page.locator('.edge-list-item')).toHaveCount(1)
  await page.evaluate(() => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    setup.projectData.net.nodes.forEach(node => node.createNewSlot())
  })
}

test.describe('Map annotations and Tools presentation', () => {
  test('wraps narrow Tools tabs and presents help above three equal cards', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.addInitScript(() => {
      localStorage.setItem('bottomPanel_size', JSON.stringify({ width: 610, height: 520 }))
    })
    await loadApp(page)

    const tabs = page.locator('#logsPanel .bottom-tabs')
    const tabButtons = tabs.getByRole('tab')
    const tabLayout = await tabButtons.evaluateAll(elements => elements.map(element => ({
      height: element.getBoundingClientRect().height,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    })))
    const tabsOverflow = await tabs.evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))

    expect(tabLayout.some(tab => tab.height > 30)).toBe(true)
    expect(new Set(tabLayout.map(tab => Math.round(tab.height))).size).toBe(1)
    expect(tabLayout.every(tab => tab.scrollHeight <= tab.clientHeight)).toBe(true)
    expect(tabsOverflow.scrollWidth).toBeLessThanOrEqual(tabsOverflow.clientWidth + 1)

    await page.getByRole('tab', { name: 'Layout Tools' }).click()
    const tools = page.locator('#bottom-panel-layout-tools-content .layout-tools')
    const helpCard = tools.locator('.help-card')
    const defaultsCard = tools.locator('.defaults-card')
    const drawingCard = tools.locator('.drawing-card')
    const helpersCard = tools.locator('.helpers-card')
    await expect(helpCard.getByRole('heading', { name: 'Help' })).toBeVisible()

    const heightResizeTarget = page.getByTestId('bottom-panel-height-resize-target')
    await heightResizeTarget.focus()
    await heightResizeTarget.press('Home')
    const compactHelpHeight = (await box(helpCard)).height
    await heightResizeTarget.press('End')
    const expandedHelpHeight = (await box(helpCard)).height
    expect(Math.abs(compactHelpHeight - expandedHelpHeight)).toBeLessThanOrEqual(1)

    const [helpBounds, defaultsBounds, drawingBounds, helpersBounds] = await Promise.all([
      box(helpCard),
      box(defaultsCard),
      box(drawingCard),
      box(helpersCard),
    ])
    expect(helpBounds.y + helpBounds.height).toBeLessThanOrEqual(defaultsBounds.y + 1)
    expect(Math.abs(defaultsBounds.y - drawingBounds.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(drawingBounds.y - helpersBounds.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(defaultsBounds.width - drawingBounds.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(drawingBounds.width - helpersBounds.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(helpBounds.x - defaultsBounds.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(
      helpBounds.x + helpBounds.width - helpersBounds.x - helpersBounds.width,
    )).toBeLessThanOrEqual(1)

    await heightResizeTarget.press('Home')
    await defaultsCard.getByRole('button', { name: 'Add Slot' }).click()
    await expect(defaultsCard.locator('.slot-row')).toHaveCount(1)
    await page.keyboard.down('Alt')
    await page.locator('.maplibregl-canvas').click({ position: { x: 300, y: 220 } })
    await page.keyboard.up('Alt')
    await expect(page.locator('.node-marker')).toHaveCount(1)
    const templateResult = await page.evaluate(() => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      const templateSlot = setup.projectData.net.physicalConfig.nodeTemplate.slots[0]
      const node = setup.projectData.net.nodes[0]
      return {
        templateSlotId: templateSlot.id,
        nodeSlotId: node.data.slots[0].id,
        nodeProtocols: node.data.protocols,
      }
    })
    expect(templateResult.nodeSlotId).not.toBe(templateResult.templateSlotId)
    expect(templateResult.nodeProtocols).toEqual([])

    const helpCases = [
      {
        control: page.getByRole('checkbox', { name: 'Curve mode' }),
        title: 'Curve mode',
        text: 'cycle its curve handles',
      },
      {
        control: page.getByRole('checkbox', { name: 'Distance and delay badges' }),
        title: 'Distance and delay badges',
        text: 'calculated distance and propagation delay',
      },
      {
        control: tools.getByRole('button', { name: 'Add Annotation' }),
        title: 'Add Annotation',
        text: 'one-shot annotation placement',
      },
      {
        control: tools.getByRole('button', { name: 'Repeater Chain Generator' }),
        title: 'Repeater Chain Generator',
        text: 'evenly spaced chain',
      },
      {
        control: tools.getByRole('button', { name: 'Star Network Generator' }),
        title: 'Star Network Generator',
        text: 'peripheral nodes evenly',
      },
      {
        control: tools.getByRole('button', { name: 'Graph Network Generator' }),
        title: 'Graph Network Generator',
        text: 'deterministic 2D grid',
      },
    ]

    for (const { control, title, text } of helpCases) {
      await control.hover()
      await expect(helpCard.getByRole('heading', { name: title })).toBeVisible()
      await expect(helpCard).toContainText(text)
      await control.focus()
      await expect(helpCard.getByRole('heading', { name: title })).toBeVisible()
      await expect(helpCard).toContainText(text)
    }
  })

  test('creates, edits, persists, locks, exports, imports, and deletes annotations', async ({ page }) => {
    test.slow()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('bottomPanel_size', JSON.stringify({ width: 800, height: 360 }))
    })
    const parseRequests = []
    const scriptRequests = []
    await loadApp(page, { parseRequests, scriptRequests })
    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('menuitem', { name: 'New' }).click()
    const newProjectDialog = page.getByRole('dialog', { name: 'New Project' })
    await newProjectDialog.getByPlaceholder('Project name').fill('Map Annotation Browser Test')
    await newProjectDialog.getByRole('button', { name: 'Create' }).click()
    await expect(page.locator('.project-name-label')).toHaveText('Map Annotation Browser Test')

    await page.getByRole('tab', { name: 'Layout Tools' }).click()
    const addAnnotation = page.getByRole('button', { name: 'Add Annotation' })
    await addAnnotation.click()
    await expect(addAnnotation).toHaveAttribute('aria-pressed', 'true')
    await page.locator('.maplibregl-canvas').click({ position: { x: 350, y: 300 } })
    await expect(addAnnotation).toHaveAttribute('aria-pressed', 'false')

    let annotation = page.locator('.annotation-overlay').first()
    await expect(annotation).toBeVisible()
    let annotationBounds = await box(annotation)
    expect(Math.abs(annotationBounds.width - 240)).toBeLessThanOrEqual(3)
    expect(Math.abs(annotationBounds.height - 140)).toBeLessThanOrEqual(3)
    const selectedAnnotationHeader = page.getByRole('button', {
      name: 'Selected Annotation',
      exact: true,
    })
    await expect(selectedAnnotationHeader).toBeVisible()

    await page.locator('.maplibregl-canvas').click({ position: { x: 1000, y: 100 } })
    await expect(selectedAnnotationHeader).toHaveCount(0)
    await annotation.click()
    await expect(selectedAnnotationHeader).toBeVisible()

    const boundsBeforeMove = (await currentAnnotations(page))[0].bounds
    annotationBounds = await box(annotation)
    await dragFrom(
      page,
      { x: annotationBounds.x + 30, y: annotationBounds.y + 30 },
      { x: annotationBounds.x + 90, y: annotationBounds.y + 70 },
    )
    await expect.poll(async () => (await currentAnnotations(page))[0].bounds.west)
      .not.toBe(boundsBeforeMove.west)

    const boundsBeforeResize = (await currentAnnotations(page))[0].bounds
    const southeastHandle = page.locator(
      '.annotation-resize-handle[data-annotation-corner="southeast"]',
    )
    const handleBounds = await box(southeastHandle)
    await dragFrom(
      page,
      { x: handleBounds.x + handleBounds.width / 2, y: handleBounds.y + handleBounds.height / 2 },
      { x: handleBounds.x + 85, y: handleBounds.y + 55 },
    )
    await expect.poll(async () => (await currentAnnotations(page))[0].bounds.east)
      .toBeGreaterThan(boundsBeforeResize.east)
    await expect.poll(async () => (await currentAnnotations(page))[0].bounds.south)
      .toBeLessThan(boundsBeforeResize.south)

    const selectedPanel = page.locator('#annotationPanel')
    await selectedPanel.getByLabel('Background color').fill('#ffeeaa')
    await selectedPanel.getByLabel('Border color').fill('#8844cc')
    await expect.poll(async () => (await currentAnnotations(page))[0].backgroundColor)
      .toBe('#ffeeaa')
    await expect.poll(async () => (await currentAnnotations(page))[0].borderColor)
      .toBe('#8844cc')

    await selectedPanel.getByRole('button', { name: 'Edit annotation content' }).click()
    const markdownEditor = selectedPanel.getByRole('textbox', {
      name: 'Annotation content in Markdown',
    })
    await expect(markdownEditor).toBeFocused()
    await markdownEditor.fill('# Route note\n\n**Ready** with inline math $x^2$.')
    await selectedPanel.getByRole('button', { name: 'Save annotation content' }).click()
    await expect(selectedPanel.locator('.markdown-rendered strong')).toHaveText('Ready')
    await expect(selectedPanel.locator('.markdown-rendered .katex')).toHaveCount(1)
    await expect(annotation.locator('.annotation-markdown strong')).toHaveText('Ready')
    await expect(annotation.locator('.annotation-markdown .katex')).toHaveCount(1)

    await selectedPanel.getByLabel('Attach area selection').check()
    await expect.poll(async () => Boolean((await currentAnnotations(page))[0].area)).toBe(true)
    const attachedAnnotation = (await currentAnnotations(page))[0]
    expect(attachedAnnotation.area.freeCorner).toHaveLength(2)
    const areaHandle = page.locator('.annotation-resize-handle-area')
    await expect(areaHandle).toBeVisible()
    const freeCornerBeforeDrag = attachedAnnotation.area.freeCorner
    const areaHandleBounds = await box(areaHandle)
    annotationBounds = await box(annotation)
    await dragFrom(
      page,
      {
        x: areaHandleBounds.x + areaHandleBounds.width / 2,
        y: areaHandleBounds.y + areaHandleBounds.height / 2,
      },
      {
        x: 20,
        y: annotationBounds.y + annotationBounds.height + 20,
      },
    )
    await expect.poll(async () => JSON.stringify((await currentAnnotations(page))[0].area.freeCorner))
      .not.toBe(JSON.stringify(freeCornerBeforeDrag))
    await expect.poll(async () => {
      const [value] = await currentAnnotations(page)
      return value.area.freeCorner[0] < value.bounds.west
        && value.area.freeCorner[1] < value.bounds.south
    }).toBe(true)
    const draggedArea = (await currentAnnotations(page))[0]
    await expect.poll(async () => currentAnnotationAreaBounds(page, draggedArea.id))
      .not.toBeNull()
    const renderedAreaBounds = await currentAnnotationAreaBounds(page, draggedArea.id)
    const annotationHeight = draggedArea.bounds.north - draggedArea.bounds.south
    expect(renderedAreaBounds.east).toBeCloseTo(draggedArea.bounds.west, 9)
    const sharedLength = Math.min(renderedAreaBounds.north, draggedArea.bounds.north)
      - Math.max(renderedAreaBounds.south, draggedArea.bounds.south)
    expect(sharedLength).toBeGreaterThan(0)
    expect(sharedLength).toBeCloseTo(annotationHeight, 9)

    await page.evaluate(() => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      setup.saveProject()
    })
    const stored = await page.evaluate(() => (
      JSON.parse(localStorage.getItem('cqn_v2_project_Map Annotation Browser Test'))
    ))
    expect(stored.schemaVersion).toBe(2)
    expect(stored.annotations).toEqual(await currentAnnotations(page))

    const downloadPromise = page.waitForEvent('download')
    await page.evaluate(() => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      setup.exportProject()
    })
    const download = await downloadPromise
    const exportedProject = JSON.parse(await readFile(await download.path(), 'utf8'))
    expect(exportedProject.annotations).toEqual(stored.annotations)

    await createSimulationTopology(page)
    await page.getByRole('button', { name: 'Toggle advanced controls' }).click()
    await page.getByRole('button', { name: 'Parse', exact: true }).click()
    await expect.poll(() => parseRequests.length).toBe(1)
    expect(parseRequests[0]).not.toHaveProperty('annotations')

    await page.getByRole('tab', { name: 'Layout Tools' }).click()
    await expect(page.getByLabel('Curve mode')).toBeDisabled()
    await expect(addAnnotation).toBeEnabled()
    await expect(page.getByText('Annotations remain available.')).toBeVisible()
    await addAnnotation.click()
    await page.locator('.maplibregl-canvas').click({ position: { x: 920, y: 430 } })
    await expect(page.locator('.annotation-overlay')).toHaveCount(2)
    await page.getByRole('button', { name: 'Delete selected annotation' }).click()
    await expect(page.locator('.annotation-overlay')).toHaveCount(1)

    await page.getByRole('tab', { name: 'Export Script' }).click()
    await expect.poll(() => scriptRequests.length).toBe(1)
    expect(scriptRequests[0]).not.toHaveProperty('annotations')

    await page.reload()
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 })
    annotation = page.locator('.annotation-overlay')
    await expect(annotation).toHaveCount(1)
    await expect(annotation.locator('.annotation-markdown strong')).toHaveText('Ready')
    expect(await currentAnnotations(page)).toEqual(stored.annotations)

    exportedProject.name = 'Imported Annotation Browser Test'
    await page.evaluate(project => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      return setup.validateAndProcessImport(project)
    }, exportedProject)
    const importedDialog = page.getByRole('dialog', { name: 'Project imported' })
    await expect(importedDialog).toContainText(
      'Project "Imported Annotation Browser Test" imported successfully!',
    )
    await importedDialog.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('.project-name-label')).toHaveText('Imported Annotation Browser Test')
    expect(await currentAnnotations(page)).toEqual(exportedProject.annotations)
  })
})
