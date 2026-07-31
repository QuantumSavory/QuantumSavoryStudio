import { test, expect } from '@playwright/test'
import { parameterTypeSupportsVariableType } from '../../src/utils/parameterTypes.js'
import { simulationNotFoundResponse } from './httpResponses.js'
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

const EDGE_PROTOCOL_TYPE = {
  type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
  doc: 'Generate entanglement between two nodes.',
  group: 'edge',
  virtual: false,
  parameters: [{
    field: 'rounds',
    type: 'Int64',
    doc: 'Number of entanglement attempts.',
  }],
}

async function mockConfiguration(page) {
  await page.route('**/known_functions', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { known_functions: ['minimum', 'maximum', 'abs', 'identity'] },
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
    json: { protocol_types: [EDGE_PROTOCOL_TYPE] },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: backendPlatformInfo(),
  }))
  await page.route('**/get_state?**', route => route.fulfill(
    simulationNotFoundResponse(),
  ))
  await mockParseAndDestroy(page)
}

async function loadApp(page) {
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  await page.goto('/')
  await protocolTypesLoaded
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function createProjectWithEdgeProtocol(page) {
  await page.locator('.hamburger-btn').click()
  await page.getByText('New', { exact: true }).click()
  await page.getByPlaceholder('Project name').fill('Variables Test Project')
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

  await page.locator('.edge-list-item').click()
  const edgePanel = page.locator('#edgePanel')
  await edgePanel.getByRole('button', { name: 'Add Protocol' }).click()
  await page.getByRole('menuitem', { name: 'EntanglerProt', exact: true }).click()
  await expect(edgePanel.locator('.protocol-editor', { hasText: 'EntanglerProt' })).toBeVisible()
  await addOneSlotToEachNode(page)
}

function parameterRow(editor, name) {
  return editor.locator('.param-item').filter({ hasText: name })
}

async function openEdgeProtocolEditor(page) {
  await page.locator('.edge-list-item').first().click()
  const editor = page.locator('#edgePanel .protocol-editor', { hasText: 'EntanglerProt' })
  await expect(editor).toBeVisible()
  const container = editor.locator('.protocol-container')
  if (!await container.isVisible()) {
    await editor.locator('.protocol-list-type').click()
  }
  await expect(container).toBeVisible()
  return editor
}

async function expectIconCentered(button) {
  const buttonBox = await button.boundingBox()
  const iconBox = await button.locator('svg').boundingBox()
  if (!buttonBox || !iconBox) throw new Error('Expected the button and icon to be visible')

  expect(Math.abs(iconBox.x + iconBox.width / 2 - (buttonBox.x + buttonBox.width / 2)))
    .toBeLessThanOrEqual(1)
  expect(Math.abs(iconBox.y + iconBox.height / 2 - (buttonBox.y + buttonBox.height / 2)))
    .toBeLessThanOrEqual(1)
}

test.describe('Protocol variable type compatibility', () => {
  test('matches declared field types directionally and recognizes current wire types', () => {
    expect(parameterTypeSupportsVariableType('Int64', 'Int64')).toBe(true)
    expect(parameterTypeSupportsVariableType('Int64', 'String')).toBe(false)
    expect(parameterTypeSupportsVariableType(['Nothing', 'Float64'], 'Nothing')).toBe(true)
    expect(parameterTypeSupportsVariableType(['Nothing', 'Float64'], 'Float64')).toBe(true)
    expect(parameterTypeSupportsVariableType(['Nothing', 'Float64'], 'Bool')).toBe(false)
    expect(parameterTypeSupportsVariableType('Function', 'Lambda')).toBe(true)
    expect(parameterTypeSupportsVariableType('Lambda', 'Function')).toBe(false)
    expect(parameterTypeSupportsVariableType('Symbolic', 'Symbolic')).toBe(true)
    expect(parameterTypeSupportsVariableType('Wildcard', 'QuantumSavory.Wildcard')).toBe(true)
    expect(parameterTypeSupportsVariableType('Any', 'Bool')).toBe(true)
    expect(parameterTypeSupportsVariableType('DataType', 'default')).toBe(true)
  })
})

test.describe('Global protocol variables', () => {
  test.beforeEach(async ({ page }) => {
    await mockConfiguration(page)
    await loadApp(page)
  })

  test('persists, links, renames, protects, and locks a numeric variable', async ({ page }) => {
    await createProjectWithEdgeProtocol(page)

    await page.getByRole('tab', { name: 'Variables' }).click()
    const variablesPanel = page.getByTestId('variables-panel')
    await expect(variablesPanel).toBeVisible()
    await expect(variablesPanel.locator('.empty-variables')).toHaveText('No variables')

    const addVariableButton = variablesPanel.getByRole('button', { name: 'Add Variable' })
    await addVariableButton.click()

    const variableRow = variablesPanel.locator('.variable-row')
    await expect(variableRow).toHaveCount(1)
    const variableId = await variableRow.getAttribute('data-variable-id')
    expect(variableId).toMatch(/^variable_/)

    const nameInput = variableRow.locator('.variable-name-input')
    const typeSelect = variableRow.locator('.variable-type-select')
    const valueInput = variableRow.locator('.variable-value-input input[type="number"]')
    const deleteButton = variableRow.locator('.delete-variable-button')

    await expect(deleteButton).toHaveCSS('width', '25px')
    await expect(deleteButton).toHaveCSS('height', '25px')
    await expectIconCentered(deleteButton)

    await nameInput.fill('max_rounds')
    await typeSelect.selectOption('Int64')
    await valueInput.fill('7')
    await expect(nameInput).toHaveValue('max_rounds')
    await expect(typeSelect).toHaveValue('Int64')
    await expect(valueInput).toHaveValue('7')

    const editor = await openEdgeProtocolEditor(page)

    const roundsRow = parameterRow(editor, 'rounds')
    await expect(roundsRow.locator('input[type="number"]')).toHaveValue('')
    const bindingButton = roundsRow.getByRole('button', { name: 'Set rounds from a variable' })
    await expect(bindingButton).toBeEnabled()
    await expectIconCentered(bindingButton)
    await bindingButton.click()

    const variableSelector = roundsRow.getByRole('combobox', { name: 'Variable for rounds' })
    await expect(variableSelector).toHaveValue('')
    await expect(deleteButton).toBeEnabled()

    await variableSelector.selectOption(variableId)
    await expect(variableSelector).toHaveValue(variableId)
    await expect(deleteButton).toBeDisabled()
    await expect(deleteButton).toHaveAttribute(
      'title',
      'Unlink this variable from protocol or background parameters before deleting it',
    )

    await nameInput.fill('retry_rounds')
    await expect(variableSelector.locator(`option[value="${variableId}"]`)).toHaveText(
      'retry_rounds (Int64)',
    )

    const stored = await saveAndReadProject(page, 'Variables Test Project')
    const minimized = await parsePayloadThroughRunner(page)
    const serialized = {
      fullVariable: stored.variables[0],
      minimizedVariable: minimized.variables[0],
      fullParameter: stored.net.edges[0].data.protocols[0].parameters[0],
      minimizedParameter: minimized.net.edges[0].data.protocols[0].parameters[0],
    }

    const expectedVariable = {
      id: variableId,
      name: 'retry_rounds',
      type: 'Int64',
      selectedType: 'Int64',
      value: 7,
    }
    const expectedFullParameter = {
      name: 'rounds',
      type: 'Int64',
      selectedType: 'Int64',
      value: { kind: 'variable', id: variableId },
    }
    const expectedMinimizedParameter = {
      name: 'rounds',
      type: 'Int64',
      value: { kind: 'variable', id: variableId },
    }
    expect(serialized.fullVariable).toEqual(expectedVariable)
    expect(serialized.minimizedVariable).toEqual({
      id: variableId,
      name: 'retry_rounds',
      type: 'Int64',
      value: 7,
    })
    expect(serialized.fullParameter).toEqual(expectedFullParameter)
    expect(serialized.minimizedParameter).toEqual(expectedMinimizedParameter)

    await expect(addVariableButton).toBeDisabled()
    await expect(nameInput).toBeDisabled()
    await expect(typeSelect).toBeDisabled()
    await expect(valueInput).toBeDisabled()
    await expect(variableSelector).toBeDisabled()
    await expect(roundsRow.getByRole('button', { name: 'Use a direct value for rounds' })).toBeDisabled()

    await stopSimulationThroughRunner(page)
    await expect(addVariableButton).toBeEnabled()
    await expect(nameInput).toBeEnabled()
    await expect(typeSelect).toBeEnabled()
    await expect(valueInput).toBeEnabled()
    await expect(variableSelector).toBeEnabled()
    await expect(roundsRow.getByRole('button', { name: 'Use a direct value for rounds' })).toBeEnabled()
    await expect(deleteButton).toBeDisabled()

    const fixture = await saveAndReadProject(page, 'Variables Test Project')
    fixture.net.edges[0].data.protocols[0].parameters[0].type = 'UnsupportedType'
    await replaceStoredProjectAndReload(page, fixture)

    const reopenedEditor = await openEdgeProtocolEditor(page)
    const reopenedRoundsRow = parameterRow(reopenedEditor, 'rounds')
    const unknownTypeIndicator = reopenedRoundsRow.locator('.unknown-type-indicator')
    await expect(unknownTypeIndicator).toHaveCount(0)
    await expect(
      reopenedRoundsRow.getByTestId('parameter-option-selector').locator('option'),
    ).toHaveText([
      'Default',
      'Int64',
      'Int64 Expression',
    ])
  })

  test('filters the picker, explains availability, and preserves incompatible assignments', async ({ page }) => {
    await createProjectWithEdgeProtocol(page)

    await page.getByRole('tab', { name: 'Variables' }).click()
    const variablesPanel = page.getByTestId('variables-panel')
    const addVariable = variablesPanel.getByRole('button', { name: 'Add Variable' })
    await addVariable.click()
    let variableRows = variablesPanel.locator('.variable-row')
    const labelVariable = variableRows.nth(0)
    await labelVariable.locator('.variable-name-input').fill('round label')
    await labelVariable.locator('.variable-type-select').selectOption('String')
    await labelVariable.locator('.variable-value-input input[type="text"]').fill('four')

    await addVariable.click()
    variableRows = variablesPanel.locator('.variable-row')
    const roundsVariable = variableRows.nth(1)
    await roundsVariable.locator('.variable-name-input').fill('retry rounds')
    await roundsVariable.locator('.variable-type-select').selectOption('Int64')
    await roundsVariable.locator('.variable-value-input input[type="number"]').fill('4')
    const roundsVariableId = await roundsVariable.getAttribute('data-variable-id')
    expect(roundsVariableId).toMatch(/^variable_/)

    let editor = await openEdgeProtocolEditor(page)
    const roundsRow = parameterRow(editor, 'rounds')
    await roundsRow.locator('input[type="number"]').fill('2')
    const bindingControl = roundsRow.locator('.variable-binding-control')
    const bindingButton = roundsRow.getByRole('button', { name: 'Set rounds from a variable' })

    await expect(bindingButton).toBeEnabled()
    await bindingControl.hover()
    await expect(page.locator('.p-tooltip-text')).toHaveText(
      'Choose a compatible variable for this parameter',
    )

    await bindingButton.click()
    const variableSelector = roundsRow.getByRole('combobox', { name: 'Variable for rounds' })
    await expect(variableSelector).toHaveValue('')
    await expect(variableSelector.locator('option')).toHaveText([
      'Select a variable',
      'retry rounds (Int64)',
    ])
    await variableSelector.selectOption(roundsVariableId)
    await expect(variableSelector).toHaveValue(roundsVariableId)

    await page.getByRole('tab', { name: 'Variables' }).click()
    await roundsVariable.locator('.variable-type-select').selectOption('String')
    editor = await openEdgeProtocolEditor(page)
    const reopenedRoundsRow = parameterRow(editor, 'rounds')
    const reopenedBindingControl = reopenedRoundsRow.locator('.variable-binding-control')
    const reopenedBindingButton = reopenedRoundsRow.getByRole('button', {
      name: 'Set rounds from a variable',
    })
    const incompatibleSelector = reopenedRoundsRow.getByRole('combobox', {
      name: 'Variable for rounds',
    })

    await expect(incompatibleSelector).toHaveValue(roundsVariableId)
    await expect(incompatibleSelector.locator('option')).toHaveText([
      'Incompatible variable: retry rounds (String)',
    ])
    const stored = await saveAndReadProject(page, 'Variables Test Project')
    const preservedReference = stored.net.edges[0].data.protocols[0].parameters[0].value
    expect(preservedReference).toEqual({ kind: 'variable', id: roundsVariableId })

    await reopenedRoundsRow.getByRole('button', { name: 'Use a direct value for rounds' }).click()
    await expect(reopenedBindingButton).toBeDisabled()
    await expect(reopenedRoundsRow.locator('input[type="number"]')).toHaveValue('2')
    await page.mouse.move(0, 0)
    await reopenedBindingControl.hover()
    await expect(page.locator('.p-tooltip-text')).toHaveText(
      'No variables have a type supported by this parameter',
    )
  })

  test('offers the same supported value forms as protocol parameters', async ({ page }) => {
    await page.getByRole('tab', { name: 'Variables' }).click()
    const variablesPanel = page.getByTestId('variables-panel')
    await variablesPanel.getByRole('button', { name: 'Add Variable' }).click()

    const variableRow = variablesPanel.locator('.variable-row')
    const typeSelect = variableRow.locator('.variable-type-select')
    await expect(typeSelect.locator('option')).toHaveText([
      'Default',
      'Int64',
      'Int64 Expression',
      'Float64',
      'Float64 Expression',
      'Bool',
      'String',
      'Predefined Function',
      'Custom Function',
      'Symbolic',
      'QuantumSavory.Wildcard',
      'Vector{Int64}',
      'Vector{Float64}',
      'Nothing',
    ])

    await typeSelect.selectOption('Bool')
    await expect(variableRow.locator('input[type="checkbox"]')).toBeVisible()

    await typeSelect.selectOption('Function')
    await expect(variableRow.locator('.functionSelector')).toBeVisible()
    await expect(variableRow.locator('.functionSelector option[value="identity"]')).toBeEnabled()

    await typeSelect.selectOption('Lambda')
    await expect(variableRow.locator('.code-editor-with-symbols')).toBeVisible()

    await typeSelect.selectOption('Symbolic')
    await expect(variableRow.locator('.code-editor-with-symbols')).toBeVisible()

    await typeSelect.selectOption('QuantumSavory.Wildcard')
    await expect(variableRow.locator('.variable-value-input')).toHaveText('Wildcard')

    await typeSelect.selectOption('default')
    await expect(variableRow.locator('.variable-value-input')).toBeEmpty()

    await typeSelect.selectOption('Vector{Int64}')
    await expect(variableRow.locator('.variable-value-input input[type="text"]')).toBeVisible()

    await typeSelect.selectOption('Nothing')
    await expect(variableRow.locator('.variable-value-input')).toHaveText('Nothing')
  })
})
