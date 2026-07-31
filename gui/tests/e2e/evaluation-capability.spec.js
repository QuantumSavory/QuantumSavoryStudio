import { test, expect } from '@playwright/test'
import { backendPlatformInfo } from '../platformInfoFixtures.js'

async function openEntanglerEditor(page, projectName) {
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  await page.goto('/')
  await protocolTypesLoaded
  await expect(page.locator('#app')).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.click('.hamburger-btn')
  await page.click('text=New')
  await page.fill('input[placeholder="Project name"]', projectName)
  await page.click('button.primary')

  await page.keyboard.down('Alt')
  await page.click('canvas', { position: { x: 400, y: 300 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(1)

  await page.keyboard.down('Alt')
  await page.click('canvas', { position: { x: 600, y: 400 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(2)

  const firstNode = page.locator('.node-marker').first()
  await firstNode.hover()
  await firstNode.locator('.connector.output').dragTo(page.locator('.node-marker').nth(1))
  await expect(page.locator('.edge-list-item')).toBeVisible()

  await page.locator('.edge-list-item').first().click()
  // main.spec.js owns real add-menu pointer coverage.
  // Keep this test focused on capability UI.
  await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const projectData = app?._instance?.setupState?.projectData
    const edge = projectData?.net?.edges?.[0]
    if (!edge) {
      throw new Error('Reactive edge state is unavailable')
    }
    edge.data.protocols.push({
      id: 'protocol_evaluation_capability',
      type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
      parameters: [{
        name: 'chooseslotA',
        type: ['Int64', 'Function'],
      }],
    })
  })

  const protocolEditor = page.locator('#edgePanel .protocol-editor', {
    hasText: 'EntanglerProt',
  })
  await expect(protocolEditor).toBeVisible()
  const protocolHeader = protocolEditor.locator('.protocol-list-type')
  await expect(protocolHeader.getByRole('button', { name: 'Show results' })).toBeVisible()
  await expect(protocolHeader.getByRole('button', { name: 'Delete protocol' })).toBeVisible()
  await protocolHeader.click()
  await expect(protocolEditor.locator('.protocol-container')).toBeVisible()
  await protocolHeader.click()
  await expect(protocolEditor.locator('.protocol-container')).toBeHidden()
  await protocolHeader.click()
  const functionTypeSelector = page.locator('#edgePanel .complexTypeSelector').filter({
    has: page.locator('option[value="Function"]'),
  }).first()
  await functionTypeSelector.selectOption('Lambda')
  return functionTypeSelector
}

async function setEvaluationCapability(page, enabled) {
  await page.route('**/known_functions', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { known_functions: ['identity'] },
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
    json: {
      protocol_types: [{
        type: 'QuantumSavory.ProtocolZoo.EntanglerProt',
        doc: 'Evaluation capability test protocol',
        group: 'edge',
        virtual: false,
        parameters: [{
          field: 'chooseslotA',
          type: ['Int64', 'Function'],
          doc: 'Choose a slot by integer, known function, or lambda.',
        }],
      }],
    },
  }))
  await page.route('**/platform_info', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: backendPlatformInfo({ unsafeCodeEvaluation: enabled }),
  }))
  await page.route('**/logs/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: true, logs: [], count: 0 },
  }))
}

test.describe('Unsafe evaluation capability', () => {
  test('keeps code validation available when the server enables it', async ({ page }) => {
    await setEvaluationCapability(page, true)
    await openEntanglerEditor(page, 'Evaluation Enabled')

    const editor = page.locator('#edgePanel .code-editor-with-symbols').first()
    await expect(editor).toBeVisible()
    await expect(editor.locator('textarea')).toBeVisible()
    await expect(editor.getByTestId('evaluation-disabled-notice')).toHaveCount(0)
    await expect(editor.locator('.validate-button')).toBeEnabled()
  })

  test('explains disabled evaluation while preserving known function selection', async ({ page }) => {
    await setEvaluationCapability(page, false)

    const functionTypeSelector = await openEntanglerEditor(page, 'Evaluation Disabled')

    const editor = page.locator('#edgePanel .code-editor-with-symbols').first()
    await expect(editor.locator('textarea')).toBeVisible()
    await expect(editor.getByTestId('evaluation-disabled-notice')).toContainText(
      'Server-side Julia evaluation is disabled',
    )
    await expect(editor.locator('.validate-button')).toBeDisabled()

    await functionTypeSelector.selectOption('Function')
    const knownFunctionSelector = page.locator('#edgePanel .functionSelector').first()
    await expect(knownFunctionSelector).toBeEnabled()
    await expect(knownFunctionSelector.locator('option[value="identity"]')).toBeEnabled()
  })
})
