import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { canonicalErrorResponse } from './httpResponses.js'
import { backendPlatformInfo } from '../platformInfoFixtures.js'

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
  await page.route('**/slot_types', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { slot_types: ['Qubit', 'Qumode'] },
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
    json: backendPlatformInfo(),
  }))
}

async function loadApp(page) {
  await mockBackendMetadata(page)
  const protocolTypesLoaded = page.waitForResponse(
    response => response.url().endsWith('/protocol_types') && response.ok(),
  )
  await page.goto('/')
  await protocolTypesLoaded
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function updateProject(page, update) {
  await page.evaluate(projectUpdate => {
    const setupState = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const projectData = setupState?.projectData?.value ?? setupState?.projectData
    if (!projectData?.simulationConfig || !Array.isArray(projectData.variables)) {
      throw new Error('Reactive project data is unavailable')
    }

    projectData.name = projectUpdate.name ?? projectData.name
    projectData.simulationConfig.time = projectUpdate.time ?? projectData.simulationConfig.time
    projectData.simulationConfig.timeStep = projectUpdate.timeStep ?? projectData.simulationConfig.timeStep
    projectData.simulationConfig.qubitRepresentation = (
      projectUpdate.qubitRepresentation
      ?? projectData.simulationConfig.qubitRepresentation
    )
    projectData.simulationConfig.qumodeRepresentation = (
      projectUpdate.qumodeRepresentation
      ?? projectData.simulationConfig.qumodeRepresentation
    )
    if (projectUpdate.variable) projectData.variables.push(projectUpdate.variable)
  }, update)
}

test.describe('Export Script panel', () => {
  test('generates on first activation, refreshes explicitly, highlights, and downloads Julia source', async ({ page }) => {
    const requests = []
    let latestScript = ''
    await page.route('**/export_script', async route => {
      const payload = route.request().postDataJSON()
      requests.push(payload)
      if (requests.length === 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      latestScript = [
        'using QuantumSavory',
        '',
        `simulation_duration = ${payload.simulationConfig.time}`,
        'sim = Simulation()',
        'run(sim, simulation_duration)',
        '',
      ].join('\n')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          success: true,
          script: latestScript,
          filename: '../Unsafe Export?.jl',
        },
      })
    })
    await loadApp(page)
    await updateProject(page, {
      name: 'Export Demo',
      time: 2.5,
      timeStep: 0.25,
      qubitRepresentation: 'CliffordRepr',
      qumodeRepresentation: 'GabsRepr',
      variable: {
        id: 'variable-1',
        name: 'fidelity',
        type: 'Float64',
        value: 0.9,
        validationError: 'editor-only state',
      },
    })

    await expect.poll(() => requests.length).toBe(0)
    await page.locator('#bottom-panel-export-script-tab').click()
    const panel = page.locator('#bottom-panel-export-script-content')
    await expect(panel.getByRole('status')).toContainText('Generating Julia script')
    await expect.poll(() => requests.length).toBe(1)

    expect(requests[0].name).toBe('Export Demo')
    expect(requests[0].simulationConfig).toEqual({
      time: 2.5,
      timeStep: 0.25,
      qubitRepresentation: 'CliffordRepr',
      qumodeRepresentation: 'GabsRepr',
    })
    expect(requests[0].variables).toEqual([{
      id: 'variable-1',
      name: 'fidelity',
      type: 'Float64',
      value: 0.9,
    }])

    await expect(panel.getByRole('heading', { name: 'About this generated script' })).toBeVisible()
    await expect(panel).toContainText('The GUI simulator does not use this script')
    await expect(panel).toContainText('some GUI features might not be completely translated')
    await expect(panel).toContainText('full power of QuantumSavory.jl')
    await expect(panel).toContainText('programmatic interface')
    await expect(panel).toContainText('pedagogical onboarding')
    await expect(panel).toContainText(
      'UI automation makes some parts boilerplate-heavy; bespoke simulations can be simpler',
    )

    const code = panel.getByLabel('Generated Julia script')
    await expect(code).toContainText('using QuantumSavory')
    await expect(code.locator('.hljs-keyword')).toContainText('using')
    await expect(panel).toContainText('Unsafe_Export-.jl')

    const refreshButton = panel.getByRole('button', { name: 'Refresh' })
    await refreshButton.hover()
    await expect(refreshButton).toHaveCSS('background-color', 'rgb(67, 69, 172)')
    await expect(refreshButton).toHaveCSS('color', 'rgb(255, 255, 255)')

    await page.locator('#bottom-panel-logs-tab').click()
    await updateProject(page, { time: 4 })
    await page.locator('#bottom-panel-export-script-tab').click()
    await expect.poll(() => requests.length).toBe(1)

    await refreshButton.click()
    await expect.poll(() => requests.length).toBe(2)
    expect(requests[1].simulationConfig.time).toBe(4)
    await expect(code).toContainText('simulation_duration = 4')

    const downloadPromise = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Download .jl' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('Unsafe_Export-.jl')
    expect(await readFile(await download.path(), 'utf8')).toBe(latestScript)
  })

  test('shows a server error inline and retries successfully', async ({ page }) => {
    let requestCount = 0
    await page.route('**/export_script', route => {
      requestCount += 1
      if (requestCount === 1) {
        return route.fulfill(canonicalErrorResponse({
          code: 'VALIDATION_ERROR',
          message: 'Unsupported protocol at node 2.',
          status: 422,
          details: { node_id: '2' },
        }))
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          success: true,
          script: 'using QuantumSavory\nrun(Simulation(), 1.0)\n',
          filename: 'retry.jl',
        },
      })
    })
    await loadApp(page)

    await page.locator('#bottom-panel-export-script-tab').click()
    const panel = page.locator('#bottom-panel-export-script-content')
    await expect(panel.getByRole('alert')).toContainText('Unsupported protocol at node 2.')
    await expect(panel.getByLabel('Generated Julia script')).toHaveCount(0)
    await expect(panel.getByRole('button', { name: 'Download .jl' })).toBeDisabled()

    await panel.getByRole('button', { name: 'Retry' }).click()
    await expect(panel.getByLabel('Generated Julia script')).toContainText('run(Simulation(), 1.0)')
    await expect(panel.getByRole('button', { name: 'Download .jl' })).toBeEnabled()
    expect(requestCount).toBe(2)
  })
})
