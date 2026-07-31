import { expect, test } from '@playwright/test'
import { simulationNotFoundResponse } from './httpResponses.js'

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
  await page.route('**/get_state**', route => route.fulfill(
    simulationNotFoundResponse(),
  ))
  await page.route('**/logs/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: true, logs: [], count: 0 },
  }))
}

async function createProjectWithNodes(page, projectName, count = 2) {
  await mockBackendMetadata(page)
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.locator('.hamburger-btn').click()
  await page.getByRole('menuitem', { name: 'New' }).click()
  await page.fill('input[placeholder="Project name"]', projectName)
  await page.getByRole('button', { name: 'Create' }).click()

  for (let index = 0; index < count; index += 1) {
    await page.keyboard.down('Alt')
    await page.click('canvas', {
      position: { x: 350 + (index * 180), y: 250 + (index * 70) },
    })
    await page.keyboard.up('Alt')
    await expect(page.locator('.node-marker')).toHaveCount(index + 1)
  }
}

async function connectNodes(page, sourceIndex, targetIndex, virtual = false, expectedCount = 1) {
  const source = page.locator('.node-marker').nth(sourceIndex)
  const target = page.locator('.node-marker').nth(targetIndex)
  await source.hover()
  if (virtual) await page.keyboard.down('Shift')
  await source.locator('.connector.output').dragTo(target)
  if (virtual) await page.keyboard.up('Shift')
  await expect(page.locator('.edge-list-item')).toHaveCount(expectedCount)
}

async function openLayoutHelper(page, name) {
  await page.getByRole('tab', { name: 'Layout Tools' }).click()
  await page.getByRole('button', { name }).click()
  const dialog = page.getByRole('dialog', { name })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-layout-section="description"]')).toBeVisible()
  await expect(dialog.locator('[data-layout-section="fields"]')).toBeVisible()
  await expect(dialog.locator('[data-layout-section="help"]')).toBeVisible()
  await expect(dialog.getByRole('note')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Generate / })).toBeVisible()

  const sectionOrder = await dialog.locator('[data-layout-section]').evaluateAll(sections => (
    sections.map(section => section.dataset.layoutSection)
  ))
  expect(sectionOrder).toEqual(['description', 'fields', 'help'])
}

async function configureTemplates(page, templateNodeName = 'Node 1') {
  return page.evaluate(({ templateNodeName }) => {
    const app = document.querySelector('#app')?.__vue_app__
    const projectData = app?._instance?.setupState?.projectData
    const [firstNode, secondNode] = projectData.net.nodes
    const edge = projectData.net.edges[0]

    const templateNode = projectData.net.nodes.find(node => node.name === templateNodeName)

    templateNode.data.customConfiguration = { nested: { value: 'node-template' } }
    templateNode.data.slots.push({
      id: 'slot_template',
      type: 'Qubit',
      backgroundNoise: { type: 'custom', parameters: [{ value: 0.25 }] },
      assignment: false,
      isLocked: false,
    })
    templateNode.data.protocols.push({
      id: 'protocol_node_template',
      type: 'TestNodeProtocol',
      parameters: [{ name: 'rounds', type: 'Int64', value: 7 }],
    })
    edge.data.customConfiguration = { fidelity: 0.91 }
    edge.data.protocols.push({
      id: 'protocol_edge_template',
      type: 'TestEdgeProtocol',
      parameters: [{ name: 'attempts', type: 'Int64', value: 5 }],
    })

    return {
      firstNodeId: firstNode.id,
      secondNodeId: secondNode.id,
      edgeId: edge.id,
      sourcePosition: [...edge.source.position],
      targetPosition: [...edge.target.position],
    }
  }, { templateNodeName })
}

function expectFreshUniqueIds(ids, templateId) {
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids).not.toContain(templateId)
}

function projectMapPosition([longitude, latitude]) {
  const mercatorY = (180 - ((180 / Math.PI) * Math.log(
    Math.tan((Math.PI / 4) + ((latitude * Math.PI) / 360)),
  ))) / 360
  return [(longitude + 180) / 360, -mercatorY]
}

function unprojectMapPosition([x, layoutY]) {
  const mercatorY = -layoutY
  const yDegrees = 180 - (mercatorY * 360)
  return [
    (x * 360) - 180,
    ((360 / Math.PI) * Math.atan(Math.exp((yDegrees * Math.PI) / 180))) - 90,
  ]
}

test.describe('star and graph layout helpers', () => {
  test('creates a configured star with deterministic 1-based peripheral names', async ({ page }) => {
    await createProjectWithNodes(page, 'Star Layout')
    await connectNodes(page, 0, 1)
    const templates = await configureTemplates(page, 'Node 2')

    await page.getByRole('tab', { name: 'Layout Tools' }).click()
    await expect(page.getByRole('button', { name: 'Repeater Chain Generator' }).locator('.lucide-waypoints'))
      .toBeVisible()
    await expect(page.getByRole('button', { name: 'Star Network Generator' }).locator('.lucide-star'))
      .toBeVisible()
    await expect(page.getByRole('button', { name: 'Graph Network Generator' }).locator('.lucide-network'))
      .toBeVisible()

    await openLayoutHelper(page, 'Star Network Generator')
    const dialog = page.getByRole('dialog', { name: 'Star Network Generator' })
    await dialog.locator('#star-center-node').selectOption({ label: 'Node 1' })
    await dialog.locator('#star-peripheral-node').selectOption({ label: 'Node 2' })
    await dialog.locator('#star-template-edge').selectOption({ index: 1 })
    await dialog.locator('#star-peripheral-count').fill('13')
    await expect(dialog.getByRole('alert')).toContainText('between 1 and 12')
    await expect(dialog.getByRole('button', { name: 'Generate Star' })).toBeDisabled()
    await dialog.locator('#star-peripheral-count').fill('4')
    await dialog.getByRole('button', { name: 'Generate Star' }).click()

    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.node-marker')).toHaveCount(5)
    await expect(page.locator('.edge-list-item')).toHaveCount(4)

    const generated = await page.evaluate(({ templates }) => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const nodes = projectData.net.nodes
      const edges = projectData.net.edges
      const center = nodes.find(node => node.name === 'Node 1')
      const peripherals = nodes.filter(node => node.name.startsWith('Node 2-'))
      return {
        names: peripherals.map(node => node.name),
        positions: peripherals.map(node => [...node.position]),
        centerPosition: [...center.position],
        centerRetained: center.id === templates.firstNodeId,
        templatesRemoved: !nodes.some(node => node.id === templates.secondNodeId)
          && !edges.some(edge => edge.id === templates.edgeId),
        connections: edges.map(edge => [edge.source.name, edge.target.name]),
        allPhysical: edges.every(edge => edge.isLogic === false),
        allNormalized: edges.every(edge => nodes.indexOf(edge.source) < nodes.indexOf(edge.target)),
        nodeIds: peripherals.map(node => node.id),
        slotIds: peripherals.map(node => node.data.slots[0].id),
        nodeProtocolIds: peripherals.map(node => node.data.protocols[0].id),
        edgeIds: edges.map(edge => edge.id),
        edgeProtocolIds: edges.map(edge => edge.data.protocols[0].id),
        nodeDataCopied: peripherals.every(node => (
          node.data.customConfiguration.nested.value === 'node-template'
          && node.data.slots[0].backgroundNoise.parameters[0].value === 0.25
        )),
        edgeDataCopied: edges.every(edge => (
          edge.data.customConfiguration.fidelity === 0.91
          && edge.data.protocols[0].parameters[0].value === 5
        )),
        independentNodeData: peripherals[0].data !== peripherals[1].data
          && peripherals[0].data.customConfiguration !== peripherals[1].data.customConfiguration,
        independentEdgeData: edges[0].data !== edges[1].data
          && edges[0].data.customConfiguration !== edges[1].data.customConfiguration,
      }
    }, { templates })

    expect(generated.names).toEqual(['Node 2-1', 'Node 2-2', 'Node 2-3', 'Node 2-4'])
    expect(generated.positions[0]).toEqual(templates.targetPosition)
    const projectedCenter = projectMapPosition(generated.centerPosition)
    const projectedPeripheral = projectMapPosition(templates.targetPosition)
    const offset = [
      projectedPeripheral[0] - projectedCenter[0],
      projectedPeripheral[1] - projectedCenter[1],
    ]
    const expectedPositions = [
      templates.targetPosition,
      unprojectMapPosition([
        projectedCenter[0] - offset[1],
        projectedCenter[1] + offset[0],
      ]),
      unprojectMapPosition([
        projectedCenter[0] - offset[0],
        projectedCenter[1] - offset[1],
      ]),
      unprojectMapPosition([
        projectedCenter[0] + offset[1],
        projectedCenter[1] - offset[0],
      ]),
    ]
    generated.positions.forEach((position, index) => {
      expect(position[0]).toBeCloseTo(expectedPositions[index][0])
      expect(position[1]).toBeCloseTo(expectedPositions[index][1])
    })
    expect(generated.connections).toEqual([
      ['Node 1', 'Node 2-1'],
      ['Node 1', 'Node 2-2'],
      ['Node 1', 'Node 2-3'],
      ['Node 1', 'Node 2-4'],
    ])
    expect(generated).toMatchObject({
      centerRetained: true,
      templatesRemoved: true,
      allPhysical: true,
      allNormalized: true,
      nodeDataCopied: true,
      edgeDataCopied: true,
      independentNodeData: true,
      independentEdgeData: true,
    })
    expectFreshUniqueIds(generated.slotIds, 'slot_template')
    expectFreshUniqueIds(generated.nodeProtocolIds, 'protocol_node_template')
    expectFreshUniqueIds(generated.edgeProtocolIds, 'protocol_edge_template')
    expect(new Set(generated.nodeIds).size).toBe(4)
    expect(new Set(generated.edgeIds).size).toBe(4)
  })

  test('preserves unrelated topology and normalizes reversed star edges across reload', async ({ page }) => {
    const projectName = 'Reversed Star Layout'
    await createProjectWithNodes(page, projectName, 3)
    await connectNodes(page, 0, 1)
    await connectNodes(page, 1, 2, false, 2)
    const templates = await configureTemplates(page, 'Node 1')

    const preservedIds = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      window.__preservedStarEntities = {
        center: projectData.net.nodes[1],
        unrelatedNode: projectData.net.nodes[2],
        unrelatedEdge: projectData.net.edges[1],
      }
      return {
        centerId: window.__preservedStarEntities.center.id,
        unrelatedNodeId: window.__preservedStarEntities.unrelatedNode.id,
        unrelatedEdgeId: window.__preservedStarEntities.unrelatedEdge.id,
      }
    })

    await openLayoutHelper(page, 'Star Network Generator')
    const dialog = page.getByRole('dialog', { name: 'Star Network Generator' })
    await dialog.locator('#star-center-node').selectOption({ label: 'Node 2' })
    await dialog.locator('#star-peripheral-node').selectOption({ label: 'Node 1' })
    await dialog.locator('#star-template-edge').selectOption({ index: 1 })
    await dialog.locator('#star-peripheral-count').fill('2')
    await dialog.getByRole('button', { name: 'Generate Star' }).click()

    const generated = await page.evaluate(({ templates }) => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const nodes = projectData.net.nodes
      const generatedEdges = projectData.net.edges.filter(edge => (
        edge.id !== window.__preservedStarEntities.unrelatedEdge.id
      ))
      return {
        names: nodes.map(node => node.name),
        generatedConnections: generatedEdges.map(edge => [edge.source.name, edge.target.name]),
        allGeneratedNormalized: generatedEdges.every(edge => (
          nodes.indexOf(edge.source) < nodes.indexOf(edge.target)
        )),
        centerPreserved: nodes[2] === window.__preservedStarEntities.center,
        unrelatedNodePreserved: nodes[3] === window.__preservedStarEntities.unrelatedNode,
        unrelatedEdgePreserved: projectData.net.edges[2] === window.__preservedStarEntities.unrelatedEdge
          && projectData.net.edges[2].source === window.__preservedStarEntities.center
          && projectData.net.edges[2].target === window.__preservedStarEntities.unrelatedNode,
        templatesRemoved: !nodes.some(node => node.id === templates.firstNodeId)
          && !projectData.net.edges.some(edge => edge.id === templates.edgeId),
      }
    }, { templates })
    expect(generated).toEqual({
      names: ['Node 1-1', 'Node 1-2', 'Node 2', 'Node 3'],
      generatedConnections: [
        ['Node 1-1', 'Node 2'],
        ['Node 1-2', 'Node 2'],
      ],
      allGeneratedNormalized: true,
      centerPreserved: true,
      unrelatedNodePreserved: true,
      unrelatedEdgePreserved: true,
      templatesRemoved: true,
    })

    await page.locator('.hamburger-btn').click()
    await page.getByRole('menuitem', { name: 'Save', exact: true }).click()
    await page.evaluate(name => localStorage.setItem('recentProjectName', name), projectName)
    await page.reload()
    await expect(page.locator('.node-marker')).toHaveCount(4, { timeout: 15_000 })

    const reloaded = await page.evaluate(({ preservedIds }) => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const nodes = projectData.net.nodes
      return {
        names: nodes.map(node => node.name),
        preservedIdsPresent: [
          preservedIds.centerId,
          preservedIds.unrelatedNodeId,
        ].every(id => nodes.some(node => node.id === id))
          && projectData.net.edges.some(edge => edge.id === preservedIds.unrelatedEdgeId),
        allNormalized: projectData.net.edges.every(edge => (
          nodes.indexOf(edge.source) < nodes.indexOf(edge.target)
        )),
      }
    }, { preservedIds })
    expect(reloaded).toEqual({
      names: generated.names,
      preservedIdsPresent: true,
      allNormalized: true,
    })
  })

  test('creates a 3 by 2 grid using the edge as its first x step', async ({ page }) => {
    await createProjectWithNodes(page, 'Grid Layout')
    await connectNodes(page, 0, 1)
    const templates = await configureTemplates(page)

    await openLayoutHelper(page, 'Graph Network Generator')
    const dialog = page.getByRole('dialog', { name: 'Graph Network Generator' })
    await dialog.locator('#graph-template-node').selectOption({ label: 'Node 1' })
    await dialog.locator('#graph-template-edge').selectOption({ index: 1 })
    await dialog.locator('#graph-grid-x-count').fill('7')
    await expect(dialog.getByRole('alert')).toContainText('between 1 and 6')
    await expect(dialog.getByRole('button', { name: 'Generate Graph' })).toBeDisabled()
    await dialog.locator('#graph-grid-x-count').fill('3')
    await dialog.locator('#graph-grid-y-count').fill('2')
    await dialog.getByRole('button', { name: 'Generate Graph' }).click()

    await expect(page.locator('.node-marker')).toHaveCount(6)
    await expect(page.locator('.edge-list-item')).toHaveCount(7)

    const generated = await page.evaluate(({ templates }) => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const nodes = projectData.net.nodes
      const edges = projectData.net.edges
      return {
        names: nodes.map(node => node.name),
        positions: nodes.map(node => [...node.position]),
        connections: edges.map(edge => [edge.source.name, edge.target.name]),
        templatesRemoved: !nodes.some(node => (
          node.id === templates.firstNodeId || node.id === templates.secondNodeId
        )) && !edges.some(edge => edge.id === templates.edgeId),
        allNormalized: edges.every(edge => nodes.indexOf(edge.source) < nodes.indexOf(edge.target)),
        nodeIds: nodes.map(node => node.id),
        slotIds: nodes.map(node => node.data.slots[0].id),
        nodeProtocolIds: nodes.map(node => node.data.protocols[0].id),
        edgeIds: edges.map(edge => edge.id),
        edgeProtocolIds: edges.map(edge => edge.data.protocols[0].id),
        copiedNodeData: nodes.every(node => node.data.customConfiguration.nested.value === 'node-template'),
        copiedEdgeData: edges.every(edge => edge.data.customConfiguration.fidelity === 0.91),
      }
    }, { templates })

    expect(generated.names).toEqual([
      'Node 1-1-1', 'Node 1-2-1', 'Node 1-3-1',
      'Node 1-1-2', 'Node 1-2-2', 'Node 1-3-2',
    ])
    const projectedSource = projectMapPosition(templates.sourcePosition)
    const projectedTarget = projectMapPosition(templates.targetPosition)
    const step = [
      projectedTarget[0] - projectedSource[0],
      projectedTarget[1] - projectedSource[1],
    ]
    const yStep = [-step[1], step[0]]
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const position = generated.positions[(y * 3) + x]
        const expectedPosition = unprojectMapPosition([
          projectedSource[0] + (x * step[0]) + (y * yStep[0]),
          projectedSource[1] + (x * step[1]) + (y * yStep[1]),
        ])
        expect(position[0]).toBeCloseTo(expectedPosition[0])
        expect(position[1]).toBeCloseTo(expectedPosition[1])
      }
    }
    expect(generated.connections).toEqual([
      ['Node 1-1-1', 'Node 1-2-1'],
      ['Node 1-1-1', 'Node 1-1-2'],
      ['Node 1-2-1', 'Node 1-3-1'],
      ['Node 1-2-1', 'Node 1-2-2'],
      ['Node 1-3-1', 'Node 1-3-2'],
      ['Node 1-1-2', 'Node 1-2-2'],
      ['Node 1-2-2', 'Node 1-3-2'],
    ])
    expect(generated).toMatchObject({
      templatesRemoved: true,
      allNormalized: true,
      copiedNodeData: true,
      copiedEdgeData: true,
    })
    expectFreshUniqueIds(generated.slotIds, 'slot_template')
    expectFreshUniqueIds(generated.nodeProtocolIds, 'protocol_node_template')
    expectFreshUniqueIds(generated.edgeProtocolIds, 'protocol_edge_template')
    expect(new Set(generated.nodeIds).size).toBe(6)
    expect(new Set(generated.edgeIds).size).toBe(7)
  })

  test('uses the template edge as the y step for a one-column grid', async ({ page }) => {
    await createProjectWithNodes(page, 'One Column Grid', 4)
    await connectNodes(page, 0, 1)
    await connectNodes(page, 2, 3, false, 2)
    const templates = await configureTemplates(page)
    await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app._instance.setupState.projectData
      delete projectData.net.edges[0].data.protocols
      window.__unrelatedLayoutEntities = {
        firstNode: projectData.net.nodes[2],
        secondNode: projectData.net.nodes[3],
        edge: projectData.net.edges[1],
      }
    })

    await openLayoutHelper(page, 'Graph Network Generator')
    const dialog = page.getByRole('dialog', { name: 'Graph Network Generator' })
    await dialog.locator('#graph-template-node').selectOption({ label: 'Node 1' })
    await dialog.locator('#graph-template-edge').selectOption({ index: 1 })
    await dialog.locator('#graph-grid-x-count').fill('1')
    await dialog.locator('#graph-grid-y-count').fill('2')
    await dialog.getByRole('button', { name: 'Generate Graph' }).click()

    const generated = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const generatedNodes = projectData.net.nodes.filter(node => node.name.startsWith('Node 1-'))
      const generatedEdge = projectData.net.edges.find(edge => edge !== window.__unrelatedLayoutEntities.edge)
      return {
        names: generatedNodes.map(node => node.name),
        positions: generatedNodes.map(node => [...node.position]),
        edgeCount: projectData.net.edges.length,
        edgeProtocols: generatedEdge.data.protocols,
        unrelatedNodesPreserved: projectData.net.nodes[2] === window.__unrelatedLayoutEntities.firstNode
          && projectData.net.nodes[3] === window.__unrelatedLayoutEntities.secondNode,
        unrelatedEdgePreserved: projectData.net.edges[1] === window.__unrelatedLayoutEntities.edge
          && projectData.net.edges[1].source === window.__unrelatedLayoutEntities.firstNode
          && projectData.net.edges[1].target === window.__unrelatedLayoutEntities.secondNode,
      }
    })
    expect(generated).toEqual({
      names: ['Node 1-1-1', 'Node 1-1-2'],
      positions: [templates.sourcePosition, templates.targetPosition],
      edgeCount: 2,
      edgeProtocols: [],
      unrelatedNodesPreserved: true,
      unrelatedEdgePreserved: true,
    })
  })

  test('creates and persists a circular all-to-all network with every unique pair', async ({ page }) => {
    const projectName = 'Complete Graph Layout'
    await createProjectWithNodes(page, projectName)
    await connectNodes(page, 0, 1, true)
    const templates = await configureTemplates(page)

    await openLayoutHelper(page, 'Graph Network Generator')
    const dialog = page.getByRole('dialog', { name: 'Graph Network Generator' })
    await dialog.locator('#graph-template-node').selectOption({ label: 'Node 1' })
    await dialog.locator('#graph-template-edge').selectOption({ index: 1 })
    await dialog.locator('#graph-topology').selectOption('all-to-all')
    await dialog.locator('#graph-complete-node-count').fill('13')
    await expect(dialog.getByRole('alert')).toContainText('between 2 and 12')
    await dialog.locator('#graph-complete-node-count').fill('4')
    await dialog.getByRole('button', { name: 'Generate Graph' }).click()

    await expect(page.locator('.node-marker')).toHaveCount(4)
    await expect(page.locator('.edge-list-item')).toHaveCount(6)

    const generated = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const nodes = projectData.net.nodes
      const edges = projectData.net.edges
      return {
        names: nodes.map(node => node.name),
        positions: nodes.map(node => [...node.position]),
        pairs: edges.map(edge => [edge.source.name, edge.target.name]),
        allVirtual: edges.every(edge => edge.isLogic === true),
        allNormalized: edges.every(edge => nodes.indexOf(edge.source) < nodes.indexOf(edge.target)),
      }
    })

    expect(generated.names).toEqual(['Node 1-1', 'Node 1-2', 'Node 1-3', 'Node 1-4'])
    expect(generated.positions[0]).toEqual(templates.sourcePosition)
    expect(generated.positions[1]).toEqual(templates.targetPosition)
    expect(generated.pairs).toEqual([
      ['Node 1-1', 'Node 1-2'],
      ['Node 1-1', 'Node 1-3'],
      ['Node 1-1', 'Node 1-4'],
      ['Node 1-2', 'Node 1-3'],
      ['Node 1-2', 'Node 1-4'],
      ['Node 1-3', 'Node 1-4'],
    ])
    expect(generated.allVirtual).toBe(true)
    expect(generated.allNormalized).toBe(true)

    const projectedPositions = generated.positions.map(projectMapPosition)
    const radii = projectedPositions.map(position => {
      const center = [
        projectedPositions.reduce((sum, point) => sum + point[0], 0) / 4,
        projectedPositions.reduce((sum, point) => sum + point[1], 0) / 4,
      ]
      return Math.hypot(position[0] - center[0], position[1] - center[1])
    })
    radii.forEach(radius => expect(radius).toBeCloseTo(radii[0]))

    await page.locator('.hamburger-btn').click()
    await page.getByRole('menuitem', { name: 'Save', exact: true }).click()
    await page.evaluate(name => localStorage.setItem('recentProjectName', name), projectName)
    await page.reload()
    await expect(page.locator('.node-marker')).toHaveCount(4, { timeout: 15_000 })
    await expect(page.locator('.edge-list-item')).toHaveCount(6)

    const reloaded = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const nodes = projectData.net.nodes
      return {
        names: nodes.map(node => node.name),
        positions: nodes.map(node => [...node.position]),
        allNormalized: projectData.net.edges.every(edge => (
          nodes.indexOf(edge.source) < nodes.indexOf(edge.target)
        )),
        allVirtual: projectData.net.edges.every(edge => edge.isLogic === true),
      }
    })
    expect(reloaded).toEqual({
      names: generated.names,
      positions: generated.positions,
      allNormalized: true,
      allVirtual: true,
    })
  })

  test('rejects out-of-bounds generated positions without removing templates', async ({ page }) => {
    await createProjectWithNodes(page, 'Bounded Layout')
    await connectNodes(page, 0, 1)

    const templateSnapshot = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const [center, peripheral] = projectData.net.nodes
      center.position = [0, 85]
      peripheral.position = [10, 85]
      return {
        nodeIds: projectData.net.nodes.map(node => node.id),
        edgeIds: projectData.net.edges.map(edge => edge.id),
      }
    })

    await openLayoutHelper(page, 'Star Network Generator')
    let dialog = page.getByRole('dialog', { name: 'Star Network Generator' })
    await dialog.locator('#star-center-node').selectOption({ label: 'Node 1' })
    await dialog.locator('#star-peripheral-node').selectOption({ label: 'Node 2' })
    await dialog.locator('#star-template-edge').selectOption({ index: 1 })
    await dialog.locator('#star-peripheral-count').fill('4')
    await dialog.getByRole('button', { name: 'Generate Star' }).click()

    await expect(page.getByRole('heading', { name: 'Unable to generate star network' })).toBeVisible()
    await expect(page.getByText('extend beyond valid map coordinates')).toBeVisible()
    await page.getByRole('button', { name: 'OK' }).click()

    await openLayoutHelper(page, 'Graph Network Generator')
    dialog = page.getByRole('dialog', { name: 'Graph Network Generator' })
    await dialog.locator('#graph-template-node').selectOption({ label: 'Node 1' })
    await dialog.locator('#graph-template-edge').selectOption({ index: 1 })
    await dialog.locator('#graph-grid-x-count').fill('2')
    await dialog.locator('#graph-grid-y-count').fill('2')
    await dialog.getByRole('button', { name: 'Generate Graph' }).click()

    await expect(page.getByRole('heading', { name: 'Unable to generate graph network' })).toBeVisible()
    await expect(page.getByText('extend beyond valid map coordinates')).toBeVisible()

    const afterFailures = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      return {
        nodeIds: projectData.net.nodes.map(node => node.id),
        edgeIds: projectData.net.edges.map(edge => edge.id),
        positions: projectData.net.nodes.map(node => [...node.position]),
      }
    })
    expect(afterFailures).toEqual({
      ...templateSnapshot,
      positions: [[0, 85], [10, 85]],
    })
  })
})
