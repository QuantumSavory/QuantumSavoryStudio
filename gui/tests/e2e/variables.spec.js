import { test, expect } from '@playwright/test'

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
    json: {
      versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
      capabilities: { unsafe_code_evaluation: false },
    },
  }))
  await page.route('**/get_state?**', route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    json: { success: false, message: 'Simulation not found' },
  }))
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

  await page.evaluate(() => {
    const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const projectData = setupState?.projectData
    if (!projectData?.net?.edges?.[0]) {
      throw new Error('Reactive project state is unavailable')
    }

    projectData.net.edges[0].data.protocols.push({
      id: 'protocol_variables_edge',
      type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
      parameters: [{
        name: 'rounds',
        type: 'Int64',
        selectedType: 'default',
        value: null,
      }],
    })
  })
}

function parameterRow(editor, name) {
  return editor.locator('.param-item').filter({ hasText: name })
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

async function setSimulationPhase(page, phase) {
  await page.evaluate(nextPhase => {
    const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const simulationState = setupState?.simulationState?.value ?? setupState?.simulationState
    if (!simulationState) throw new Error('Simulation state is unavailable')
    simulationState.phase = nextPhase
  }, phase)
}

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

    await page.locator('.edge-list-item').first().click()
    const editor = page.locator('#edgePanel .protocol-editor', { hasText: 'EntanglerProt' })
    await expect(editor).toBeVisible()
    await editor.locator('.protocol-list-type').click()

    const roundsRow = parameterRow(editor, 'rounds')
    const bindingButton = roundsRow.getByRole('button', { name: 'Set rounds from a variable' })
    await expect(bindingButton).toBeEnabled()
    await expectIconCentered(bindingButton)
    await bindingButton.click()

    const variableSelector = roundsRow.getByRole('combobox', { name: 'Variable for rounds' })
    await expect(variableSelector).toHaveValue('')
    await expect(deleteButton).toBeEnabled()
    const valueBeforeSelection = await page.evaluate(() => {
      const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      return setupState?.projectData?.net?.edges?.[0]?.data?.protocols?.[0]?.parameters?.[0]?.value
    })
    expect(valueBeforeSelection).toBeUndefined()

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

    const serialized = await page.evaluate(() => {
      const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      const minimized = setupState?.minimizedProjectData?.value ?? setupState?.minimizedProjectData
      const full = setupState?.serializeProjectData?.()
      if (!full || !minimized) throw new Error('Serialized project state is unavailable')

      const normalizedFull = JSON.parse(JSON.stringify(full))
      const normalizedMinimized = JSON.parse(JSON.stringify(minimized))
      return {
        fullVariable: normalizedFull.variables[0],
        minimizedVariable: normalizedMinimized.variables[0],
        fullParameter: normalizedFull.net.edges[0].data.protocols[0].parameters[0],
        minimizedParameter: normalizedMinimized.net.edges[0].data.protocols[0].parameters[0],
      }
    })

    const expectedVariable = {
      id: variableId,
      name: 'retry_rounds',
      type: 'Int64',
      value: 7,
    }
    const expectedFullParameter = {
      name: 'rounds',
      type: 'Int64',
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

    await setSimulationPhase(page, 'prepared')
    await expect(addVariableButton).toBeDisabled()
    await expect(nameInput).toBeDisabled()
    await expect(typeSelect).toBeDisabled()
    await expect(valueInput).toBeDisabled()
    await expect(variableSelector).toBeDisabled()
    await expect(roundsRow.getByRole('button', { name: 'Use a direct value for rounds' })).toBeDisabled()

    await setSimulationPhase(page, 'empty')
    await expect(addVariableButton).toBeEnabled()
    await expect(nameInput).toBeEnabled()
    await expect(typeSelect).toBeEnabled()
    await expect(valueInput).toBeEnabled()
    await expect(variableSelector).toBeEnabled()
    await expect(roundsRow.getByRole('button', { name: 'Use a direct value for rounds' })).toBeEnabled()
    await expect(deleteButton).toBeDisabled()

    await page.evaluate(() => {
      const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      setupState.projectData.net.edges[0].data.protocols[0].parameters[0].type = 'UnsupportedType'
    })
    const unknownTypeIndicator = roundsRow.locator('.unknown-type-indicator')
    await expect(unknownTypeIndicator).toHaveCount(0)
    await expect(roundsRow.getByTestId('parameter-option-selector').locator('option')).toHaveText([
      'Default',
      'Int64',
      'Int64 Expression',
    ])
  })

  test('lists every variable and preserves assignments when wire types change', async ({ page }) => {
    await createProjectWithEdgeProtocol(page)

    await page.evaluate(() => {
      const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      const projectData = setupState?.projectData
      const variables = projectData?.variables
      const parameter = projectData?.net?.edges?.[0]?.data?.protocols?.[0]?.parameters?.[0]
      if (!variables || !parameter) throw new Error('Reactive project state is unavailable')
      parameter.selectedType = 'Int64'
      parameter.value = 2
      variables.push(
        { id: 'variable_label', name: 'round label', type: 'String', value: 'four' },
        { id: 'variable_rounds', name: 'retry rounds', type: 'Int64', value: 4 },
      )
    })

    await page.locator('.edge-list-item').first().click()
    const editor = page.locator('#edgePanel .protocol-editor', { hasText: 'EntanglerProt' })
    await editor.locator('.protocol-list-type').click()
    const roundsRow = parameterRow(editor, 'rounds')
    const bindingControl = roundsRow.locator('.variable-binding-control')
    const bindingButton = roundsRow.getByRole('button', { name: 'Set rounds from a variable' })

    await expect(bindingButton).toBeEnabled()
    await bindingControl.hover()
    await expect(page.locator('.p-tooltip-text')).toHaveText(
      'Choose a variable for this parameter',
    )

    await bindingButton.click()
    const variableSelector = roundsRow.getByRole('combobox', { name: 'Variable for rounds' })
    await expect(variableSelector).toHaveValue('')
    await expect(variableSelector.locator('option')).toHaveText([
      'Select a variable',
      'round label (String)',
      'retry rounds (Int64)',
    ])

    const valueBeforeSelection = await page.evaluate(() => {
      const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      return setupState?.projectData?.net?.edges?.[0]?.data?.protocols?.[0]?.parameters?.[0]?.value
    })
    expect(valueBeforeSelection).toBe(2)

    await variableSelector.selectOption('variable_rounds')
    await expect(variableSelector).toHaveValue('variable_rounds')

    await page.getByRole('tab', { name: 'Variables' }).click()
    const variableRow = page.getByTestId('variables-panel')
      .locator('[data-variable-id="variable_rounds"]')
    await variableRow.locator('.variable-type-select').selectOption('String')
    await variableRow.locator('.variable-value-input input[type="text"]').fill('four')
    await variableRow.locator('.variable-name-input').click()

    await expect(variableSelector).toHaveValue('variable_rounds')
    await expect(variableSelector.locator('option')).toHaveText([
      'round label (String)',
      'retry rounds (String)',
    ])
    const preservedReference = await page.evaluate(() => {
      const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      const value = setupState?.projectData?.net?.edges?.[0]?.data?.protocols?.[0]?.parameters?.[0]?.value
      return JSON.parse(JSON.stringify(value))
    })
    expect(preservedReference).toEqual({ kind: 'variable', id: 'variable_rounds' })

    await roundsRow.getByRole('button', { name: 'Use a direct value for rounds' }).click()
    await expect(bindingButton).toBeEnabled()
    await expect(roundsRow.locator('input[type="number"]')).toHaveValue('2')
    await page.mouse.move(0, 0)
    await bindingControl.hover()
    await expect(page.locator('.p-tooltip-text')).toHaveText(
      'Choose a variable for this parameter',
    )
  })

  test('rejects an unversioned project instead of defaulting missing variables', async ({ page }) => {
    const result = await page.evaluate(() => {
      const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      if (typeof setupState?.deserializeProjectData !== 'function') {
        throw new Error('Project deserializer is unavailable')
      }
      try {
        setupState.deserializeProjectData({ name: 'Unversioned Project' })
        return { accepted: true }
      } catch (error) {
        return {
          accepted: false,
          code: error.code,
          contract: error.details?.contract,
          supportedVersions: error.details?.supported_versions,
        }
      }
    })

    expect(result).toEqual({
      accepted: false,
      code: 'UNSUPPORTED_VERSION',
      contract: 'project',
      supportedVersions: [2],
    })
  })

  test('offers the same supported value forms as protocol parameters', async ({ page }) => {
    await page.getByRole('tab', { name: 'Variables' }).click()
    const variablesPanel = page.getByTestId('variables-panel')
    await variablesPanel.getByRole('button', { name: 'Add Variable' }).click()

    const variableRow = variablesPanel.locator('.variable-row')
    const typeSelect = variableRow.locator('.variable-type-select')
    await expect(typeSelect.locator('option')).toHaveText([
      'Default',
      'Float64',
      'Float64 Expression',
      'Int64',
      'Int64 Expression',
      'Bool',
      'String',
      'Predefined Function',
      'Custom Function',
      'Symbolic',
      'Wildcard',
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

    await typeSelect.selectOption('Wildcard')
    await expect(variableRow.locator('.variable-value-input')).toHaveText('Wildcard')

    await typeSelect.selectOption('Vector{Int64}')
    await expect(variableRow.locator('.variable-value-input input[type="text"]')).toBeVisible()

    await typeSelect.selectOption('Nothing')
    await expect(variableRow.locator('.variable-value-input')).toHaveText('Nothing')
  })
})
