import { test, expect } from '@playwright/test'
import { canonicalErrorResponse } from './httpResponses.js'
import { backendPlatformInfo } from '../platformInfoFixtures.js'
import {
  replaceStoredProjectAndReload,
  saveAndReadProject,
} from './projectBoundary.js'
import {
  addOneSlotToEachNode,
  mockParseAndDestroy,
  parsePayloadThroughRunner,
  stopSimulationThroughRunner,
} from './simulationLifecycle.js'

const KNOWN_FUNCTIONS = [
  'minimum',
  'maximum',
  'abs',
  'identity',
  '<(self)',
  '>(self)',
  '≤(self)',
  '≥(self)',
  '==(self)',
]

const SELF_FUNCTIONS = KNOWN_FUNCTIONS.filter(name => name.endsWith('(self)'))
const TAG_ALPHA = 'Example.Alpha.ReadyTag'
const TAG_BETA = 'Example.Beta.ReadyTag'
const TAG_UNIQUE = 'QuantumSavory.EntanglementCounterpart'
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
  }, {
    type_id: TAG_UNIQUE,
    display_name: 'EntanglementCounterpart',
    doc: 'Counterpart tag.',
    fields: [],
  }],
  general_signatures: [],
  allowed_data_types: [],
  unsafe_evaluation: false,
}

const SWAPPER_TYPE = {
  type: 'QuantumSavory.ProtocolZoo.SwapperProt',
  doc: 'Swap entanglement at a node.',
  group: 'node',
  virtual: null,
  parameters: [
    {
      field: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      doc: 'Remote low node, a predicate, or a wildcard.',
    },
    {
      field: 'nodeH',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      doc: 'Remote high node, a predicate, or a wildcard.',
    },
    {
      field: 'chooseL',
      type: 'Function',
      doc: 'Choose one candidate from the filtered low-node results.',
    },
  ],
}

const ENTANGLER_TYPE = {
  type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
  doc: 'Generate entanglement between two nodes.',
  group: 'edge',
  virtual: false,
  parameters: [{
    field: 'chooseslotA',
    type: ['Int64', 'Function'],
    doc: 'Select a slot in node A by index or predicate.',
  }, {
    field: 'retry_lock_time',
    type: ['Nothing', 'Float64'],
    doc: 'Optional delay before retrying.',
  }, {
    field: 'tag',
    type: 'Union{Nothing, Type{<:QuantumSavory.AbstractTag}}',
    kind: 'named_tag_type',
    nullable: true,
    doc: 'Named tag head for generated entanglement.',
  }],
}

const CONSUMER_TYPE = {
  type: 'QuantumSavory.ProtocolZoo.EntanglementConsumer',
  doc: 'Consume entanglement between two nodes.',
  group: 'edge',
  virtual: false,
  parameters: [{
    field: 'tag',
    type: 'Type{<:QuantumSavory.AbstractTag}',
    kind: 'named_tag_type',
    nullable: false,
    doc: 'Named tag head to consume.',
  }],
}

async function mockConfiguration(page) {
  const tagCatalogState = { requests: 0, fail: false }
  page.tagCatalogState = tagCatalogState
  await page.route('**/known_functions', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { known_functions: KNOWN_FUNCTIONS },
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
    json: { protocol_types: [SWAPPER_TYPE, ENTANGLER_TYPE, CONSUMER_TYPE] },
  }))
  await page.route('**/tag_types', route => {
    tagCatalogState.requests += 1
    return route.fulfill(tagCatalogState.fail ? canonicalErrorResponse({
      code: 'SERVER_ERROR',
      message: 'Named tag catalog unavailable',
      status: 503,
      details: { catalog: 'tag_types' },
    }) : {
      status: 200,
      contentType: 'application/json',
      json: TAG_CATALOG,
    })
  })
  await page.route('**/platform_info', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: backendPlatformInfo(),
  }))
  await mockParseAndDestroy(page)
}

async function createProjectWithEdge(page) {
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  await page.goto('/')
  await protocolTypesLoaded
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.locator('.hamburger-btn').click()
  await page.getByText('New', { exact: true }).click()
  await page.getByPlaceholder('Project name').fill('Protocol Parameter Options')
  await page.locator('button.primary').click()

  await page.keyboard.down('Alt')
  await page.locator('canvas').first().click({ position: { x: 400, y: 300 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(1)

  await page.keyboard.down('Alt')
  await page.locator('canvas').first().click({ position: { x: 600, y: 400 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(2)

  const firstNode = page.locator('.node-marker').first()
  await firstNode.hover()
  await firstNode.locator('.connector.output').dragTo(page.locator('.node-marker').nth(1))
  await expect(page.locator('.edge-list-item')).toHaveCount(1)

  const fixture = await saveAndReadProject(page, 'Protocol Parameter Options')
  fixture.net.nodes[0].data.protocols.push({
    id: 'protocol_swapper_parameter_options',
    type: 'QuantumSavory.ProtocolZoo.SwapperProt',
    parameters: [{
      name: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      selectedType: 'default',
      value: null,
    }, {
      name: 'nodeH',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      selectedType: 'default',
      value: null,
    }, {
      name: 'chooseL',
      type: 'Function',
      selectedType: 'default',
      value: null,
    }],
  })
  fixture.net.edges[0].data.protocols.push({
    id: 'protocol_entangler_parameter_options',
    type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
    parameters: [{
      name: 'chooseslotA',
      type: ['Int64', 'Function'],
      selectedType: 'default',
      value: null,
    }, {
      name: 'retry_lock_time',
      type: ['Nothing', 'Float64'],
      selectedType: 'default',
      value: null,
    }, {
      name: 'tag',
      type: ['Nothing', 'DataType'],
      selectedType: 'DataType',
      value: TAG_BETA,
    }],
  })
  fixture.net.edges[0].data.protocols.push({
    id: 'protocol_consumer_parameter_options',
    type: 'QuantumSavory.ProtocolZoo.EntanglementConsumer',
    parameters: [{
      name: 'tag',
      type: 'Any',
      selectedType: 'default',
      value: null,
    }],
  })
  await replaceStoredProjectAndReload(page, fixture)
  await expect(page.locator('.node-marker')).toHaveCount(2)
  await expect(page.locator('.edge-list-item')).toHaveCount(1)
  await addOneSlotToEachNode(page)
}

function parameterRow(editor, name) {
  return editor.locator('.param-item').filter({ hasText: name })
}

async function openProtocolEditor(panel, protocolName) {
  const editor = panel.locator('.protocol-editor', { hasText: protocolName })
  await expect(editor).toBeVisible()
  await editor.locator('.protocol-list-type').click()
  await expect(editor.locator('.protocol-container')).toBeVisible()
  return editor
}

function nodeParameter(payload, name) {
  return payload.net.nodes[0].data.protocols[0].parameters.find(
    parameter => parameter.name === name,
  )
}

function edgeParameter(payload, name, protocolType = ENTANGLER_TYPE.type) {
  const protocol = payload.net.edges[0].data.protocols.find(
    candidate => candidate.type === protocolType,
  )
  return protocol?.parameters.find(parameter => parameter.name === name)
}

async function capturePayloadAndUnlock(page) {
  const payload = await parsePayloadThroughRunner(page)
  await stopSimulationThroughRunner(page)
  return payload
}

test.describe('Protocol parameter options', () => {
  test.beforeEach(async ({ page }) => {
    await mockConfiguration(page)
    await createProjectWithEdge(page)
  })

  test('supports Wildcard and self predicates for node protocols only', async ({ page }) => {
    await page.locator('.node-marker').first().click()
    const swapperEditor = await openProtocolEditor(page.locator('#nodePanel'), 'SwapperProt')
    const nodeLRow = parameterRow(swapperEditor, 'nodeL')
    const nodeLTypeSelector = nodeLRow.locator('.complexTypeSelector')

    await expect(nodeLTypeSelector.locator('option[value="QuantumSavory.Wildcard"]')).toBeEnabled()
    await nodeLTypeSelector.selectOption('Function')

    const nodeFunctionSelector = nodeLRow.locator('.functionSelector')
    await expect(nodeFunctionSelector).toBeVisible()
    for (const name of KNOWN_FUNCTIONS) {
      await expect(nodeFunctionSelector.locator(`option[value="${name}"]`)).toBeEnabled()
    }

    await nodeLTypeSelector.selectOption('QuantumSavory.Wildcard')
    await expect(nodeLRow.locator('.param-value')).toHaveText('Wildcard')
    await expect(nodeLRow.locator('.param-value input, .param-value select')).toHaveCount(0)

    const wildcardPayload = await capturePayloadAndUnlock(page)
    const serializedParameter = nodeParameter(wildcardPayload, 'nodeL')
    expect(serializedParameter).toEqual({
      name: 'nodeL',
      type: 'QuantumSavory.Wildcard',
      value: 'Wildcard',
    })

    await nodeLTypeSelector.selectOption('Int64')
    await expect(nodeLRow.locator('input[type="number"]')).toHaveValue('')
    await nodeLTypeSelector.selectOption('default')

    await page.locator('.edge-list-item').first().click()
    const entanglerEditor = await openProtocolEditor(page.locator('#edgePanel'), 'EntanglerProt')
    const chooseslotRow = parameterRow(entanglerEditor, 'chooseslotA')
    await chooseslotRow.locator('.complexTypeSelector').selectOption('Function')

    const edgeFunctionSelector = chooseslotRow.locator('.functionSelector')
    for (const name of ['minimum', 'maximum', 'abs', 'identity']) {
      await expect(edgeFunctionSelector.locator(`option[value="${name}"]`)).toBeEnabled()
    }
    for (const name of SELF_FUNCTIONS) {
      await expect(edgeFunctionSelector.locator(`option[value="${name}"]`)).toHaveCount(0)
    }
    // An explicit Function branch is incomplete until a function is selected.
    // Return it to Default before committing the independent intrinsic field.
    await chooseslotRow.locator('.complexTypeSelector').selectOption('default')

    const retryRow = parameterRow(entanglerEditor, 'retry_lock_time')
    await retryRow.locator('.complexTypeSelector').selectOption('Nothing')
    await expect(retryRow.locator('.param-value')).toHaveText('Nothing')
    const nothingPayload = await capturePayloadAndUnlock(page)
    expect(edgeParameter(nothingPayload, 'retry_lock_time')).toEqual({
      name: 'retry_lock_time',
      type: 'Nothing',
      value: 'nothing',
    })
  })

  test('offers readable predefined and custom choices for Union and standalone Function fields', async ({ page }) => {
    await page.locator('.node-marker').first().click()
    const swapperEditor = await openProtocolEditor(page.locator('#nodePanel'), 'SwapperProt')

    const nodeLRow = parameterRow(swapperEditor, 'nodeL')
    const nodeLTypeSelector = nodeLRow.locator('.complexTypeSelector')
    await expect(nodeLTypeSelector.locator('option')).toHaveText([
      'Default',
      'QuantumSavory.Wildcard',
      'Int64',
      'Int64 Expression',
      'Predefined Function',
      'Custom Function',
    ])
    await nodeLTypeSelector.selectOption('Lambda')
    await expect(nodeLRow.locator('.code-editor-with-symbols')).toBeVisible()
    // Keep the independent constructor valid before committing chooseL.
    await nodeLTypeSelector.selectOption('default')

    const chooseLRow = parameterRow(swapperEditor, 'chooseL')
    const chooseLTypeSelector = chooseLRow.locator('.complexTypeSelector')
    await expect(chooseLTypeSelector.locator('option')).toHaveText([
      'Default',
      'Predefined Function',
      'Custom Function',
    ])

    await chooseLTypeSelector.selectOption('Function')
    const predefinedSelector = chooseLRow.locator('.functionSelector')
    await expect(predefinedSelector).toBeVisible()
    await predefinedSelector.selectOption('identity')
    const functionPayload = await capturePayloadAndUnlock(page)
    expect(nodeParameter(functionPayload, 'chooseL')).toEqual({
      name: 'chooseL',
      type: 'Function',
      value: 'identity',
    })

    await chooseLTypeSelector.selectOption('default')
    await expect(chooseLRow.locator('.param-value')).toBeEmpty()
    const defaultPayload = await capturePayloadAndUnlock(page)
    expect(nodeParameter(defaultPayload, 'chooseL')).toBeUndefined()

    await chooseLTypeSelector.selectOption('Lambda')
    await expect(chooseLRow.locator('.code-editor-with-symbols')).toBeVisible()
  })

  test('edits old tag snapshots through live nullable metadata and caches exact catalog IDs', async ({ page }) => {
    await page.locator('.edge-list-item').first().click()
    const panel = page.locator('#edgePanel')
    const entangler = await openProtocolEditor(panel, 'EntanglerProt')
    const tagRow = parameterRow(entangler, 'tag')
    const tagTypeSelector = tagRow.locator('.complexTypeSelector')
    const tagInput = tagRow.getByRole('combobox', { name: 'tag named tag type' })

    await expect(tagTypeSelector.locator('option')).toHaveText([
      'Default',
      'Nothing',
      'Tag',
    ])
    await expect(tagTypeSelector).toHaveValue('DataType')
    await expect(tagRow.locator('.unknown-type-indicator')).toHaveCount(0)
    await expect(tagInput).toHaveValue(`ReadyTag — ${TAG_BETA}`)
    await expect(tagRow.getByRole('button', { name: 'Set tag from a variable' })).toBeDisabled()

    await tagTypeSelector.selectOption('Nothing')
    await expect(tagInput).toHaveCount(0)
    await expect(tagRow.locator('.param-value')).toHaveText('Nothing')
    const nothingPayload = await capturePayloadAndUnlock(page)
    expect(edgeParameter(nothingPayload, 'tag')).toMatchObject({
      name: 'tag',
      type: 'Nothing',
      value: 'nothing',
    })

    await tagTypeSelector.selectOption('DataType')
    await expect(tagInput).toBeVisible()
    await tagInput.fill('Example.Alpha')
    await page.locator('.named-tag-type-overlay')
      .getByRole('option', { name: /ReadyTag.*Example\.Alpha/ }).click()
    await expect(tagInput).toHaveValue(`ReadyTag — ${TAG_ALPHA}`)
    const alphaPayload = await capturePayloadAndUnlock(page)
    expect(edgeParameter(alphaPayload, 'tag')).toMatchObject({
      name: 'tag',
      type: 'DataType',
      value: TAG_ALPHA,
    })

    await tagTypeSelector.selectOption('default')
    await expect(tagInput).toHaveCount(0)
    await expect(tagRow.locator('.param-value')).toBeEmpty()
    const defaultPayload = await capturePayloadAndUnlock(page)
    expect(edgeParameter(defaultPayload, 'tag')).toBeUndefined()

    const consumer = await openProtocolEditor(panel, 'EntanglementConsumer')
    const consumerRow = parameterRow(consumer, 'tag')
    const consumerTypeSelector = consumerRow.getByRole('combobox', {
      name: 'Input option for tag',
    })
    await expect(consumerTypeSelector.locator('option')).toHaveText([
      'Default',
      'Tag',
    ])
    await expect(consumerTypeSelector).toHaveValue('default')
    await expect(consumerRow.getByRole('combobox', { name: 'tag named tag type' })).toHaveCount(0)
    await consumerTypeSelector.selectOption('DataType')
    const consumerInput = consumerRow.getByRole('combobox', { name: 'tag named tag type' })
    await expect(consumerInput).toHaveValue('')
    await consumerInput.fill('counterpart')
    await page.locator('.named-tag-type-overlay')
      .getByRole('option', { name: 'EntanglementCounterpart', exact: true }).click()
    const consumerPayload = await capturePayloadAndUnlock(page)
    expect(edgeParameter(
      consumerPayload,
      'tag',
      CONSUMER_TYPE.type,
    )).toEqual({
      name: 'tag',
      type: 'DataType',
      value: TAG_UNIQUE,
    })

    expect(page.tagCatalogState.requests).toBe(1)

    await parsePayloadThroughRunner(page)
    await expect(consumerInput).toBeDisabled()
    await expect(consumerRow.getByRole('button', { name: 'Set tag from a variable' })).toBeDisabled()
  })

  test('keeps catalog failures local and force-retries the named-tag field', async ({ page }) => {
    page.tagCatalogState.fail = true
    await page.locator('.edge-list-item').first().click()
    const entangler = await openProtocolEditor(page.locator('#edgePanel'), 'EntanglerProt')
    const tagRow = parameterRow(entangler, 'tag')

    await expect(tagRow.getByRole('alert')).toContainText('Named tag catalog unavailable')
    const input = tagRow.getByRole('combobox', { name: 'tag named tag type' })
    const errorId = await tagRow.getByRole('alert').getAttribute('id')
    await expect(input).toHaveAttribute('aria-describedby', new RegExp(errorId))

    page.tagCatalogState.fail = false
    await tagRow.getByRole('button', { name: 'Retry loading named tag types' }).click()
    await expect(input).toHaveValue(`ReadyTag — ${TAG_BETA}`)
    await expect(tagRow.getByRole('alert')).toHaveCount(0)
    expect(page.tagCatalogState.requests).toBe(2)
  })
})
