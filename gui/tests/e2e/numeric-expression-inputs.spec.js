import { expect, test } from '@playwright/test'
import { backendPlatformInfo } from '../platformInfoFixtures.js'
import {
  canonicalErrorResponse,
  simulationNotFoundResponse,
} from './httpResponses.js'

const PROTOCOL_TYPE = 'QuantumSavory.ProtocolZoo.NumericExpressionProt'
const PROTOCOL_DEFINITION = {
  type: PROTOCOL_TYPE,
  doc: 'Exercise numeric input descriptors.',
  group: 'edge',
  virtual: true,
  parameters: [{
    field: 'delay_scale',
    type: 'Float64',
    defaultValue: 7.5,
    min: 0,
    doc: 'Scale derived from the concrete edge assignment.',
  }, {
    field: 'rounds',
    type: 'Int64',
    defaultValue: 3,
    min: 1,
    doc: 'Integer retry count.',
  }],
}
const TEMPLATE_PROTOCOL_DEFINITION = {
  ...PROTOCOL_DEFINITION,
  type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
  doc: 'Exercise deferred numeric expressions in layout templates.',
}

async function mockBackend(page, {
  evaluationEnabled = true,
  numericRequests = [],
  numericResponder = null,
} = {}) {
  await page.route('**/known_functions', route => route.fulfill({
    json: { known_functions: ['identity'] },
  }))
  await page.route('**/background_types', route => route.fulfill({
    json: { background_types: [] },
  }))
  await page.route('**/slot_types', route => route.fulfill({
    json: { slot_types: ['Qubit', 'Qumode'] },
  }))
  await page.route('**/states_zoo_types', route => route.fulfill({
    json: { states_zoo_types: [] },
  }))
  await page.route('**/protocol_types', route => route.fulfill({
    json: { protocol_types: [PROTOCOL_DEFINITION, TEMPLATE_PROTOCOL_DEFINITION] },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    json: backendPlatformInfo({ unsafeCodeEvaluation: evaluationEnabled }),
  }))
  await page.route('**/get_state?**', route => route.fulfill(
    simulationNotFoundResponse(),
  ))
  await page.route('**/logs/**', route => route.fulfill({
    json: { success: true, logs: [], count: 0 },
  }))
  await page.route('**/destroy_simulation', route => route.fulfill({
    json: { success: true },
  }))
  await page.route('**/test_numeric_expression', async route => {
    const request = route.request().postDataJSON()
    numericRequests.push(request)
    if (!evaluationEnabled) {
      return route.fulfill(canonicalErrorResponse({
        code: 'UNSAFE_EVALUATION_DISABLED',
        message: 'Server-side Julia evaluation is disabled.',
        status: 403,
        details: {
          configuration_variable: 'WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION',
        },
      }))
    }
    if (numericResponder) {
      const response = await numericResponder(request)
      return route.fulfill({
        status: response.status || 200,
        json: response.json || response,
      })
    }

    const deferred = request.placement === 'variable'
      ? /\b(delay|distance|node_a|node_b|refractive_index|loss|transmissivity|self)\b/
        .test(request.expression)
      : request.context === undefined
    const value = request.expression.includes('delay')
      ? '2.5e-7'
      : request.target_type === 'Int64' ? '8' : '0.125'
    return route.fulfill({
      json: {
        success: true,
        results: {
          deferred,
          target_type: request.target_type,
          ...(!deferred || request.placement !== 'variable' ? { value } : {}),
        },
      },
    })
  })
}

async function loadApp(page) {
  const metadataLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  await page.goto('/')
  await metadataLoaded
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function createProject(page, name) {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'New' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Project' })
  await dialog.getByPlaceholder('Project name').fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()
}

async function createPhysicalEdge(page) {
  for (const position of [{ x: 400, y: 300 }, { x: 600, y: 400 }]) {
    await page.keyboard.down('Alt')
    await page.locator('canvas').first().click({ position })
    await page.keyboard.up('Alt')
  }
  await expect(page.locator('.node-marker')).toHaveCount(2)

  const firstNode = page.locator('.node-marker').first()
  await firstNode.hover()
  await firstNode.locator('.connector.output').dragTo(page.locator('.node-marker').nth(1))
  await expect(page.locator('.edge-list-item')).toHaveCount(1)
}

async function createRepeaterTemplate(page) {
  for (const position of [{ x: 350, y: 250 }, { x: 700, y: 390 }, { x: 520, y: 320 }]) {
    await page.keyboard.down('Alt')
    await page.locator('canvas').first().click({ position })
    await page.keyboard.up('Alt')
  }
  await expect(page.locator('.node-marker')).toHaveCount(3)
  const templateNode = page.locator('.node-marker').nth(2)
  await templateNode.hover()
  await templateNode.locator('.connector.output').dragTo(page.locator('.node-marker').first())
  await expect(page.locator('.edge-list-item')).toHaveCount(1)
}

async function installProtocol(page, parameters = null) {
  await page.evaluate(({ protocolType, suppliedParameters }) => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const edge = setup?.projectData?.net?.edges?.[0]
    if (!edge) throw new Error('Reactive edge state is unavailable')
    edge.data.protocols.push({
      id: 'protocol_numeric_expression_e2e',
      type: protocolType,
      parameters: suppliedParameters || [{
        name: 'delay_scale',
        type: 'Float64',
        selectedType: 'default',
        value: null,
      }, {
        name: 'rounds',
        type: 'Int64',
        selectedType: 'default',
        value: null,
      }],
    })
  }, { protocolType: PROTOCOL_TYPE, suppliedParameters: parameters })
}

async function openProtocolEditor(page) {
  await page.locator('.edge-list-item').first().click()
  const editor = page.locator('#edgePanel .protocol-editor', {
    hasText: 'NumericExpressionProt',
  })
  await expect(editor).toBeVisible()
  await editor.locator('.protocol-list-type').click()
  await expect(editor.getByTestId('protocol-constructor')).toBeVisible()
  return editor
}

function parameterRow(container, name) {
  return container.locator('.param-item').filter({ hasText: name })
}

async function serializedParameter(page, minimized = false) {
  return page.evaluate(useMinimized => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const project = useMinimized
      ? (setup?.minimizedProjectData?.value ?? setup?.minimizedProjectData)
      : setup?.serializeProjectData?.()
    const parameter = project?.net?.edges?.[0]?.data?.protocols?.[0]?.parameters?.find(
      candidate => candidate.name === 'delay_scale',
    )
    return parameter ? JSON.parse(JSON.stringify(parameter)) : null
  }, minimized)
}

test.describe('Default-first numeric expression inputs', () => {
  test('rejects an empty explicit singleton and preserves a direct expression across save/reload', async ({
    page,
  }) => {
    const numericRequests = []
    await mockBackend(page, { numericRequests })
    await loadApp(page)
    await createProject(page, 'Numeric Expression Persistence')
    await createPhysicalEdge(page)
    await installProtocol(page)

    let editor = await openProtocolEditor(page)
    let row = parameterRow(editor, 'delay_scale')
    let selector = row.getByRole('combobox', { name: 'Input option for delay_scale' })
    await expect(selector.locator('option')).toHaveText([
      'Default',
      'Float64',
      'Float64 Expression',
    ])
    await expect(selector).toHaveValue('default')
    expect(await serializedParameter(page, true)).toBeNull()

    await selector.selectOption('Float64')
    await expect(row.locator('input[type="number"]')).toHaveValue('')
    expect(await serializedParameter(page, true)).toBeNull()

    await selector.selectOption('expression:Float64')
    const source = row.getByTestId('numeric-expression-source')
    await source.fill('delay / 2')
    await row.getByRole('button', { name: 'Validate delay_scale expression' }).click()
    await expect(row.getByTestId('numeric-expression-result')).toHaveText('Result: 2.5e-7')
    const summary = row.getByTestId('numeric-expression-summary')
    await expect(summary.getByTestId('numeric-expression-source')).toHaveText('delay / 2')
    await expect(summary).toHaveAttribute(
      'aria-label',
      /delay \/ 2; Result: 2\.5e-7/,
    )
    await summary.focus()
    await summary.press('Enter')
    await expect(row.getByTestId('numeric-expression-source')).toHaveValue('delay / 2')
    await expect(row.getByTestId('numeric-expression-source')).toBeFocused()
    await row.getByTestId('numeric-expression-source').fill('delay / 4')
    await row.getByRole('button', { name: 'Validate delay_scale expression' }).click()
    await expect(summary.getByTestId('numeric-expression-source')).toHaveText('delay / 4')
    await expect(summary.getByTestId('numeric-expression-result')).toHaveText('Result: 2.5e-7')
    await expect(summary).toBeFocused()

    expect(numericRequests.at(-1)).toMatchObject({
      expression: 'delay / 4',
      target_type: 'Float64',
      placement: 'edge',
      context: {
        node_names: ['Node 1', 'Node 2'],
        node_a: 1,
        node_b: 2,
      },
    })
    expect(Number.isFinite(numericRequests.at(-1).context.distance)).toBe(true)
    expect(Number.isFinite(numericRequests.at(-1).context.delay)).toBe(true)
    expect(Number.isFinite(numericRequests.at(-1).context.refractive_index)).toBe(true)
    expect(Number.isFinite(numericRequests.at(-1).context.loss)).toBe(true)
    expect(Number.isFinite(numericRequests.at(-1).context.transmissivity)).toBe(true)

    expect(await serializedParameter(page)).toEqual({
      name: 'delay_scale',
      type: 'Float64',
      selectedType: 'expression:Float64',
      value: { kind: 'numeric_expression', source: 'delay / 4' },
    })
    expect(await serializedParameter(page, true)).toEqual({
      name: 'delay_scale',
      type: 'Float64',
      value: { kind: 'numeric_expression', source: 'delay / 4' },
    })

    await page.locator('.hamburger-btn').click()
    await page.getByRole('menuitem', { name: 'Save', exact: true }).click()
    const stored = await page.evaluate(() => (
      JSON.parse(localStorage.getItem('cqn_project_Numeric Expression Persistence'))
    ))
    expect(stored.net.edges[0].data.protocols[0].parameters[0]).toEqual({
      name: 'delay_scale',
      type: 'Float64',
      selectedType: 'expression:Float64',
      value: { kind: 'numeric_expression', source: 'delay / 4' },
    })

    const requestsBeforeReload = numericRequests.length
    await page.reload()
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
    editor = await openProtocolEditor(page)
    row = parameterRow(editor, 'delay_scale')
    selector = row.getByRole('combobox', { name: 'Input option for delay_scale' })
    await expect(selector).toHaveValue('expression:Float64')
    await expect(row.getByTestId('numeric-expression-summary')).toBeVisible()
    await expect(row.getByTestId('numeric-expression-source')).toHaveText('delay / 4')
    await expect(row.getByTestId('numeric-expression-result')).toHaveText('Result: 2.5e-7')
    await row.getByTestId('numeric-expression-summary').click()
    await expect(row.getByTestId('numeric-expression-source')).toHaveValue('delay / 4')
    expect(numericRequests.length).toBeGreaterThan(requestsBeforeReload)
  })

  test('defers contextual Variables, then previews them against a concrete link', async ({ page }) => {
    const numericRequests = []
    await mockBackend(page, { numericRequests })
    await loadApp(page)
    await createProject(page, 'Contextual Numeric Variable')
    await createPhysicalEdge(page)
    await installProtocol(page)

    await page.getByRole('tab', { name: 'Variables' }).click()
    const panel = page.getByTestId('variables-panel')
    await panel.getByRole('button', { name: 'Add Variable' }).click()
    const variable = panel.locator('.variable-row')
    await variable.locator('.variable-name-input').fill('edge_delay')
    await variable.getByTestId('variable-option-selector').selectOption('expression:Float64')
    const source = variable.getByTestId('numeric-expression-source')

    await source.fill('1 / 8')
    await variable.getByRole('button', { name: 'Validate edge_delay expression' }).click()
    await expect(variable.getByTestId('numeric-expression-result')).toHaveText('Result: 0.125')
    expect(numericRequests.at(-1)).toEqual({
      expression: '1 / 8',
      target_type: 'Float64',
      placement: 'variable',
    })

    await variable.getByTestId('numeric-expression-summary').click()
    await variable.getByTestId('numeric-expression-source').fill('delay / 2')
    await variable.getByRole('button', { name: 'Validate edge_delay expression' }).click()
    await expect(variable.getByTestId('numeric-expression-deferred')).toHaveText(
      'Evaluated when assigned.',
    )
    expect(numericRequests.at(-1)).toEqual({
      expression: 'delay / 2',
      target_type: 'Float64',
      placement: 'variable',
    })

    const variableId = await variable.getAttribute('data-variable-id')
    await page.locator('.edge-list-item').first().click()
    const editor = await openProtocolEditor(page)
    const row = parameterRow(editor, 'delay_scale')
    await row.getByRole('button', { name: 'Set delay_scale from a variable' }).click()
    await row.getByRole('combobox', { name: 'Variable for delay_scale' })
      .selectOption(variableId)

    const linked = row.getByTestId('linked-numeric-expression')
    await expect(linked.getByTestId('numeric-expression-source')).toHaveText('delay / 2')
    await expect(linked.getByTestId('numeric-expression-result')).toHaveText('Result: 2.5e-7')
    expect(numericRequests.at(-1)).toMatchObject({
      expression: 'delay / 2',
      target_type: 'Float64',
      placement: 'edge',
      context: {
        node_names: ['Node 1', 'Node 2'],
        node_a: 1,
        node_b: 2,
      },
    })
    expect(Number.isFinite(numericRequests.at(-1).context.loss)).toBe(true)
    expect(Number.isFinite(numericRequests.at(-1).context.transmissivity)).toBe(true)
  })

  test('keeps saved source visible while disabled and leaves numeric literals usable', async ({
    page,
  }) => {
    const numericRequests = []
    await mockBackend(page, { evaluationEnabled: false, numericRequests })
    await loadApp(page)
    await createProject(page, 'Disabled Numeric Expressions')
    await createPhysicalEdge(page)
    await installProtocol(page, [{
      name: 'delay_scale',
      type: 'Float64',
      selectedType: 'expression:Float64',
      value: { kind: 'numeric_expression', source: 'delay / 2' },
    }])

    const editor = await openProtocolEditor(page)
    const row = parameterRow(editor, 'delay_scale')
    const selector = row.getByRole('combobox', { name: 'Input option for delay_scale' })
    await expect(selector).toHaveValue('expression:Float64')
    await expect(row.getByTestId('numeric-expression-source')).toHaveValue('delay / 2')
    await expect(row.getByTestId('numeric-expression-source')).toHaveAttribute('readonly')
    await expect(row.getByTestId('numeric-expression-disabled')).toContainText(
      'server-side Julia evaluation is disabled',
    )
    await expect(row.getByRole('button', {
      name: 'Validate delay_scale expression',
    })).toBeDisabled()

    await selector.selectOption('Float64')
    await expect(row.locator('input[type="number"]')).toBeEnabled()
    await row.locator('input[type="number"]').fill('0.25')
    await row.locator('input[type="number"]').press('Tab')
    await expect.poll(() => serializedParameter(page, true)).toEqual({
      name: 'delay_scale',
      type: 'Float64',
      value: 0.25,
    })
    expect(numericRequests).toEqual([])
  })

  test('shows a representative layout-template result without assignment context', async ({
    page,
  }) => {
    const numericRequests = []
    await mockBackend(page, { numericRequests })
    await loadApp(page)
    await createProject(page, 'Template Numeric Expression')

    await page.getByRole('tab', { name: 'Layout Tools' }).click()
    await page.getByRole('button', { name: 'Repeater Chain Generator' }).click()
    const dialog = page.getByRole('dialog', { name: 'Repeater Chain Generator' })
    await dialog.locator('#chain-replace-entangler').setChecked(true)

    const constructor = dialog.getByTestId('template-protocol-constructor')
    const row = parameterRow(constructor, 'delay_scale')
    await row.getByRole('combobox', { name: 'Input option for delay_scale' })
      .selectOption('expression:Float64')
    await row.getByTestId('numeric-expression-source').fill('delay / 2')
    await row.getByRole('button', { name: 'Validate delay_scale expression' }).click()

    await expect(row.getByTestId('numeric-expression-deferred')).toHaveText(
      'Representative result; evaluated again when assigned.',
    )
    await expect(row.getByTestId('numeric-expression-result')).toHaveText('Result: 2.5e-7')
    expect(numericRequests.at(-1)).toEqual({
      expression: 'delay / 2',
      target_type: 'Float64',
      placement: 'edge',
    })
  })

  test('blocks Generate through edit, pending, and failure, then clones exact validated source', async ({
    page,
  }) => {
    const numericRequests = []
    let validationAttempt = 0
    let resolveFirstValidation
    await mockBackend(page, {
      numericRequests,
      numericResponder: request => {
        validationAttempt += 1
        if (validationAttempt === 1) {
          return new Promise(resolve => { resolveFirstValidation = resolve })
        }
        return {
          success: true,
          results: {
            deferred: true,
            target_type: request.target_type,
            value: '1.6666666666666665e-7',
          },
        }
      },
    })
    await loadApp(page)
    await createProject(page, 'Validated Template Generation')
    await createRepeaterTemplate(page)

    await page.getByRole('tab', { name: 'Layout Tools' }).click()
    await page.getByRole('button', { name: 'Repeater Chain Generator' }).click()
    const dialog = page.getByRole('dialog', { name: 'Repeater Chain Generator' })
    await dialog.locator('#chain-start-node').selectOption({ label: 'Node 1' })
    await dialog.locator('#chain-end-node').selectOption({ label: 'Node 2' })
    await dialog.locator('#chain-template-node').selectOption({ label: 'Node 3' })
    await dialog.locator('#chain-template-edge').selectOption({ index: 1 })
    await dialog.locator('#chain-repeater-count').fill('2')
    await dialog.locator('#chain-replace-entangler').setChecked(true)

    const constructor = dialog.getByTestId('template-protocol-constructor')
    const row = parameterRow(constructor, 'delay_scale')
    await row.getByRole('combobox', { name: 'Input option for delay_scale' })
      .selectOption('expression:Float64')
    const source = row.getByTestId('numeric-expression-source')
    const generate = dialog.getByRole('button', { name: 'Generate Chain' })
    await source.fill('delay / 2')
    await expect(generate).toBeDisabled()

    const validate = row.getByRole('button', { name: 'Validate delay_scale expression' })
    await validate.click()
    await expect(validate).toHaveText('Validating…')
    await expect(validate).toBeDisabled()
    await expect(generate).toBeDisabled()
    resolveFirstValidation({ success: false, error: 'Representative validation failed.' })
    await expect(row.getByTestId('numeric-expression-error'))
      .toHaveText('Representative validation failed.')
    await expect(generate).toBeDisabled()

    await source.fill('delay / 3')
    await expect(generate).toBeDisabled()
    await validate.click()
    await expect(row.getByTestId('numeric-expression-result'))
      .toHaveText('Result: 1.6666666666666665e-7')
    await expect(generate).toBeEnabled()
    await generate.click()
    await expect(dialog).toHaveCount(0)

    const generatedValues = await page.evaluate(protocolType => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      return setup.projectData.net.edges.flatMap(edge => edge.data.protocols)
        .filter(protocol => protocol.type === protocolType)
        .map(protocol => protocol.parameters.find(parameter => parameter.name === 'delay_scale')?.value)
    }, TEMPLATE_PROTOCOL_DEFINITION.type)
    expect(generatedValues).toHaveLength(3)
    expect(generatedValues).toEqual(Array(3).fill({
      kind: 'numeric_expression',
      source: 'delay / 3',
    }))
    expect(numericRequests.at(-1)).toEqual({
      expression: 'delay / 3',
      target_type: 'Float64',
      placement: 'edge',
    })
  })
})
