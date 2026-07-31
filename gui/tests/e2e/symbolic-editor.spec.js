import { test, expect } from '@playwright/test'
import { simulationNotFoundResponse } from './httpResponses.js'
import { saveAndReadProject } from './projectBoundary.js'
import {
  addOneSlotToEachNode,
  mockParseAndDestroy,
  parsePayloadThroughRunner,
} from './simulationLifecycle.js'

const SYMBOLIC_PROTOCOL_TYPE = {
  type: 'TestProtocols.SymbolicProt',
  doc: 'Protocol used to exercise symbolic parameter editing.',
  group: 'node',
  virtual: null,
  parameters: [{
    field: 'observable',
    type: 'Symbolic',
    doc: 'A symbolic observable.',
  }],
}

const CUSTOM_FUNCTION_PROTOCOL_TYPE = {
  type: 'TestProtocols.FunctionProt',
  doc: 'Protocol used to exercise custom-function parameter editing.',
  group: 'node',
  virtual: null,
  parameters: [{
    field: 'callback',
    type: 'Function',
    doc: 'A custom callback.',
  }],
}

const VALID_FUNCTION_SOURCE = `valid_callback = function (value)
  return value + 1
end`

const INVALID_FUNCTION_ERROR = [
  'ParseError:',
  '# Error @ none:1:9',
  'invalid(',
  '#       └ ── Expected `)` or `,`',
].join('\n')

async function mockConfiguration(page) {
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
  await page.route('**/simulation_log_groups', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { simulation_log_groups: [] },
  }))
  await page.route('**/protocol_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { protocol_types: [SYMBOLIC_PROTOCOL_TYPE, CUSTOM_FUNCTION_PROTOCOL_TYPE] },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: {
      versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
      capabilities: { unsafe_code_evaluation: true },
    },
  }))
  await page.route('**/get_state?**', route => route.fulfill(
    simulationNotFoundResponse(),
  ))
  await page.route('**/test_symbolic_expression', route => {
    const { expr } = route.request().postDataJSON()
    if (expr === 'valid_untrusted_expression') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          success: true,
          results: { value: expr, latex: '$\\href{javascript:alert(1)}{x}$' },
        },
      })
    }

    if (expr.startsWith('valid')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          success: true,
          results: { value: expr, latex: '$x^{2}$' },
        },
      })
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { success: false, error: 'Invalid symbolic expression' },
    })
  })
  await page.route('**/test_code', route => {
    const { code, placement } = route.request().postDataJSON()
    if (code.startsWith('valid') && ['node', 'variable'].includes(placement)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          success: true,
          results: { functions: ['valid_callback'], variables: {} },
        },
      })
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { success: false, error: INVALID_FUNCTION_ERROR },
    })
  })
  await mockParseAndDestroy(page)
}

async function loadApp(page) {
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  const platformInfoLoaded = page.waitForResponse(
    response => response.url().endsWith('/platform_info') && response.ok(),
  )
  await page.goto('/')
  await Promise.all([protocolTypesLoaded, platformInfoLoaded])
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function createProjectWithNode(page, projectName) {
  await page.locator('.hamburger-btn').click()
  await page.getByText('New', { exact: true }).click()
  await page.getByPlaceholder('Project name').fill(projectName)
  await page.locator('button.primary').click()

  await page.keyboard.down('Alt')
  await page.locator('canvas').first().click({ position: { x: 450, y: 300 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(1)
}

async function createProjectWithProtocol(page, { projectName, protocolType }) {
  await createProjectWithNode(page, projectName)
  await page.locator('.node-marker').click()
  const nodePanel = page.locator('#nodePanel')
  const protocolName = protocolType.split('.').pop()
  await nodePanel.getByRole('button', { name: 'Add Protocol' }).click()
  await page.getByRole('menuitem', { name: protocolName, exact: true }).click()

  const editor = nodePanel.locator('.protocol-editor', { hasText: protocolName })
  await expect(editor).toBeVisible()
  await editor.locator('.protocol-list-type').click()
  await expect(editor.locator('.protocol-container')).toBeVisible()
  return editor
}

function createProjectWithSymbolicProtocol(page) {
  return createProjectWithProtocol(page, {
    projectName: 'Symbolic Editor Test',
    protocolType: SYMBOLIC_PROTOCOL_TYPE.type,
  })
}

async function createProjectWithCustomFunctionProtocol(page) {
  const editor = await createProjectWithProtocol(page, {
    projectName: 'Custom Function Editor Test',
    protocolType: CUSTOM_FUNCTION_PROTOCOL_TYPE.type,
  })
  await editor.locator('.complexTypeSelector').selectOption('Lambda')
  return editor
}

async function expectEditorLayersAligned(valueEditor) {
  const origins = await valueEditor.locator('.code_area').evaluate(codeArea => {
    const contentOrigin = element => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        x: rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
        y: rect.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop),
      }
    }

    return {
      caret: contentOrigin(codeArea.querySelector('textarea')),
      highlightedText: contentOrigin(codeArea.querySelector('pre code.hljs')),
    }
  })

  expect(Math.abs(origins.caret.x - origins.highlightedText.x)).toBeLessThan(0.5)
  expect(Math.abs(origins.caret.y - origins.highlightedText.y)).toBeLessThan(0.5)
}

async function expectCustomFunctionValidationLifecycle(
  page,
  valueEditor,
  { checkSmallViewport = false } = {},
) {
  const input = valueEditor.locator('textarea')
  await expect(input).toBeVisible()
  const contextTrigger = valueEditor.getByRole('button', { name: 'Custom function context' })
  const contextHelp = page.getByRole('dialog', { name: 'Custom function context' })
  await expect(contextHelp).toHaveCount(0)
  await contextTrigger.click()
  await expect(contextHelp).toBeVisible()
  await expect(
    contextHelp.getByRole('button', { name: 'Close custom function context' }),
  ).toBeFocused()
  await expect(contextHelp).toContainText('nodeid("Node name")')
  await expect(contextHelp).toContainText('self')
  await expect(contextHelp).toContainText('node protocol')
  await expect(contextHelp).toContainText('refractive_index')
  await expect(contextHelp).toContainText('loss')
  await expect(contextHelp).toContainText('transmissivity')
  await expect(contextHelp).toContainText('distance')
  await page.keyboard.press('Escape')
  await expect(contextHelp).toHaveCount(0)
  await expect(contextTrigger).toBeFocused()

  if (checkSmallViewport) {
    await page.setViewportSize({ width: 390, height: 420 })
    const warning = page.getByRole('alertdialog', {
      name: 'WebQuantumSavory works best on a larger screen',
    })
    await warning.getByRole('button', { name: 'Continue anyway' }).click()

    await contextTrigger.scrollIntoViewIfNeeded()
    await expect(contextTrigger).toBeInViewport()
    await page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    }))
    await contextTrigger.click()
    await expect(contextHelp).toBeVisible()
    await expect(contextHelp).toHaveCSS('transform', 'none')
    const bounds = await contextHelp.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    })
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.top).toBeGreaterThanOrEqual(0)
    expect(bounds.right).toBeLessThanOrEqual(390)
    expect(bounds.bottom).toBeLessThanOrEqual(420)
    await expect(contextHelp.locator('.source-context-overlay-content')).toHaveCSS(
      'overflow-y',
      'auto',
    )
    await contextHelp.getByRole('button', { name: 'Close custom function context' }).click()
    await expect(contextHelp).toHaveCount(0)
    await expect(contextTrigger).toBeFocused()
    await page.setViewportSize({ width: 1920, height: 1080 })
  }

  await expect(valueEditor.getByTestId('code-collapsed-view')).toHaveCount(0)

  await input.fill('invalid(')
  await valueEditor.locator('.validate-button').click()

  const errorBadge = valueEditor.locator('.function-error-badge')
  await expect(errorBadge).toContainText('Validation failed')
  await expect(errorBadge).toHaveAttribute('role', 'alert')
  await errorBadge.hover()
  await expect(page.locator('.p-tooltip-text')).toContainText('ParseError:')
  await expect(page.locator('.p-tooltip-text')).toContainText('Expected `)` or `,`')
  await expect(input).toBeVisible()
  await expect(valueEditor.getByTestId('code-collapsed-view')).toHaveCount(0)

  await input.fill(VALID_FUNCTION_SOURCE)
  await valueEditor.locator('.validate-button').click()

  const renderedResult = valueEditor.getByTestId('code-collapsed-view')
  const renderedSource = renderedResult.locator('.code-rendered-value')
  await expect(renderedResult).toBeVisible()
  await expect(renderedResult).toHaveAttribute('aria-label', 'Edit custom function')
  await expect.poll(() => renderedSource.textContent()).toBe(VALID_FUNCTION_SOURCE)
  await expect(renderedSource).toHaveCSS('white-space', 'pre-wrap')
  await expect(valueEditor.locator('textarea')).toHaveCount(0)
  await expect(valueEditor.locator('.validate-button')).toHaveCount(0)

  await renderedResult.click()
  await expect(valueEditor.locator('textarea')).toBeVisible()
  await expect(valueEditor.locator('textarea')).toHaveValue(VALID_FUNCTION_SOURCE)
}

test.describe('Code editor lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await mockConfiguration(page)
    await loadApp(page)
  })

  test('hides a default protocol expression, then opens its explicit editor until valid', async ({ page }) => {
    const protocolEditor = await createProjectWithSymbolicProtocol(page)
    const optionSelector = protocolEditor.getByRole('combobox', {
      name: 'Input option for observable',
    })
    await expect(optionSelector).toHaveValue('default')
    await expect(protocolEditor.locator('.code-editor-with-symbols')).toHaveCount(0)
    await optionSelector.selectOption('Symbolic')

    const valueEditor = protocolEditor.locator('.code-editor-with-symbols')
    const input = valueEditor.locator('textarea')
    await expect(input).toBeVisible()
    await expect(input).toHaveValue('')
    await expect(valueEditor.getByTestId('source-context-help')).toHaveCount(0)
    await input.fill('invalid(')
    await expectEditorLayersAligned(valueEditor)
    await valueEditor.locator('.validate-button').click()

    await expect(valueEditor.locator('.function-error-badge')).toContainText('Validation failed')
    await expect(input).toBeVisible()
    await expect(valueEditor.getByTestId('symbolic-collapsed-view')).toHaveCount(0)

    await input.fill('valid_protocol_expression')
    await valueEditor.locator('.validate-button').click()

    const renderedResult = valueEditor.getByTestId('symbolic-collapsed-view')
    await expect(renderedResult).toBeVisible()
    await expect(renderedResult).toHaveAttribute('aria-label', 'Edit symbolic expression')
    await expect(renderedResult.locator('.katex')).toBeVisible()
    await expect(valueEditor.locator('textarea')).toHaveCount(0)
    await expect(valueEditor.locator('.validate-button')).toHaveCount(0)

    await renderedResult.click()
    await expect(valueEditor.locator('textarea')).toBeVisible()
    await expect(valueEditor.locator('textarea')).toHaveValue('valid_protocol_expression')

    await valueEditor.locator('textarea').fill('valid_untrusted_expression')
    await valueEditor.locator('.validate-button').click()
    await expect(valueEditor.getByTestId('symbolic-collapsed-view').locator('.katex')).toBeVisible()
    await expect(valueEditor.getByTestId('symbolic-collapsed-view').locator('a')).toHaveCount(0)
  })

  test('starts open for a new Symbolic variable and collapses after validation', async ({ page }) => {
    await page.getByRole('tab', { name: 'Variables' }).click()
    const variablesPanel = page.getByTestId('variables-panel')
    await variablesPanel.getByRole('button', { name: 'Add Variable' }).click()

    const variableRow = variablesPanel.locator('.variable-row')
    await variableRow.locator('.variable-type-select').selectOption('Symbolic')
    const valueEditor = variableRow.locator('.code-editor-with-symbols')
    const input = valueEditor.locator('textarea')

    await expect(input).toBeVisible()
    await expect(valueEditor.getByTestId('source-context-help')).toHaveCount(0)
    await expect(valueEditor.getByTestId('symbolic-collapsed-view')).toHaveCount(0)
    await input.fill('valid_variable_expression')
    await valueEditor.locator('.validate-button').click()

    const renderedResult = valueEditor.getByTestId('symbolic-collapsed-view')
    await expect(renderedResult).toBeVisible()
    await expect(renderedResult.locator('.katex')).toBeVisible()
    await expect(valueEditor.locator('textarea')).toHaveCount(0)

    await renderedResult.click()
    await expect(valueEditor.locator('textarea')).toBeVisible()
    await expect(valueEditor.locator('textarea')).toHaveValue('valid_variable_expression')
  })

  test('opens an empty protocol custom function and renders source after success', async ({ page }) => {
    const protocolEditor = await createProjectWithCustomFunctionProtocol(page)
    const valueEditor = protocolEditor.locator('.code-editor-with-symbols')
    await expectCustomFunctionValidationLifecycle(
      page,
      valueEditor,
      { checkSmallViewport: true },
    )

    await addOneSlotToEachNode(page)
    const payload = await parsePayloadThroughRunner(page)
    const serializedParameter = payload.net.nodes[0].data.protocols[0].parameters[0]
    expect(serializedParameter).toEqual({
      name: 'callback',
      type: 'Lambda',
      value: VALID_FUNCTION_SOURCE,
    })
  })

  test('starts open for a new custom-function variable and collapses only after validation succeeds', async ({ page }) => {
    const projectName = 'Custom Function Variable Test'
    await createProjectWithNode(page, projectName)
    await addOneSlotToEachNode(page)
    await page.getByRole('tab', { name: 'Variables' }).click()
    const variablesPanel = page.getByTestId('variables-panel')
    await variablesPanel.getByRole('button', { name: 'Add Variable' }).click()

    const variableRow = variablesPanel.locator('.variable-row')
    await variableRow.locator('.variable-type-select').selectOption('Lambda')
    const valueEditor = variableRow.locator('.code-editor-with-symbols')

    await expectCustomFunctionValidationLifecycle(page, valueEditor)

    const variableId = await variableRow.getAttribute('data-variable-id')
    const stored = await saveAndReadProject(page, projectName)
    const payload = await parsePayloadThroughRunner(page)
    const serializedVariables = {
      full: stored.variables[0],
      minimized: payload.variables[0],
    }
    const expectedVariable = {
      id: variableId,
      name: 'variable_1',
      type: 'Lambda',
      value: VALID_FUNCTION_SOURCE,
    }
    expect(serializedVariables.full).toEqual({
      ...expectedVariable,
      selectedType: 'Lambda',
    })
    expect(serializedVariables.minimized).toEqual(expectedVariable)
  })
})
