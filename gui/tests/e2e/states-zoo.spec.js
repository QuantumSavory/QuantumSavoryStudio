import { test, expect } from '@playwright/test'
import {
  canonicalErrorResponse,
  simulationNotFoundResponse,
} from './httpResponses.js'

const TRANSPARENT_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XlW5WQAAAABJRU5ErkJggg=='
const RED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrJ0AAAAASUVORK5CYII='
const BLUE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const STATES_ZOO_TYPES = [
  {
    id: 'BarrettKokBellPair',
    display_name: 'Barrett-Kok Bell Pair',
    weighted: false,
    parameters: [
      { name: 'ηᴬ', min: 0, max: 1, good: 1 },
      { name: 'ηᴮ', min: 0, max: 1, good: 1 },
      { name: 'Pᵈ', min: 0, max: 1, good: 0 },
      { name: 'ηᵈ', min: 0, max: 1, good: 1 },
      { name: '𝒱', min: 0, max: 1, good: 1 },
    ],
  },
  {
    id: 'BarrettKokBellPairW',
    display_name: 'Barrett-Kok Bell Pair (weighted)',
    weighted: true,
    parameters: [
      { name: 'ηᴬ', min: 0, max: 1, good: 1 },
      { name: 'ηᴮ', min: 0, max: 1, good: 1 },
      { name: 'Pᵈ', min: 0, max: 1, good: 0 },
      { name: 'ηᵈ', min: 0, max: 1, good: 1 },
      { name: '𝒱', min: 0, max: 1, good: 1 },
    ],
  },
  {
    id: 'DepolarizedBellPair',
    display_name: 'Depolarized Bell Pair',
    weighted: false,
    parameters: [{ name: 'p', min: 0, max: 1, good: 1 }],
  },
  {
    id: 'GenqoMultiplexedCascadedBellPairW',
    display_name: 'Genqo Multiplexed Cascaded Bell Pair (weighted)',
    weighted: true,
    parameters: [
      { name: 'ηᵇ', min: 0, max: 1, good: 1 },
      { name: 'ηᵈ', min: 0, max: 1, good: 1 },
      { name: 'ηᵗ', min: 0, max: 1, good: 1 },
      { name: 'N', min: 0, max: 10, good: 0.1 },
      { name: 'Pᵈ', min: 0, max: 0.1, good: 1e-8 },
    ],
  },
  {
    id: 'GenqoUnheraldedSPDCBellPairW',
    display_name: 'Genqo Unheralded SPDC Bell Pair (weighted)',
    weighted: true,
    parameters: [
      { name: 'ηᵈ', min: 0, max: 1, good: 1 },
      { name: 'ηᵗ', min: 0, max: 1, good: 1 },
      { name: 'N', min: 0, max: 10, good: 0.1 },
      { name: 'Pᵈ', min: 0, max: 0.1, good: 1e-6 },
    ],
  },
]

const SYMBOLIC_PROTOCOL_TYPE = {
  type: 'TestProtocols.SymbolicProt',
  doc: 'Protocol used to exercise States Zoo variable assignment.',
  group: 'node',
  virtual: null,
  parameters: [{
    field: 'observable',
    type: 'SymbolicUtils.Symbolic{Real}',
    doc: 'A symbolic state.',
  }],
}

async function mockConfiguration(page, { previewHandler } = {}) {
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
  await page.route('**/slot_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { slot_types: ['Qubit', 'Qumode'] },
  }))
  await page.route('**/protocol_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { protocol_types: [SYMBOLIC_PROTOCOL_TYPE] },
  }))
  await page.route('**/states_zoo_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { states_zoo_types: STATES_ZOO_TYPES },
  }))
  await page.route('**/states_zoo_preview', async route => {
    const parameters = route.request().postDataJSON()
    if (previewHandler) {
      return previewHandler(route, parameters)
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { success: true, png_base64: TRANSPARENT_PNG, trace: 1 },
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
  await page.route('**/get_state?**', route => route.fulfill(
    simulationNotFoundResponse(),
  ))
}

async function loadApp(page) {
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  const statesZooTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/states_zoo_types') && response.ok(),
  )
  await page.goto('/')
  await Promise.all([protocolTypesLoaded, statesZooTypesLoaded])
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function createProject(page, name = 'States Zoo Test') {
  await page.locator('.hamburger-btn').click()
  await page.getByText('New', { exact: true }).click()
  await page.getByPlaceholder('Project name').fill(name)
  await page.locator('button.primary').click()
}

async function openStatesZoo(page) {
  await page.getByRole('tab', { name: 'States Zoo' }).click()
  const panel = page.getByTestId('states-zoo-panel')
  await expect(panel).toBeVisible()
  return panel
}

async function addState(page, panel) {
  const previewResponse = page.waitForResponse(response => (
    response.url().endsWith('/states_zoo_preview') && response.ok()
  ))
  await panel.getByRole('button', { name: 'Add State' }).click()
  await previewResponse
  const row = panel.locator('.states-zoo-row').last()
  await expect(row).toBeVisible()
  await expect(row.locator('.states-zoo-preview-image')).toBeVisible()
  return row
}

async function expectWatermarkedPng(image, sourcePng, previousSource) {
  const rawSource = `data:image/png;base64,${sourcePng}`
  await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect.poll(async () => {
    const source = await image.getAttribute('src')
    return source !== rawSource && source !== previousSource
  }).toBe(true)
  return image.getAttribute('src')
}

async function addNodeWithSymbolicProtocol(page) {
  await page.keyboard.down('Alt')
  await page.locator('canvas').first().click({ position: { x: 450, y: 300 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(1)

  await page.evaluate(() => {
    const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const node = setupState?.projectData?.net?.nodes?.[0]
    if (!node) throw new Error('Reactive node state is unavailable')
    node.data.protocols.push({
      id: 'protocol_states_zoo_symbolic',
      type: 'TestProtocols.SymbolicProt',
      parameters: [{
        name: 'observable',
        type: 'SymbolicUtils.Symbolic{Real}',
        value: null,
      }],
    })
  })

  await page.locator('.node-marker').click()
  const editor = page.locator('#nodePanel .protocol-editor', { hasText: 'SymbolicProt' })
  await expect(editor).toBeVisible()
  await editor.locator('.protocol-list-type').click()
  await expect(editor.locator('.protocol-container')).toBeVisible()
  return editor
}

async function setSimulationPhase(page, phase) {
  await page.evaluate(nextPhase => {
    const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const simulationState = setupState?.simulationState?.value ?? setupState?.simulationState
    if (!simulationState) throw new Error('Simulation state is unavailable')
    simulationState.phase = nextPhase
  }, phase)
}

test.describe('States Zoo variables', () => {
  test('uses catalog defaults, resets types, lays out previews, and validates names globally', async ({ page }) => {
    const previewRequests = []
    await mockConfiguration(page, {
      previewHandler: (route, payload) => {
        previewRequests.push(payload)
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: { success: true, png_base64: TRANSPARENT_PNG },
        })
      },
    })
    await loadApp(page)

    const panel = await openStatesZoo(page)
    await expect(panel.locator('.empty-states-zoo')).toHaveText('No States Zoo variables')
    const row = await addState(page, panel)

    const typeSelect = row.locator('.states-zoo-type-select')
    await expect(typeSelect).toHaveValue('BarrettKokBellPair')
    await expect(typeSelect.locator('option')).toHaveText(STATES_ZOO_TYPES.map(type => type.display_name))
    await expect(row.locator('.states-zoo-parameter-control')).toHaveCount(5)

    for (const parameter of STATES_ZOO_TYPES[0].parameters) {
      const control = row.locator(
        `.states-zoo-parameter-control[data-parameter-name="${parameter.name}"]`,
      )
      const range = control.locator('.states-zoo-parameter-range')
      const number = control.locator('.states-zoo-parameter-input')
      await expect(range).toHaveAttribute('min', String(parameter.min))
      await expect(range).toHaveAttribute('max', String(parameter.max))
      await expect(range).toHaveValue(String(parameter.good))
      await expect(number).toHaveValue(String(parameter.good))
    }

    expect(previewRequests[0]).toEqual({
      state_type: 'BarrettKokBellPair',
      parameters: { ηᴬ: 1, ηᴮ: 1, Pᵈ: 0, ηᵈ: 1, 𝒱: 1 },
    })

    const nameBox = await row.locator('.states-zoo-name-input').boundingBox()
    const typeBox = await typeSelect.boundingBox()
    const previewBox = await row.locator('.states-zoo-preview').boundingBox()
    expect(nameBox.y).toBeLessThan(typeBox.y)
    expect(typeBox.x).toBeLessThan(previewBox.x)

    const changedPreview = page.waitForResponse(response => (
      response.url().endsWith('/states_zoo_preview') && response.ok()
    ))
    await typeSelect.selectOption('DepolarizedBellPair')
    await changedPreview
    await expect(row.locator('.states-zoo-parameter-control')).toHaveCount(1)
    const depolarizedControl = row.locator(
      '.states-zoo-parameter-control[data-parameter-name="p"]',
    )
    await expect(depolarizedControl.locator('.states-zoo-parameter-input')).toHaveValue('1')
    expect(previewRequests.at(-1)).toEqual({
      state_type: 'DepolarizedBellPair',
      parameters: { p: 1 },
    })

    const nameInput = row.locator('.states-zoo-name-input')
    await nameInput.fill('prepared_bell_pair')
    const secondRow = await addState(page, panel)
    await secondRow.locator('.states-zoo-name-input').fill('prepared_bell_pair')
    await expect(secondRow.locator('.states-zoo-name-error')).toHaveText('Name must be unique')

    await page.setViewportSize({ width: 700, height: 900 })
    const narrowTypeBox = await typeSelect.boundingBox()
    const narrowPreviewBox = await row.locator('.states-zoo-preview').boundingBox()
    expect(narrowPreviewBox.y).toBeGreaterThan(narrowTypeBox.y)
  })

  test('stays out of Variables while remaining assignable, protected, and simulation-locked', async ({ page }) => {
    await mockConfiguration(page)
    await loadApp(page)
    await createProject(page, 'States Zoo Protocol Variable')
    const protocolEditor = await addNodeWithSymbolicProtocol(page)

    const panel = await openStatesZoo(page)
    const row = await addState(page, panel)
    const variableId = await row.getAttribute('data-variable-id')
    await row.locator('.states-zoo-name-input').fill('source_state')

    await page.getByRole('tab', { name: 'Variables', exact: true }).click()
    const variablesPanel = page.getByTestId('variables-panel')
    await expect(variablesPanel.locator('.variable-row')).toHaveCount(0)
    await expect(variablesPanel.locator('.empty-variables')).toHaveText('No variables')

    await page.locator('.node-marker').click()
    const parameter = protocolEditor.locator('.param-item').filter({ hasText: 'observable' })
    await parameter.getByRole('button', { name: 'Set observable from a variable' }).click()
    const variableSelector = parameter.getByRole('combobox', { name: 'Variable for observable' })
    await expect(variableSelector.locator(`option[value="${variableId}"]`)).toHaveText(
      'source_state (Symbolic)',
    )
    await variableSelector.selectOption(variableId)

    await page.getByRole('tab', { name: 'States Zoo' }).click()
    const deleteButton = row.locator('.delete-states-zoo-button')
    await expect(deleteButton).toBeDisabled()
    await expect(deleteButton).toHaveAttribute(
      'title',
      'Unlink this variable from protocol or background parameters before deleting it',
    )

    await setSimulationPhase(page, 'parsed')
    await expect(panel.getByRole('button', { name: 'Add State' })).toBeDisabled()
    await expect(row.locator('.states-zoo-name-input')).toBeDisabled()
    await expect(row.locator('.states-zoo-type-select')).toBeDisabled()
    await expect(row.locator('.states-zoo-parameter-range').first()).toBeDisabled()
    await expect(row.locator('.states-zoo-parameter-input').first()).toBeDisabled()
    await expect(variableSelector).toBeDisabled()

    await setSimulationPhase(page, 'empty')
    await expect(row.locator('.states-zoo-name-input')).toBeEnabled()
    await expect(row.locator('.states-zoo-type-select')).toBeEnabled()
    await expect(variableSelector).toBeEnabled()
    await parameter.getByRole('button', { name: 'Use a direct value for observable' }).click()
    await expect(deleteButton).toBeEnabled()
    await deleteButton.click()
    await expect(panel.locator('.states-zoo-row')).toHaveCount(0)
  })

  test('creates, synchronizes, explains, updates, and persists weighted trace variables', async ({ page }) => {
    await mockConfiguration(page, {
      previewHandler: (route, payload) => {
        const trace = payload.state_type === 'BarrettKokBellPairW'
          ? -Number(payload.parameters.ηᴬ) / 4
          : 1
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: { success: true, png_base64: TRANSPARENT_PNG, trace },
        })
      },
    })
    await loadApp(page)
    await createProject(page, 'Weighted States Zoo Project')

    const panel = await openStatesZoo(page)
    const row = await addState(page, panel)
    const stateId = await row.getAttribute('data-variable-id')
    const traceId = `${stateId}_tr`
    await expect(row.locator('.states-zoo-trace-note')).toHaveCount(0)

    const weightedPreview = page.waitForResponse(response => (
      response.url().endsWith('/states_zoo_preview') && response.ok()
    ))
    await row.locator('.states-zoo-type-select').selectOption('BarrettKokBellPairW')
    await weightedPreview

    const note = row.locator('.states-zoo-trace-note')
    await expect(note).toContainText('state_1_tr')
    await expect(note).toContainText('0.25')
    await expect(note).toContainText('probability of successfully heralding the state')
    await expect(note).toContainText('heralded entanglement generation')

    expect(await page.evaluate(id => {
      const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      const variables = setupState?.projectData?.variables
      const state = variables?.find(variable => variable.id === id)
      const trace = variables?.find(variable => variable.id === `${id}_tr`)
      return {
        stateName: state?.name,
        trace: trace && {
          id: trace.id,
          name: trace.name,
          type: trace.type,
          value: trace.value,
          statesZooTraceSourceId: trace.statesZooTraceSourceId,
        },
      }
    }, stateId)).toEqual({
      stateName: 'state_1',
      trace: {
        id: traceId,
        name: 'state_1_tr',
        type: 'Float64',
        value: 0.25,
        statesZooTraceSourceId: stateId,
      },
    })

    await row.locator('.states-zoo-name-input').fill('heralded_pair')
    await expect(note).toContainText('heralded_pair_tr')
    expect(await page.evaluate(id => {
      const variables = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.variables
      return variables?.find(variable => variable.id === id)?.name
    }, traceId)).toBe('heralded_pair_tr')

    const updatedPreview = page.waitForResponse(response => (
      response.url().endsWith('/states_zoo_preview') && response.ok()
    ))
    await row.locator(
      '.states-zoo-parameter-control[data-parameter-name="ηᴬ"] .states-zoo-parameter-input',
    ).fill('0.5')
    await updatedPreview
    await expect(note).toContainText('0.125')

    await page.getByRole('tab', { name: 'Variables', exact: true }).click()
    const variablesPanel = page.getByTestId('variables-panel')
    await expect(variablesPanel.locator('.variable-row')).toHaveCount(0)
    await expect(variablesPanel.locator('.empty-variables')).toHaveText('No variables')

    await page.locator('.hamburger-btn').click()
    await page.getByText('Save', { exact: true }).click()
    expect(await page.evaluate(({ projectName, id }) => {
      const project = JSON.parse(localStorage.getItem(`cqn_project_${projectName}`))
      localStorage.setItem('recentProjectName', projectName)
      return project.variables.find(variable => variable.id === id)
    }, { projectName: 'Weighted States Zoo Project', id: traceId })).toEqual({
      id: traceId,
      name: 'heralded_pair_tr',
      type: 'Float64',
      selectedType: 'Float64',
      value: 0.125,
      statesZooTraceSourceId: stateId,
    })

    await page.reload()
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
    const reloadedPanel = await openStatesZoo(page)
    const reloadedRow = reloadedPanel.locator(`.states-zoo-row[data-variable-id="${stateId}"]`)
    await expect(reloadedRow.locator('.states-zoo-trace-note')).toContainText('heralded_pair_tr')
    expect(await page.evaluate(id => {
      const variables = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.variables
      return variables?.filter(variable => variable.id === id).length
    }, traceId)).toBe(1)

    await page.evaluate(id => {
      const projectData = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData
      projectData.net.protocols.push({
        id: 'trace_consumer',
        parameters: [{ value: { kind: 'variable', id } }],
      })
    }, traceId)
    const unweightedOption = reloadedRow.locator(
      '.states-zoo-type-select option[value="DepolarizedBellPair"]',
    )
    await expect(unweightedOption).toHaveAttribute('disabled', '')
    const reloadedDelete = reloadedRow.locator('.delete-states-zoo-button')
    await expect(reloadedDelete).toBeDisabled()
    await expect(reloadedDelete).toHaveAttribute(
      'title',
      'Unlink the generated trace variable from protocol or background parameters before deleting this state',
    )
    await page.evaluate(() => {
      const protocols = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.net?.protocols
      protocols.splice(protocols.findIndex(protocol => protocol.id === 'trace_consumer'), 1)
    })
    await expect(unweightedOption).not.toHaveAttribute('disabled')
    await expect(reloadedDelete).toBeEnabled()

    const unweightedPreview = page.waitForResponse(response => (
      response.url().endsWith('/states_zoo_preview') && response.ok()
    ))
    await reloadedRow.locator('.states-zoo-type-select').selectOption('DepolarizedBellPair')
    await unweightedPreview
    expect(await page.evaluate(id => {
      const variables = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.variables
      return variables?.some(variable => variable.id === id)
    }, traceId)).toBe(false)

    const reweightedPreview = page.waitForResponse(response => (
      response.url().endsWith('/states_zoo_preview') && response.ok()
    ))
    await reloadedRow.locator('.states-zoo-type-select').selectOption('BarrettKokBellPairW')
    await reweightedPreview
    expect(await page.evaluate(id => {
      const variables = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.variables
      return variables?.some(variable => variable.id === id)
    }, traceId)).toBe(true)

    await reloadedRow.locator('.delete-states-zoo-button').click()
    await expect(reloadedPanel.locator('.states-zoo-row')).toHaveCount(0)
    expect(await page.evaluate(({ stateId: sourceId, traceId: companionId }) => {
      const variables = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.variables
      return variables?.some(variable => variable.id === sourceId || variable.id === companionId)
    }, { stateId, traceId })).toBe(false)
  })

  test('does not overwrite trace ID or name collisions', async ({ page }) => {
    await mockConfiguration(page)
    await loadApp(page)
    const panel = await openStatesZoo(page)
    const row = await addState(page, panel)
    const stateId = await row.getAttribute('data-variable-id')
    const traceId = `${stateId}_tr`

    await page.evaluate(id => {
      const variables = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.variables
      variables.push({ id: `${id}_tr`, name: 'unrelated', type: 'String', value: 'keep me' })
    }, stateId)

    const idCollisionPreview = page.waitForResponse(response => (
      response.url().endsWith('/states_zoo_preview') && response.ok()
    ))
    await row.locator('.states-zoo-type-select').selectOption('BarrettKokBellPairW')
    await idCollisionPreview
    await expect(row.locator('.states-zoo-preview-error')).toContainText(
      `ID '${traceId}' is already in use`,
    )
    expect(await page.evaluate(id => {
      const variables = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.variables
      const collision = variables?.find(variable => variable.id === id)
      return collision && {
        name: collision.name,
        type: collision.type,
        value: collision.value,
        statesZooTraceSourceId: collision.statesZooTraceSourceId,
      }
    }, traceId)).toEqual({
      name: 'unrelated',
      type: 'String',
      value: 'keep me',
      statesZooTraceSourceId: undefined,
    })

    await row.locator('.states-zoo-name-input').fill('id_collision_rename')
    await expect(row.locator('.states-zoo-preview-error')).toContainText(
      `ID '${traceId}' is already in use`,
    )

    await page.evaluate(({ stateId: sourceId, traceId: occupiedId }) => {
      const variables = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.variables
      const collisionIndex = variables.findIndex(variable => variable.id === occupiedId)
      variables.splice(collisionIndex, 1)
      variables.push({
        id: 'unrelated_name',
        name: 'id_collision_rename_tr',
        type: 'String',
        value: 'keep me too',
      })
      const state = variables.find(variable => variable.id === sourceId)
      state.name = 'id_collision_rename'
    }, { stateId, traceId })

    const nameCollisionPreview = page.waitForResponse(response => (
      response.url().endsWith('/states_zoo_preview') && response.ok()
    ))
    await row.getByRole('button', { name: 'Retry preview' }).click()
    await nameCollisionPreview
    await expect(row.locator('.states-zoo-name-error')).toContainText(
      "name 'id_collision_rename_tr' is already in use",
    )
    await expect(row.locator('.states-zoo-preview-error')).toContainText(
      "name 'id_collision_rename_tr' is already in use",
    )
    expect(await page.evaluate(() => {
      const variables = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.variables
      return variables?.filter(variable => variable.name === 'id_collision_rename_tr').length
    })).toBe(1)

    await page.evaluate(() => {
      const variables = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.variables
      variables.splice(variables.findIndex(variable => variable.id === 'unrelated_name'), 1)
    })
    const recoveredPreview = page.waitForResponse(response => (
      response.url().endsWith('/states_zoo_preview') && response.ok()
    ))
    await row.locator('.states-zoo-name-input').fill('recovered_state')
    await recoveredPreview
    await expect(row.locator('.states-zoo-preview-error')).toHaveCount(0)
    await expect(row.locator('.states-zoo-trace-note')).toContainText('recovered_state_tr')
    expect(await page.evaluate(id => {
      const variables = document.querySelector('#app')?.__vue_app__?._instance?.setupState
        ?.projectData?.variables
      const companion = variables?.find(variable => variable.id === id)
      return companion && {
        name: companion.name,
        statesZooTraceSourceId: companion.statesZooTraceSourceId,
      }
    }, traceId)).toEqual({
      name: 'recovered_state_tr',
      statesZooTraceSourceId: stateId,
    })
  })

  test('preserves tagged recipes through save, reload, and import', async ({ page }) => {
    await mockConfiguration(page)
    await loadApp(page)
    await createProject(page, 'Saved States Zoo Project')
    const panel = await openStatesZoo(page)
    const row = await addState(page, panel)
    const variableId = await row.getAttribute('data-variable-id')
    await row.locator('.states-zoo-name-input').fill('saved_state')

    const typePreview = page.waitForResponse(response => (
      response.url().endsWith('/states_zoo_preview') && response.ok()
    ))
    await row.locator('.states-zoo-type-select').selectOption('DepolarizedBellPair')
    await typePreview
    const parameterPreview = page.waitForResponse(response => (
      response.url().endsWith('/states_zoo_preview') && response.ok()
    ))
    await row.locator('.states-zoo-parameter-input').fill('0.75')
    await parameterPreview

    await page.locator('.hamburger-btn').click()
    await page.getByText('Save', { exact: true }).click()
    const storedVariable = await page.evaluate(projectName => {
      const project = JSON.parse(localStorage.getItem(`cqn_project_${projectName}`))
      localStorage.setItem('recentProjectName', projectName)
      return project.variables[0]
    }, 'Saved States Zoo Project')
    expect(storedVariable).toEqual({
      id: variableId,
      name: 'saved_state',
      type: 'Symbolic',
      selectedType: 'Symbolic',
      value: {
        kind: 'states_zoo',
        state_type: 'DepolarizedBellPair',
        parameters: { p: 0.75 },
      },
    })

    await page.reload()
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
    const reloadedPanel = await openStatesZoo(page)
    const reloadedRow = reloadedPanel.locator(`.states-zoo-row[data-variable-id="${variableId}"]`)
    await expect(reloadedRow.locator('.states-zoo-name-input')).toHaveValue('saved_state')
    await expect(reloadedRow.locator('.states-zoo-type-select')).toHaveValue('DepolarizedBellPair')
    await expect(reloadedRow.locator('.states-zoo-parameter-input')).toHaveValue('0.75')

    const importedProject = {
      name: 'Imported States Zoo Project',
      variables: [{
        id: 'variable_imported_zoo',
        name: 'imported_state',
        type: 'Symbolic',
        value: {
          kind: 'states_zoo',
          state_type: 'DepolarizedBellPair',
          parameters: { p: 0.25 },
        },
      }],
      simulationConfig: { time: 1, timeStep: 0.1 },
      net: { nodes: [], edges: [], protocols: [] },
    }
    await page.locator('.hamburger-btn').click()
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByText('Import', { exact: true }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
      name: 'imported-states-zoo.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importedProject)),
    })
    await expect(page.locator('.project-name-label')).toContainText('Imported States Zoo Project')
    const importedDialog = page.getByRole('dialog', { name: 'Project imported' })
    await expect(importedDialog).toContainText('Project "Imported States Zoo Project" imported successfully!')
    await importedDialog.getByRole('button', { name: 'OK' }).click()
    const importedPanel = await openStatesZoo(page)
    const importedRow = importedPanel.locator(
      '.states-zoo-row[data-variable-id="variable_imported_zoo"]',
    )
    await expect(importedRow.locator('.states-zoo-name-input')).toHaveValue('imported_state')
    await expect(importedRow.locator('.states-zoo-parameter-input')).toHaveValue('0.25')
  })

  test('debounces previews, keeps the last image, ignores stale work, retries, and cleans up', async ({ page }) => {
    const previewRequests = []
    const pendingPreviews = []
    let previewBehavior = 'success'

    await mockConfiguration(page, {
      previewHandler: (route, payload) => {
        previewRequests.push(payload)
        if (previewBehavior === 'hold') {
          pendingPreviews.push({ route, payload })
          return undefined
        }
        if (previewBehavior === 'error') {
          return route.fulfill(canonicalErrorResponse({
            code: 'VALIDATION_ERROR',
            message: 'Preview failed for this value',
            status: 422,
            details: { state_type: payload.state_type },
          }))
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: { success: true, png_base64: TRANSPARENT_PNG },
        })
      },
    })
    await loadApp(page)
    const panel = await openStatesZoo(page)
    const row = await addState(page, panel)
    const image = row.locator('.states-zoo-preview-image')
    const preview = row.locator('.states-zoo-preview')
    const initialImage = await expectWatermarkedPng(image, TRANSPARENT_PNG)

    const typePreview = page.waitForResponse(response => (
      response.url().endsWith('/states_zoo_preview') && response.ok()
    ))
    await row.locator('.states-zoo-type-select').selectOption('DepolarizedBellPair')
    await typePreview
    const parameterInput = row.locator('.states-zoo-parameter-input')
    const requestBaseline = previewRequests.length

    previewBehavior = 'hold'
    await parameterInput.fill('0.2')
    await parameterInput.fill('0.3')
    await parameterInput.fill('0.4')
    await page.waitForTimeout(350)
    expect(previewRequests).toHaveLength(requestBaseline)
    await expect.poll(() => previewRequests.length).toBe(requestBaseline + 1)
    await expect(preview).toHaveAttribute('aria-busy', 'true')
    await expect(row.locator('.states-zoo-preview-overlay')).toBeVisible()
    await expect(image).toHaveAttribute('src', initialImage)

    const debouncedPreview = pendingPreviews.shift()
    await debouncedPreview.route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { success: true, png_base64: RED_PNG },
    })
    const redImage = await expectWatermarkedPng(image, RED_PNG, initialImage)
    await expect(preview).toHaveAttribute('aria-busy', 'false')

    await parameterInput.fill('0.5')
    await expect.poll(() => pendingPreviews.length).toBe(1)
    const stalePreview = pendingPreviews.shift()
    await parameterInput.fill('0.6')
    await expect.poll(() => pendingPreviews.length).toBe(1)
    const newestPreview = pendingPreviews.shift()
    await newestPreview.route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { success: true, png_base64: BLUE_PNG },
    })
    const blueImage = await expectWatermarkedPng(image, BLUE_PNG, redImage)
    await stalePreview.route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { success: true, png_base64: TRANSPARENT_PNG },
    }).catch(() => {})
    await page.waitForTimeout(100)
    await expect(image).toHaveAttribute('src', blueImage)

    previewBehavior = 'error'
    await parameterInput.fill('0.7')
    await expect(row.locator('.states-zoo-preview-error')).toContainText('Preview failed')
    await expect(image).toHaveAttribute('src', blueImage)
    const retryButton = row.getByRole('button', { name: 'Retry preview' })
    await expect(retryButton).toBeEnabled()

    previewBehavior = 'success'
    await retryButton.click()
    await expectWatermarkedPng(image, TRANSPARENT_PNG, blueImage)
    await expect(row.locator('.states-zoo-preview-error')).toHaveCount(0)

    const beforeDelete = previewRequests.length
    await parameterInput.fill('0.8')
    await row.locator('.delete-states-zoo-button').click()
    await expect(panel.locator('.states-zoo-row')).toHaveCount(0)
    await page.waitForTimeout(650)
    expect(previewRequests).toHaveLength(beforeDelete)
  })
})
