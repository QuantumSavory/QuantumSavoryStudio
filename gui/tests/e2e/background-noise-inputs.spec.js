import { expect, test } from '@playwright/test'

function parameterRow(container, name) {
  return container.locator('.param-item').filter({ hasText: name })
}

async function createProject(page, name) {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'New' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Project' })
  await dialog.getByPlaceholder('Project name').fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()
}

async function addNode(page, position) {
  const count = await page.locator('.node-marker').count()
  await page.keyboard.down('Alt')
  await page.locator('canvas').first().click({ position })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(count + 1)
}

async function configureDirectExpression(page, slot, source, { template = false } = {}) {
  await slot.getByRole('combobox', { name: /Background noise for slot/ })
    .selectOption('T1Decay')
  await slot.getByRole('button', { name: 'Toggle details' }).click()
  const constructor = slot.getByTestId(
    template ? 'template-background-noise-constructor' : 'background-noise-constructor',
  )
  const parameter = parameterRow(constructor, 't1')
  await parameter.getByRole('combobox', { name: 'Input option for t1' })
    .selectOption('expression:Float64')
  await parameter.getByTestId('numeric-expression-source').fill(source)
  const validationResponse = page.waitForResponse(
    response => response.url().endsWith('/test_numeric_expression'),
  )
  await parameter.getByRole('button', { name: 'Validate t1 expression' }).click()
  expect((await validationResponse).ok()).toBe(true)
  await expect(parameter.getByTestId('numeric-expression-result')).toContainText(
    'Result:',
    { timeout: 15_000 },
  )
  return parameter
}

test.describe('Background-noise constructor inputs', () => {
  test('simulates, templates, persists, and exports contextual assignments', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000)
    test.skip(browserName !== 'chromium', 'The end-to-end backend workflow runs once in Chromium.')

    const numericRequests = []
    page.on('request', request => {
      if (!request.url().endsWith('/test_numeric_expression')) return
      numericRequests.push(request.postDataJSON())
    })

    const backgroundsLoaded = page.waitForResponse(
      response => response.url().endsWith('/background_types') && response.ok(),
    )
    await page.goto('/')
    await backgroundsLoaded
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
    const projectName = 'Contextual Background E2E'
    await createProject(page, projectName)

    await addNode(page, { x: 390, y: 235 })
    await page.locator('.node-marker').first().click()
    await page.locator('#nodePanel .add-slot-btn').click()
    const installedSlot = page.locator('#nodePanel .slot-row-container').first()
    const directParameter = await configureDirectExpression(
      page,
      installedSlot,
      'self + nodeid("Node 1")',
    )
    await expect(directParameter.getByTestId('numeric-expression-result')).toContainText('2')
    await expect(directParameter.getByTestId('numeric-expression-summary')).toBeVisible()
    await expect(directParameter.getByTestId('numeric-expression-source'))
      .toHaveText('self + nodeid("Node 1")')
    await directParameter.getByTestId('numeric-expression-summary').click()
    await directParameter.getByTestId('numeric-expression-source')
      .fill('self + nodeid("Node 1") + 1')
    await directParameter.getByRole('button', { name: 'Validate t1 expression' }).click()
    await expect(directParameter.getByTestId('numeric-expression-result')).toContainText('3')
    expect(numericRequests.at(-1)).toMatchObject({
      expression: 'self + nodeid("Node 1") + 1',
      target_type: 'Float64',
      placement: 'node',
      context: {
        node_names: ['Node 1'],
        self: 1,
      },
    })

    await page.getByRole('tab', { name: 'Variables' }).click()
    const variables = page.getByTestId('variables-panel')
    await variables.getByRole('button', { name: 'Add Variable' }).click()
    const variable = variables.locator('.variable-row').first()
    await variable.locator('.variable-name-input').fill('node_decay')
    await variable.getByTestId('variable-option-selector').selectOption('expression:Float64')
    await variable.getByTestId('numeric-expression-source')
      .fill('self + nodeid("Node 1")')
    await variable.getByRole('button', { name: 'Validate node_decay expression' }).click()
    await expect(variable.getByTestId('numeric-expression-deferred'))
      .toHaveText('Evaluated when assigned.')
    const variableId = await variable.getAttribute('data-variable-id')

    await page.locator('.node-marker').first().click()
    const linkedParameter = parameterRow(
      page.locator('#nodePanel .slot-row-container').first(),
      't1',
    )
    await linkedParameter.getByRole('button', { name: 'Set t1 from a variable' }).click()
    await linkedParameter.getByRole('combobox', { name: 'Variable for t1' })
      .selectOption(variableId)
    await expect(linkedParameter.getByTestId('linked-numeric-expression'))
      .toContainText('self + nodeid("Node 1")')
    await expect(linkedParameter.getByTestId('numeric-expression-result')).toContainText('2')

    await page.getByRole('tab', { name: 'Layout Tools' }).click()
    const template = page.locator('.template-node')
    await template.getByRole('button', { name: 'Add Slot' }).click()
    const templateSlot = template.locator('.slot-row-container').first()
    const templateRequestsStart = numericRequests.length
    const templateParameter = await configureDirectExpression(
      page,
      templateSlot,
      'self + 10',
      { template: true },
    )
    await expect(templateParameter.getByTestId('numeric-expression-deferred')).toHaveText(
      'Representative result; evaluated again when assigned.',
    )
    await expect(templateParameter.getByTestId('numeric-expression-source')).toHaveText(
      'self + 10',
    )
    await templateParameter.getByTestId('numeric-expression-summary').click()
    await templateParameter.getByTestId('numeric-expression-source').fill('invalid(')
    await templateParameter.getByRole('button', { name: 'Validate t1 expression' }).click()
    await expect(templateParameter.getByTestId('numeric-expression-error')).toBeVisible()
    await expect(templateParameter.getByTestId('numeric-expression-summary')).toHaveCount(0)
    await templateParameter.getByTestId('numeric-expression-source').fill('self + 11')
    await templateParameter.getByRole('button', { name: 'Validate t1 expression' }).click()
    await expect(templateParameter.getByTestId('numeric-expression-source')).toHaveText(
      'self + 11',
    )
    expect(numericRequests.at(-1)).toEqual({
      expression: 'self + 11',
      target_type: 'Float64',
      placement: 'node',
    })

    await addNode(page, { x: 590, y: 245 })
    await addNode(page, { x: 760, y: 330 })
    const firstNode = page.locator('.node-marker').first()
    await firstNode.hover()
    await firstNode.locator('.connector.output')
      .dragTo(page.locator('.node-marker').nth(1))
    const edge = page.locator('.edge-list-item').first()
    await expect(edge).toBeVisible()
    await edge.click()
    const edgePanel = page.locator('#edgePanel')
    await edgePanel.locator('.add-protocol-btn').click()
    await page.locator('.p-menu-item-link', { hasText: 'EntanglerProt' }).click()
    await expect(edgePanel.locator('.protocol-editor', { hasText: 'EntanglerProt' }))
      .toBeVisible()
    const concreteTemplateRequests = numericRequests.slice(templateRequestsStart)
      .filter(request => request.expression === 'self + 11' && request.context)
    expect(concreteTemplateRequests.map(request => request.context.self)).toEqual([2, 3])

    await page.locator('.hamburger-btn').click()
    await page.getByRole('menuitem', { name: 'Save', exact: true }).click()
    const storedProject = await page.evaluate(name => {
      const stored = localStorage.getItem(`cqn_project_${name}`)
      if (stored === null) throw new Error(`Saved project is unavailable: ${name}`)
      return JSON.parse(stored)
    }, projectName)
    const clonedBackgrounds = storedProject.net.nodes
      .slice(1)
      .map(node => node.data.slots[0].backgroundNoise)
    // Catalog documentation remains editor metadata. Generated project values use
    // only the closed strict-v2 background-noise fields.
    expect(clonedBackgrounds).toEqual(Array(2).fill({
      type: 'T1Decay',
      parameters: [{
        field: 't1',
        type: 'Float64',
        selectedType: 'expression:Float64',
        value: {
          kind: 'numeric_expression',
          source: 'self + 11',
        },
      }],
    }))

    await page.reload()
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.node-marker')).toHaveCount(3)
    await page.locator('.node-marker').first().click()
    const reloadedSlot = page.locator('#nodePanel .slot-row-container').first()
    await reloadedSlot.getByRole('button', { name: 'Toggle details' }).click()
    const reloadedParameter = parameterRow(reloadedSlot, 't1')
    await expect(reloadedParameter.getByRole('combobox', { name: 'Variable for t1' }))
      .toHaveValue(variableId)
    await expect(reloadedParameter.getByTestId('linked-numeric-expression'))
      .toContainText('self + nodeid("Node 1")')

    await page.locator('.node-marker').nth(1).click()
    const reloadedTemplateSlot = page.locator('#nodePanel .slot-row-container').first()
    await reloadedTemplateSlot.getByRole('button', { name: 'Toggle details' }).click()
    const reloadedTemplateParameter = parameterRow(reloadedTemplateSlot, 't1')
    await expect(reloadedTemplateParameter.getByTestId('numeric-expression-summary'))
      .toBeVisible()
    await expect(reloadedTemplateParameter.getByTestId('numeric-expression-source'))
      .toHaveText('self + 11')
    await expect(reloadedTemplateParameter.getByTestId('numeric-expression-result'))
      .toContainText('13')

    const exportResponse = page.waitForResponse(
      response => response.url().endsWith('/export_script') && response.ok(),
    )
    await page.locator('#bottom-panel-export-script-tab').click()
    const exported = await (await exportResponse).json()
    expect(exported.success).toBe(true)
    expect(exported.script).toContain('node_indices = Dict')
    expect(exported.script).toContain('nodeid(name::String)')
    expect(exported.script).toContain('T1Decay')
    expect(exported.script).toContain('self + nodeid("Node 1")')
    expect(exported.script).toContain('self + 11')

    const duration = page.locator('#runnerPanel .run-duration-group .duration-input')
    await duration.fill('0.01')
    await duration.press('Tab')
    const parseRequest = page.waitForRequest(
      request => request.url().endsWith('/parse_network_graph'),
    )
    const parseResponse = page.waitForResponse(
      response => response.url().endsWith('/parse_network_graph'),
    )
    const runAccepted = page.waitForResponse(
      response => response.url().endsWith('/run_simulation') && response.status() === 202,
    )
    const runButton = page.locator('#runnerPanel .main-buttons .run-btn')
    await expect(runButton).toBeEnabled()
    await runButton.click()

    const simulationPayload = (await parseRequest).postDataJSON()
    expect(simulationPayload.net.nodes[0].data.slots[0].backgroundNoise).toEqual({
      type: 'T1Decay',
      parameters: [{
        name: 't1',
        type: 'Float64',
        value: { kind: 'variable', id: variableId },
      }],
    })
    expect((await parseResponse).status()).toBe(200)
    await runAccepted
    await expect(runButton).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('#runnerPanel .main-buttons .stop-btn')).toBeEnabled()
    await page.locator('#runnerPanel .main-buttons .stop-btn').click()
  })
})
