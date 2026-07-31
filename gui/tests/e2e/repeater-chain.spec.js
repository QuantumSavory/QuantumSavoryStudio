import { test, expect } from '@playwright/test'
import { simulationNotFoundResponse } from './httpResponses.js'
import {
  addOneSlotToEachNode,
  mockParseAndDestroy,
  parseNetworkThroughRunner,
} from './simulationLifecycle.js'

const TAG_ALPHA = 'Example.Alpha.ReadyTag'
const TAG_BETA = 'Example.Beta.ReadyTag'
const TAG_CATALOG = {
  named_tags: [{
    type_id: TAG_ALPHA,
    display_name: 'ReadyTag',
    doc: 'Alpha ready tag.',
    fields: [],
  }, {
    type_id: TAG_BETA,
    display_name: 'ReadyTag',
    doc: 'Beta ready tag.',
    fields: [],
  }],
  general_signatures: [],
  allowed_data_types: [],
  unsafe_evaluation: false,
}

const REPEATER_AUTOMATION_PROTOCOL_TYPES = [{
  type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
  doc: 'Generate entanglement between two nodes.',
  group: 'edge',
  virtual: false,
  parameters: [{
    field: 'success_prob',
    type: 'Float64',
    defaultValue: 0.25,
    doc: 'Probability that an entanglement attempt succeeds.',
  }],
}, {
  type: 'QuantumSavory.ProtocolZoo.SwapperProt',
  doc: 'Swap entanglement at a node.',
  group: 'node',
  virtual: null,
  parameters: [{
    field: 'nodeL',
    type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
    defaultValue: 'Wildcard',
    doc: 'Remote low node, a predicate, or a wildcard.',
  }, {
    field: 'nodeH',
    type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
    defaultValue: 'Wildcard',
    doc: 'Remote high node, a predicate, or a wildcard.',
  }, {
    field: 'chooseL',
    type: 'Function',
    defaultValue: 'minimum',
    doc: 'Choose one candidate from the filtered low-node results.',
  }],
}, {
  type: 'QuantumSavory.ProtocolZoo.EntanglementTracker',
  doc: 'Track established entanglement at a node.',
  group: 'node',
  virtual: null,
  parameters: [],
}]

async function mockBackendMetadata(page, {
  knownFunctions = [],
  protocolTypes = [],
  tagCatalog = TAG_CATALOG,
} = {}) {
  const tagCatalogState = { requests: 0 }
  page.tagCatalogState = tagCatalogState
  await page.route('**/known_functions', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { known_functions: knownFunctions },
  }))
  await page.route('**/background_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { background_types: [] },
  }))
  await page.route('**/states_zoo_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { states_zoo_types: [] },
  }))
  await page.route('**/slot_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { slot_types: ['Qubit', 'Qumode'] },
  }))
  await page.route('**/protocol_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { protocol_types: protocolTypes },
  }))
  await page.route('**/tag_types', route => {
    tagCatalogState.requests += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: tagCatalog,
    })
  })
  await page.route('**/platform_info', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: {
      versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
      capabilities: { unsafe_code_evaluation: false },
    },
  }))
  await mockParseAndDestroy(page)
  await page.route('**/get_state**', route => route.fulfill(
    simulationNotFoundResponse(),
  ))
  await page.route('**/logs/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: true, logs: [], count: 0 },
  }))
}

async function createProjectWithNodes(page, projectName, count = 3, metadata = {}) {
  await mockBackendMetadata(page, metadata)
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.click('.hamburger-btn')
  await page.click('text=New')
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

async function connectNodes(page, sourceIndex, targetIndex, virtual = false) {
  const source = page.locator('.node-marker').nth(sourceIndex)
  const target = page.locator('.node-marker').nth(targetIndex)
  await source.hover()
  if (virtual) await page.keyboard.down('Shift')
  await source.locator('.connector.output').dragTo(target)
  if (virtual) await page.keyboard.up('Shift')
}

async function openGenerator(page) {
  const layoutTab = page.getByRole('tab', { name: 'Layout Tools' })
  await layoutTab.click()
  const helper = page.getByRole('button', { name: 'Repeater Chain Generator' })
  await helper.click()
  await expect(page.getByRole('dialog', { name: 'Repeater Chain Generator' })).toBeVisible()
}

async function fillGenerator(page, {
  start = 'Node 1',
  end = 'Node 2',
  template = 'Node 3',
  count = 3,
  createVirtualEdge = true,
} = {}) {
  await page.locator('#chain-start-node').selectOption({ label: start })
  await page.locator('#chain-end-node').selectOption({ label: end })
  await page.locator('#chain-template-node').selectOption({ label: template })
  await page.locator('#chain-template-edge').selectOption({ index: 1 })
  await page.locator('#chain-repeater-count').fill(String(count))
  await page.locator('#chain-create-virtual-edge').setChecked(createVirtualEdge)
}

test.describe('Layout Tools repeater chain generator', () => {
  test('shows contextual docs and rejects a repeater node with extra incident edges', async ({ page }) => {
    await createProjectWithNodes(page, 'Repeater Validation')
    await connectNodes(page, 2, 0)
    await connectNodes(page, 2, 1)
    await expect(page.locator('.edge-list-item')).toHaveCount(2)

    await page.getByRole('tab', { name: 'Layout Tools' }).click()
    await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible()
    await expect(page.getByText('Alt-click the map to add a node.')).toBeVisible()

    const helper = page.getByRole('button', { name: 'Repeater Chain Generator' })
    await helper.hover()
    await expect(page.getByRole('heading', { name: 'Repeater Chain Generator' })).toBeVisible()
    await expect(page.getByText('Create an evenly spaced chain')).toBeVisible()
    await page.getByRole('heading', { name: 'Helpers' }).hover()
    await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible()

    await openGenerator(page)
    await expect(page.locator('#chain-create-virtual-edge')).toBeChecked()
    await fillGenerator(page)
    await expect(page.getByRole('alert')).toContainText('must have exactly one incident edge')
    await expect(page.getByRole('button', { name: 'Generate Chain' })).toBeDisabled()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog', { name: 'Repeater Chain Generator' })).toHaveCount(0)
    await expect(page.locator('.node-marker')).toHaveCount(3)
    await expect(page.locator('.edge-list-item')).toHaveCount(2)

    await openGenerator(page)
    await expect(page.locator('#chain-create-virtual-edge')).toBeChecked()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await addOneSlotToEachNode(page)
    await parseNetworkThroughRunner(page)
    await expect(helper).toBeDisabled()
    await expect(page.getByText(
      'Network editing is unavailable after a simulation has started. Annotations remain available.',
    )).toBeVisible()
  })

  test('clones a configured virtual template into an evenly spaced persistent chain', async ({ page }) => {
    const projectName = 'Repeater Generation'
    await createProjectWithNodes(page, projectName)
    await connectNodes(page, 2, 0, true)
    await expect(page.locator('.edge-list-item')).toHaveCount(1)

    const templateIds = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const templateNode = projectData.net.nodes.find(node => node.name === 'Node 3')
      const templateEdge = projectData.net.edges[0]

      templateNode.data.type = 'configured-node'
      templateNode.data.slots.push({
        id: 'slot_template',
        type: 'Qubit',
        backgroundNoise: {
          type: 'custom',
          parameters: [{
            field: 'rate',
            type: 'Float64',
            selectedType: 'Float64',
            value: 0.25,
          }],
        },
        assignment: false,
        isLocked: false,
      })
      templateNode.data.protocols.push({
        id: 'protocol_node_template',
        type: 'TestNodeProtocol',
        parameters: [{
          name: 'rounds',
          type: 'Int64',
          selectedType: 'Int64',
          value: 7,
        }],
      })
      templateEdge.data.type = 'configured-edge'
      templateEdge.data.protocols.push({
        id: 'protocol_edge_template',
        type: 'TestEdgeProtocol',
        parameters: [{
          name: 'attempts',
          type: 'Int64',
          selectedType: 'Int64',
          value: 5,
        }],
      })

      return { nodeId: templateNode.id, edgeId: templateEdge.id }
    })

    await openGenerator(page)
    await fillGenerator(page, { count: 3 })
    await page.getByRole('button', { name: 'Generate Chain' }).click()
    await expect(page.getByRole('dialog', { name: 'Repeater Chain Generator' })).toHaveCount(0)

    await expect(page.locator('.node-marker')).toHaveCount(5)
    await expect(page.locator('.edge-list-item')).toHaveCount(5)

    const generated = await page.evaluate(({ templateIds }) => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const nodes = projectData.net.nodes
      const edges = projectData.net.edges
      const repeaters = nodes.filter(node => node.name.startsWith('Node 3-'))
      const chainEdges = edges.filter(edge => edge.data.protocols.length > 0)
      const virtualEdge = edges.find(edge => (
        new Set([edge.source.name, edge.target.name]).size === 2
        && [edge.source.name, edge.target.name].includes('Node 1')
        && [edge.source.name, edge.target.name].includes('Node 2')
      ))

      return {
        nodeNames: repeaters.map(node => node.name),
        positions: repeaters.map(node => [...node.position]),
        startPosition: [...nodes.find(node => node.name === 'Node 1').position],
        endPosition: [...nodes.find(node => node.name === 'Node 2').position],
        connections: edges.map(edge => [edge.source.name, edge.target.name]),
        allVirtual: edges.every(edge => edge.isLogic === true),
        allEdgesNormalized: edges.every(edge => (
          nodes.indexOf(edge.source) < nodes.indexOf(edge.target)
        )),
        virtualEdgeIsEmpty: virtualEdge?.isLogic === true
          && virtualEdge.data.type === 'connection'
          && virtualEdge.data.protocols.length === 0,
        templateNodeRemoved: !nodes.some(node => node.id === templateIds.nodeId),
        templateEdgeRemoved: !edges.some(edge => edge.id === templateIds.edgeId),
        nodeIds: repeaters.map(node => node.id),
        slotIds: repeaters.map(node => node.data.slots[0].id),
        nodeProtocolIds: repeaters.map(node => node.data.protocols[0].id),
        edgeIds: edges.map(edge => edge.id),
        edgeProtocolIds: chainEdges.map(edge => edge.data.protocols[0].id),
        nodeConfigurationCopied: repeaters.every(node =>
          node.data.type === 'configured-node'
          && node.data.slots[0].backgroundNoise.parameters[0].value === 0.25
          && node.data.protocols[0].parameters[0].value === 7
        ),
        edgeConfigurationCopied: chainEdges.every(edge =>
          edge.data.type === 'configured-edge'
          && edge.data.protocols[0].parameters[0].value === 5
        ),
        independentNodeData: repeaters[0].data !== repeaters[1].data
          && repeaters[0].data.slots !== repeaters[1].data.slots
          && repeaters[0].data.slots[0].backgroundNoise
            !== repeaters[1].data.slots[0].backgroundNoise
          && repeaters[0].data.protocols !== repeaters[1].data.protocols,
        independentEdgeData: chainEdges[0].data !== chainEdges[1].data
          && chainEdges[0].data.protocols !== chainEdges[1].data.protocols
          && chainEdges[0].data.protocols[0].parameters
            !== chainEdges[1].data.protocols[0].parameters,
      }
    }, { templateIds })

    expect(generated.nodeNames).toEqual(['Node 3-1', 'Node 3-2', 'Node 3-3'])
    for (let index = 0; index < generated.positions.length; index += 1) {
      const fraction = (index + 1) / 4
      expect(generated.positions[index][0]).toBeCloseTo(
        generated.startPosition[0] + ((generated.endPosition[0] - generated.startPosition[0]) * fraction),
      )
      expect(generated.positions[index][1]).toBeCloseTo(
        generated.startPosition[1] + ((generated.endPosition[1] - generated.startPosition[1]) * fraction),
      )
    }
    expect(generated.connections).toEqual([
      ['Node 1', 'Node 3-1'],
      ['Node 3-1', 'Node 3-2'],
      ['Node 3-2', 'Node 3-3'],
      ['Node 2', 'Node 3-3'],
      ['Node 1', 'Node 2'],
    ])
    expect(generated.allVirtual).toBe(true)
    expect(generated.allEdgesNormalized).toBe(true)
    expect(generated.virtualEdgeIsEmpty).toBe(true)
    expect(generated.templateNodeRemoved).toBe(true)
    expect(generated.templateEdgeRemoved).toBe(true)
    expect(generated.nodeConfigurationCopied).toBe(true)
    expect(generated.edgeConfigurationCopied).toBe(true)
    expect(generated.independentNodeData).toBe(true)
    expect(generated.independentEdgeData).toBe(true)

    for (const ids of [
      generated.nodeIds,
      generated.slotIds,
      generated.nodeProtocolIds,
      generated.edgeIds,
      generated.edgeProtocolIds,
    ]) {
      expect(new Set(ids).size).toBe(ids.length)
    }
    expect(generated.slotIds).not.toContain('slot_template')
    expect(generated.nodeProtocolIds).not.toContain('protocol_node_template')
    expect(generated.edgeProtocolIds).not.toContain('protocol_edge_template')

    await page.click('.hamburger-btn')
    await page.getByText('Save', { exact: true }).click()
    await page.evaluate(name => localStorage.setItem('recentProjectName', name), projectName)
    await page.reload()
    await expect(page.locator('.node-marker')).toHaveCount(5, { timeout: 15_000 })
    await expect(page.locator('.edge-list-item')).toHaveCount(5)
    await expect(page.locator('.node-marker .node-name')).toHaveText([
      'Node 1',
      'Node 2',
      'Node 3-1',
      'Node 3-2',
      'Node 3-3',
    ])

    const reloadedEdges = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const nodes = projectData.net.nodes
      return projectData.net.edges.map(edge => ({
        sourceIndex: nodes.indexOf(edge.source),
        targetIndex: nodes.indexOf(edge.target),
        isLogic: edge.isLogic,
        protocolCount: edge.data.protocols.length,
      }))
    })
    expect(reloadedEdges).toHaveLength(5)
    expect(reloadedEdges.every(edge => edge.sourceIndex < edge.targetIndex)).toBe(true)
    expect(reloadedEdges).toContainEqual({
      sourceIndex: 0,
      targetIndex: 1,
      isLogic: true,
      protocolCount: 0,
    })
  })

  test('replaces seeded chain protocols with configured automation and eager predicates', async ({ page }) => {
    await createProjectWithNodes(page, 'Repeater Protocol Automation', 3, {
      knownFunctions: ['minimum', 'maximum'],
      protocolTypes: REPEATER_AUTOMATION_PROTOCOL_TYPES,
    })
    await connectNodes(page, 2, 0)

    const seededIds = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const startNode = projectData.net.nodes.find(node => node.name === 'Node 1')
      const endNode = projectData.net.nodes.find(node => node.name === 'Node 2')
      const templateNode = projectData.net.nodes.find(node => node.name === 'Node 3')
      const templateEdge = projectData.net.edges[0]

      const tracker = id => ({
        id,
        type: 'QuantumSavory.ProtocolZoo.EntanglementTracker',
        parameters: [],
      })
      const swapper = (id, chooseL, suffix) => ({
        id,
        type: 'QuantumSavory.ProtocolZoo.SwapperProt',
        parameters: [{
          name: 'nodeL',
          type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
          selectedType: 'Lambda',
          value: `x -> x == nodeid(\"seed-low-${suffix}\")`,
        }, {
          name: 'nodeH',
          type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
          selectedType: 'Lambda',
          value: `x -> x == nodeid(\"seed-high-${suffix}\")`,
        }, {
          name: 'chooseL',
          type: 'Function',
          selectedType: 'Function',
          value: chooseL,
        }],
      })

      startNode.data.protocols.push({
        id: 'protocol_start_unrelated',
        type: 'StartNodeProtocol',
        parameters: [{ name: 'marker', type: 'String', value: 'keep-start' }],
      })
      startNode.data.protocols.push(tracker('protocol_start_tracker_first'))
      startNode.data.protocols.push(tracker('protocol_start_tracker_duplicate'))

      endNode.data.protocols.push({
        id: 'protocol_end_unrelated',
        type: 'EndNodeProtocol',
        parameters: [{ name: 'marker', type: 'String', value: 'keep-end' }],
      })
      endNode.data.protocols.push(tracker('protocol_end_tracker_first'))
      endNode.data.protocols.push(tracker('protocol_end_tracker_duplicate'))

      templateNode.data.protocols.push({
        id: 'protocol_template_unrelated',
        type: 'TemplateNodeProtocol',
        parameters: [{ name: 'marker', type: 'String', value: 'keep-repeater' }],
      })
      templateNode.data.protocols.push(swapper('protocol_swapper_first', 'minimum', 'first'))
      templateNode.data.protocols.push(swapper('protocol_swapper_duplicate', 'maximum', 'duplicate'))
      templateNode.data.protocols.push(tracker('protocol_template_tracker_first'))
      templateNode.data.protocols.push(tracker('protocol_template_tracker_duplicate'))

      templateEdge.data.protocols.push({
        id: 'protocol_edge_unrelated',
        type: 'TemplateEdgeProtocol',
        parameters: [{ name: 'marker', type: 'String', value: 'keep-edge' }],
      })
      templateEdge.data.protocols.push({
        id: 'protocol_entangler_first',
        type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
        parameters: [{ name: 'success_prob', type: 'Float64', value: 0.35 }],
      })
      templateEdge.data.protocols.push({
        id: 'protocol_entangler_duplicate',
        type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
        parameters: [{ name: 'success_prob', type: 'Float64', value: 0.95 }],
      })

      return {
        targeted: [
          'protocol_start_tracker_first',
          'protocol_start_tracker_duplicate',
          'protocol_end_tracker_first',
          'protocol_end_tracker_duplicate',
          'protocol_swapper_first',
          'protocol_swapper_duplicate',
          'protocol_template_tracker_first',
          'protocol_template_tracker_duplicate',
          'protocol_entangler_first',
          'protocol_entangler_duplicate',
        ],
        endpointUnrelated: ['protocol_start_unrelated', 'protocol_end_unrelated'],
      }
    })

    await openGenerator(page)
    await fillGenerator(page, { count: 3 })
    const dialog = page.getByRole('dialog', { name: 'Repeater Chain Generator' })

    await dialog.locator('#chain-replace-entangler').setChecked(true)
    const entanglerConstructor = dialog.locator('.constructor-panel', {
      hasText: 'EntanglerProt constructor',
    })
    const successProbability = entanglerConstructor.locator('.param-item', {
      hasText: 'success_prob',
    }).locator('input[type="number"]')
    await expect(successProbability).toHaveValue('0.35')
    await successProbability.fill('0.73')

    await dialog.locator('#chain-replace-swapper').setChecked(true)
    const swapperConstructor = dialog.locator('.constructor-panel', {
      hasText: 'SwapperProt constructor',
    })
    const chooseL = swapperConstructor.locator('.param-item', { hasText: 'chooseL' })
    await expect(chooseL.locator('.complexTypeSelector')).toHaveValue('Function')
    await expect(chooseL.locator('.functionSelector')).toHaveValue('minimum')

    await dialog.getByRole('radio', { name: 'Eager swaps' }).check()
    for (const parameterName of ['nodeL', 'nodeH']) {
      const parameter = swapperConstructor.locator('.param-item', { hasText: parameterName })
      await expect(parameter.locator('.complexTypeSelector')).toBeDisabled()
      await expect(parameter).toContainText(
        'Strategy-controlled: Set separately for each repeater by the selected predicate strategy.',
      )
    }
    await expect(swapperConstructor).toContainText(
      'nodeL and nodeH are set separately for each repeater by the selected strategy.',
    )

    await dialog.locator('#chain-replace-tracker').setChecked(true)
    const trackerConstructor = dialog.locator('.constructor-panel', {
      hasText: 'EntanglementTracker constructor',
    })
    await expect(trackerConstructor).toContainText(
      'This protocol currently has no configurable constructor parameters.',
    )
    const guidance = dialog.getByRole('note', { name: 'Repeater protocol guidance' })
    await expect(guidance).toContainText('Aggressive or mismatched predicates')
    await expect(guidance).toContainText('CutoffProt')

    await dialog.getByRole('button', { name: 'Generate Chain' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.node-marker')).toHaveCount(5)
    await expect(page.locator('.edge-list-item')).toHaveCount(5)

    const generated = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const nodes = projectData.net.nodes
      const edges = projectData.net.edges
      const simpleName = protocol => protocol.type.split('.').pop()
      const namedProtocols = (protocols, name) => (
        protocols.filter(protocol => simpleName(protocol) === name)
      )
      const parameter = (protocol, name) => (
        protocol.parameters.find(candidate => candidate.name === name)
      )
      const summarizeProtocol = protocol => ({
        id: protocol.id,
        type: simpleName(protocol),
        parameters: protocol.parameters,
      })

      const startNode = nodes.find(node => node.name === 'Node 1')
      const endNode = nodes.find(node => node.name === 'Node 2')
      const repeaters = nodes.filter(node => node.name.startsWith('Node 3-'))
      const physicalEdges = edges.filter(edge => edge.isLogic !== true)
      const directVirtualEdge = edges.find(edge => (
        edge.isLogic === true
        && [edge.source.name, edge.target.name].includes('Node 1')
        && [edge.source.name, edge.target.name].includes('Node 2')
      ))

      const repeaterSummaries = repeaters.map(node => {
        const swappers = namedProtocols(node.data.protocols, 'SwapperProt')
        const trackers = namedProtocols(node.data.protocols, 'EntanglementTracker')
        const unrelated = namedProtocols(node.data.protocols, 'TemplateNodeProtocol')
        const swapperProtocol = swappers[0]
        return {
          name: node.name,
          swapperCount: swappers.length,
          trackerCount: trackers.length,
          unrelatedCount: unrelated.length,
          unrelatedMarker: unrelated[0]?.parameters[0]?.value,
          swapper: swapperProtocol && {
            id: swapperProtocol.id,
            nodeL: parameter(swapperProtocol, 'nodeL'),
            nodeH: parameter(swapperProtocol, 'nodeH'),
            chooseL: parameter(swapperProtocol, 'chooseL')?.value,
          },
          tracker: trackers[0] && summarizeProtocol(trackers[0]),
        }
      })

      const edgeSummaries = physicalEdges.map(edge => {
        const entanglers = namedProtocols(edge.data.protocols, 'EntanglerProt')
        const unrelated = namedProtocols(edge.data.protocols, 'TemplateEdgeProtocol')
        return {
          endpoints: [edge.source.name, edge.target.name],
          entanglerCount: entanglers.length,
          unrelatedCount: unrelated.length,
          unrelatedMarker: unrelated[0]?.parameters[0]?.value,
          entangler: entanglers[0] && {
            id: entanglers[0].id,
            successProbability: Number(parameter(entanglers[0], 'success_prob')?.value),
          },
        }
      })

      const endpointSummaries = [startNode, endNode].map(node => {
        const trackers = namedProtocols(node.data.protocols, 'EntanglementTracker')
        const unrelated = node.data.protocols.filter(protocol => (
          ['StartNodeProtocol', 'EndNodeProtocol'].includes(simpleName(protocol))
        ))
        return {
          name: node.name,
          trackerCount: trackers.length,
          tracker: trackers[0] && summarizeProtocol(trackers[0]),
          unrelated: unrelated.map(summarizeProtocol),
        }
      })

      return {
        repeaterSummaries,
        edgeSummaries,
        endpointSummaries,
        virtualEdge: directVirtualEdge && {
          type: directVirtualEdge.data.type,
          protocolCount: directVirtualEdge.data.protocols.length,
        },
        templateNodeRemoved: !nodes.some(node => node.name === 'Node 3'),
        targetedIds: [
          ...edgeSummaries.map(edge => edge.entangler.id),
          ...repeaterSummaries.map(node => node.swapper.id),
          ...repeaterSummaries.map(node => node.tracker.id),
          ...endpointSummaries.map(node => node.tracker.id),
        ],
      }
    })

    expect(generated.templateNodeRemoved).toBe(true)
    expect(generated.edgeSummaries).toHaveLength(4)
    for (const edge of generated.edgeSummaries) {
      expect(edge.entanglerCount).toBe(1)
      expect(edge.unrelatedCount).toBe(1)
      expect(edge.unrelatedMarker).toBe('keep-edge')
      expect(edge.entangler.successProbability).toBeCloseTo(0.73)
    }

    const eagerNodeL = 'x -> (x < self && x >= nodeid("Node 3-1")) || x == nodeid("Node 1")'
    const eagerNodeH = 'x -> (x > self && x <= nodeid("Node 3-3")) || x == nodeid("Node 2")'
    expect(generated.repeaterSummaries.map(node => node.name)).toEqual([
      'Node 3-1',
      'Node 3-2',
      'Node 3-3',
    ])
    for (const repeater of generated.repeaterSummaries) {
      expect(repeater.swapperCount).toBe(1)
      expect(repeater.trackerCount).toBe(1)
      expect(repeater.unrelatedCount).toBe(1)
      expect(repeater.unrelatedMarker).toBe('keep-repeater')
      expect(repeater.swapper.chooseL).toBe('minimum')
      expect(repeater.swapper.nodeL).toMatchObject({
        selectedType: 'Lambda',
        value: eagerNodeL,
      })
      expect(repeater.swapper.nodeH).toMatchObject({
        selectedType: 'Lambda',
        value: eagerNodeH,
      })
      expect(repeater.tracker.parameters).toEqual([])
    }

    expect(generated.endpointSummaries.map(node => ({
      name: node.name,
      trackerCount: node.trackerCount,
      unrelatedIds: node.unrelated.map(protocol => protocol.id),
    }))).toEqual([{
      name: 'Node 1',
      trackerCount: 1,
      unrelatedIds: ['protocol_start_unrelated'],
    }, {
      name: 'Node 2',
      trackerCount: 1,
      unrelatedIds: ['protocol_end_unrelated'],
    }])
    expect(generated.endpointSummaries.every(node => (
      node.tracker.parameters.length === 0 && node.unrelated.length === 1
    ))).toBe(true)
    expect(generated.virtualEdge).toEqual({ type: 'connection', protocolCount: 0 })

    expect(new Set(generated.targetedIds).size).toBe(generated.targetedIds.length)
    expect(generated.targetedIds.some(id => seededIds.targeted.includes(id))).toBe(false)
    expect(seededIds.endpointUnrelated).toEqual([
      'protocol_start_unrelated',
      'protocol_end_unrelated',
    ])
  })

  test('selects qualified named tags in the shared layout constructor above the dialog', async ({ page }) => {
    const taggedProtocolTypes = REPEATER_AUTOMATION_PROTOCOL_TYPES.map(definition => (
      definition.type.endsWith('.EntanglerProt')
        ? {
            ...definition,
            parameters: [...definition.parameters, {
              field: 'tag',
              type: 'Union{Nothing, Type{<:QuantumSavory.AbstractTag}}',
              kind: 'named_tag_type',
              nullable: true,
              doc: 'Named tag head.',
            }],
          }
        : definition
    ))
    await createProjectWithNodes(page, 'Repeater Named Tag Automation', 3, {
      knownFunctions: ['minimum'],
      protocolTypes: taggedProtocolTypes,
    })
    await connectNodes(page, 2, 0)
    await page.evaluate(({ savedTag }) => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      projectData.net.edges[0].data.protocols.push({
        id: 'protocol_entangler_named_tag',
        type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
        parameters: [{
          name: 'tag',
          type: 'Any',
          value: savedTag,
        }],
      })
    }, { savedTag: TAG_BETA })

    await openGenerator(page)
    await fillGenerator(page, { count: 2 })
    const dialog = page.getByRole('dialog', { name: 'Repeater Chain Generator' })
    await dialog.locator('#chain-replace-entangler').setChecked(true)
    const constructor = dialog.locator('.constructor-panel', {
      hasText: 'EntanglerProt constructor',
    })
    const tagInput = constructor.getByRole('combobox', { name: 'tag named tag type' })

    await expect(tagInput).toHaveValue(`ReadyTag — ${TAG_BETA}`)
    await tagInput.fill('Example.Alpha')
    const overlay = page.locator('.p-autocomplete-overlay.named-tag-type-overlay')
    await expect(overlay).toBeVisible()
    const layers = await page.evaluate(() => {
      const popup = document.querySelector('.p-autocomplete-overlay.named-tag-type-overlay')
      const modal = document.querySelector('.p-dialog-mask.app-dialog-mask')
      return {
        popup: Number.parseInt(getComputedStyle(popup).zIndex, 10),
        modal: Number.parseInt(getComputedStyle(modal).zIndex, 10),
      }
    })
    expect(layers.popup).toBeGreaterThan(layers.modal)

    await page.getByRole('option', { name: /ReadyTag.*Example\.Alpha/ }).click()
    await expect(tagInput).toHaveValue(`ReadyTag — ${TAG_ALPHA}`)
    expect(page.tagCatalogState.requests).toBe(1)

    await dialog.getByRole('button', { name: 'Generate Chain' }).click()
    await expect(dialog).toHaveCount(0)
    const generatedTags = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      return projectData.net.edges
        .filter(edge => edge.isLogic !== true)
        .map(edge => edge.data.protocols.find(protocol => (
          protocol.type.endsWith('.EntanglerProt')
        )))
        .map(protocol => protocol.parameters.find(parameter => parameter.name === 'tag'))
    })
    expect(generatedTags).toHaveLength(3)
    expect(generatedTags).toEqual(Array.from({ length: 3 }, () => ({
      name: 'tag',
      type: 'Any',
      selectedType: 'DataType',
      value: TAG_ALPHA,
    })))
  })

  test('can omit the end-to-end virtual edge', async ({ page }) => {
    await createProjectWithNodes(page, 'Repeater Without Virtual Edge')
    await connectNodes(page, 2, 0)

    await openGenerator(page)
    await fillGenerator(page, { count: 2, createVirtualEdge: false })
    await expect(page.locator('#chain-create-virtual-edge')).not.toBeChecked()
    await page.getByRole('button', { name: 'Generate Chain' }).click()

    await expect(page.locator('.node-marker')).toHaveCount(4)
    await expect(page.locator('.edge-list-item')).toHaveCount(3)

    const generated = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const projectData = app?._instance?.setupState?.projectData
      const nodes = projectData.net.nodes
      const edges = projectData.net.edges
      return {
        allPhysical: edges.every(edge => edge.isLogic === false),
        allEdgesNormalized: edges.every(edge => (
          nodes.indexOf(edge.source) < nodes.indexOf(edge.target)
        )),
        hasDirectEndpointEdge: edges.some(edge => (
          new Set([edge.source.name, edge.target.name]).size === 2
          && [edge.source.name, edge.target.name].includes('Node 1')
          && [edge.source.name, edge.target.name].includes('Node 2')
        )),
      }
    })

    expect(generated).toEqual({
      allPhysical: true,
      allEdgesNormalized: true,
      hasDirectEndpointEdge: false,
    })
  })
})
