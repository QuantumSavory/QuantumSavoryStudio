import { test, expect } from '@playwright/test'

async function mockBackend(page) {
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
  await page.route('**/protocol_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { protocol_types: [] },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: {
      versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
      capabilities: { unsafe_code_evaluation: false },
    },
  }))
  await page.route('**/destroy_simulation', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: true },
  }))
  await page.route('**/get_state**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: false, error_code: 'NOT_FOUND' },
  }))
  await page.route('**/logs/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: true, logs: [], count: 0 },
  }))
}

async function createProjectWithThreeNodes(page, projectName) {
  await mockBackend(page)
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.click('.hamburger-btn')
  await page.getByText('New', { exact: true }).click()
  await page.fill('input[placeholder="Project name"]', projectName)
  await page.click('button.primary')

  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.down('Alt')
    await page.click('canvas', {
      position: { x: 380 + (index * 190), y: 260 + (index * 90) },
    })
    await page.keyboard.up('Alt')
    await expect(page.locator('.node-marker')).toHaveCount(index + 1)
  }
}

async function connectNodes(page, sourceId, targetId) {
  const source = page.locator(`.node-marker[data-node-id="${sourceId}"]`)
  const target = page.locator(`.node-marker[data-node-id="${targetId}"]`)
  await source.hover()
  await source.locator('.connector.output').dragTo(target)
  await expect(page.locator('.edge-list-item')).toHaveCount(1)
}

test('reorders node IDs without replacing selection, endpoints, map markers, or persisted data', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  const projectName = 'Node Reordering'
  await createProjectWithThreeNodes(page, projectName)

  const initial = await page.evaluate(() => {
    const setup = document.querySelector('#app').__vue_app__._instance.setupState
    const nodes = setup.projectData.net.nodes
    return {
      ids: nodes.map(node => node.id),
      positions: nodes.map(node => [...node.position]),
    }
  })

  await connectNodes(page, initial.ids[0], initial.ids[1])
  await page.locator(`.node-list-item[data-node-id="${initial.ids[1]}"]`).click()

  await page.evaluate(() => {
    const setup = document.querySelector('#app').__vue_app__._instance.setupState
    window.__nodeReorderRefs = {
      nodes: [...setup.projectData.net.nodes],
      edge: setup.projectData.net.edges[0],
      selectedNode: setup.selectedItem,
    }
  })

  const listRows = page.locator('#nodeListPanel .node-list-item')
  const nodeContextHelp = page.getByTestId('node-context-help')
  await expect(nodeContextHelp).toContainText('one-based simulator IDs')
  await expect(nodeContextHelp).toContainText('nodeid("Node name")')
  await expect(nodeContextHelp).toContainText('Use unique node names')
  await expect(listRows.locator('.node-list-name')).toHaveText(['Node 1', 'Node 2', 'Node 3'])
  await expect(listRows.locator('.node-index')).toHaveText(['#1', '#2', '#3'])
  await expect(page.locator('#nodePanel .node-index')).toHaveText('#2')
  await expect(page.getByRole('button', { name: 'Move Node 1 up' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Move Node 2 up' })).toBeEnabled()

  await listRows.nth(1).locator('.node-index').hover()
  await expect(page.locator('.p-tooltip-text')).toHaveText(
    'Node ID (the 1-based index used by the simulator)'
  )
  await page.locator('#nodePanel .node-index').hover()
  await expect(page.locator('.p-tooltip-text')).toHaveText(
    'Node ID (the 1-based index used by the simulator)'
  )

  const markerBefore = await page.locator(`.node-marker[data-node-id="${initial.ids[1]}"]`).boundingBox()
  await page.getByRole('button', { name: 'Move Node 2 up' }).click()

  await expect(listRows.locator('.node-list-name')).toHaveText(['Node 2', 'Node 1', 'Node 3'])
  await expect(listRows.locator('.node-index')).toHaveText(['#1', '#2', '#3'])
  await expect(listRows.first()).toHaveClass(/selected/)
  await expect(page.locator('#nodePanel .node-index')).toHaveText('#1')
  await expect(page.locator(`.node-marker[data-node-id="${initial.ids[1]}"]`)).toHaveClass(/is-selected/)
  await expect(page.getByRole('button', { name: 'Move Node 2 up' })).toBeDisabled()

  const markerAfter = await page.locator(`.node-marker[data-node-id="${initial.ids[1]}"]`).boundingBox()
  expect(markerBefore).not.toBeNull()
  expect(markerAfter).not.toBeNull()
  expect(markerAfter.x).toBeCloseTo(markerBefore.x, 0)
  expect(markerAfter.y).toBeCloseTo(markerBefore.y, 0)

  const liveState = await page.evaluate(() => {
    const setup = document.querySelector('#app').__vue_app__._instance.setupState
    const refs = window.__nodeReorderRefs
    const nodes = setup.projectData.net.nodes
    const edge = setup.projectData.net.edges[0]
    return {
      nodeOrder: nodes.map(node => node.id),
      sameNodeObjects: nodes[0] === refs.nodes[1]
        && nodes[1] === refs.nodes[0]
        && nodes[2] === refs.nodes[2],
      sameEdgeObject: edge === refs.edge,
      sameSelectedObject: setup.selectedItem === refs.selectedNode
        && setup.selectedItem === refs.nodes[1],
      endpointIds: [edge.source.id, edge.target.id],
      endpointObjectsCanonical: edge.source === refs.nodes[1] && edge.target === refs.nodes[0],
      positions: nodes.map(node => [...node.position]),
      backendOrder: setup.minimizedProjectData.net.nodes.map(node => node.id),
      savedShapeOrder: setup.serializeProjectData().net.nodes.map(node => node.id),
    }
  })

  expect(liveState.nodeOrder).toEqual([initial.ids[1], initial.ids[0], initial.ids[2]])
  expect(liveState.sameNodeObjects).toBe(true)
  expect(liveState.sameEdgeObject).toBe(true)
  expect(liveState.sameSelectedObject).toBe(true)
  expect(new Set(liveState.endpointIds)).toEqual(new Set(initial.ids.slice(0, 2)))
  expect(liveState.endpointObjectsCanonical).toBe(true)
  expect(liveState.positions).toEqual([initial.positions[1], initial.positions[0], initial.positions[2]])
  expect(liveState.backendOrder).toEqual(liveState.nodeOrder)
  expect(liveState.savedShapeOrder).toEqual(liveState.nodeOrder)

  await page.click('.hamburger-btn')
  await page.getByText('Save', { exact: true }).click()
  const stored = await page.evaluate(name => {
    const project = JSON.parse(localStorage.getItem(`cqn_v2_project_${name}`))
    localStorage.setItem('cqn_v2_recent_project_name', name)
    return {
      nodeOrder: project.net.nodes.map(node => node.id),
      edgeEndpoints: [project.net.edges[0].source, project.net.edges[0].target],
    }
  }, projectName)
  expect(stored.nodeOrder).toEqual(liveState.nodeOrder)
  expect(stored.edgeEndpoints).toEqual([initial.ids[1], initial.ids[0]])

  await page.reload()
  await expect(page.locator('#nodeListPanel .node-list-item')).toHaveCount(3, { timeout: 15_000 })
  await expect(page.locator('#nodeListPanel .node-list-name')).toHaveText(['Node 2', 'Node 1', 'Node 3'])
  await expect(page.locator('#nodeListPanel .node-index')).toHaveText(['#1', '#2', '#3'])
  await expect(page.locator('.node-marker')).toHaveCount(3)
  await expect(page.locator('.edge-list-item')).toHaveCount(1)

  const reloaded = await page.evaluate(() => {
    const setup = document.querySelector('#app').__vue_app__._instance.setupState
    const nodes = setup.projectData.net.nodes
    const edge = setup.projectData.net.edges[0]
    return {
      nodeOrder: nodes.map(node => node.id),
      endpointIds: [edge.source.id, edge.target.id],
      endpointObjectsCanonical: edge.source === nodes[0] && edge.target === nodes[1],
      positions: nodes.map(node => [...node.position]),
    }
  })
  expect(reloaded.nodeOrder).toEqual(liveState.nodeOrder)
  expect(reloaded.endpointIds).toEqual([initial.ids[1], initial.ids[0]])
  expect(reloaded.endpointObjectsCanonical).toBe(true)
  expect(reloaded.positions).toEqual(liveState.positions)
  expect(pageErrors).toEqual([])
})
