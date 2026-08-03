import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const MOCK_PROTOCOL = 'WebQuantumSavory.MockBrokenProtocol'
const packageLockUrl = new URL('../../package-lock.json', import.meta.url)

async function importBrokenProject(page) {
  const demoUrl = new URL('../../src/demos/1.Entangler.Example.json', import.meta.url)
  const project = JSON.parse(await readFile(demoUrl, 'utf8'))
  project.name = 'Panic Diagnostic'
  project.simulationConfig = { ...project.simulationConfig, time: 1, timeStep: 0.1 }
  project.net.protocols = [{
    id: 'mock-broken-protocol',
    type: MOCK_PROTOCOL,
    parameters: [],
  }]

  await page.getByRole('button', { name: 'Menu' }).click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByText('Import', { exact: true }).click()
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: 'panic-diagnostic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  })

  const importedDialog = page.getByRole('dialog', { name: 'Project imported' })
  await expect(importedDialog).toBeVisible()
  await importedDialog.getByRole('button', { name: 'OK' }).click()
  await expect(page.locator('.project-name-label')).toContainText(project.name)
  return project
}

test('reports a diagnostic protocol panic without uploading the project', async ({ page, context }) => {
  const statePayloads = []
  const logPayloads = []
  const requestsAfterReport = []
  let reportStarted = false

  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:5173',
  })
  await page.addInitScript(() => {
    window.__panicIssueOpenCalls = []
    window.open = (url, target, features) => {
      const call = {
        url: String(url),
        target,
        features: features ?? null,
        openerCleared: false,
      }
      const popup = {}
      Object.defineProperty(popup, 'opener', {
        set(value) {
          call.openerCleared = value === null
        },
      })
      window.__panicIssueOpenCalls.push(call)
      return popup
    }
  })
  page.on('response', async response => {
    if (!response.ok()) return
    const pathname = new URL(response.url()).pathname
    if (pathname !== '/get_state' && !pathname.startsWith('/logs/')) return
    try {
      const payload = await response.json()
      if (pathname === '/get_state') statePayloads.push(payload)
      else logPayloads.push(payload)
    } catch {
      // The assertions below report a missing contract payload more clearly.
    }
  })
  page.on('request', request => {
    if (!reportStarted) return
    requestsAfterReport.push({
      url: request.url(),
      method: request.method(),
      postData: request.postData(),
    })
  })

  const protocolTypesResponse = page.waitForResponse(response => (
    response.url().endsWith('/protocol_types') && response.ok()
  ))
  const platformInfoResponse = page.waitForResponse(response => (
    response.url().endsWith('/platform_info') && response.ok()
  ))
  await page.goto('/')
  const protocolTypes = await (await protocolTypesResponse).json()
  const platformInfo = await (await platformInfoResponse).json()
  expect(protocolTypes.protocol_types.some(protocol => protocol.type === MOCK_PROTOCOL)).toBe(true)
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  const importedProject = await importBrokenProject(page)
  const parseResponse = page.waitForResponse(response => response.url().endsWith('/parse_network_graph'))
  const prepareResponse = page.waitForResponse(response => response.url().endsWith('/prepare_simulation'))
  const runResponse = page.waitForResponse(response => response.url().endsWith('/run_simulation'))

  const runButton = page.locator('#runnerPanel .main-buttons .run-btn')
  await expect(runButton).toBeEnabled()
  await runButton.click()
  expect((await parseResponse).status()).toBe(200)
  expect((await prepareResponse).status()).toBe(200)
  expect((await runResponse).status()).toBe(202)

  const panicDialog = page.getByRole('dialog', { name: 'Simulator panic' })
  await expect(panicDialog).toBeVisible({ timeout: 15_000 })
  await expect(panicDialog).toContainText('The simulator backend crashed')
  await expect(panicDialog).toContainText('BoundsError')
  await panicDialog.getByText('Complete stacktrace', { exact: true }).click()
  await expect(panicDialog.getByTestId('panic-stacktrace')).toBeVisible()
  await expect(panicDialog.getByTestId('panic-stacktrace')).toContainText('MockBrokenProtocol')

  const directBackend = await page.evaluate(async projectName => {
    const uuid = localStorage.getItem('user_uuid')
    const simulationName = `${uuid}_${projectName}`
    const stateQuery = new URLSearchParams({ name: simulationName })
    const [stateResponse, logsResponse] = await Promise.all([
      fetch(`http://localhost:8000/get_state?${stateQuery}`),
      fetch(`http://localhost:8000/logs/${encodeURIComponent(simulationName)}?purge=false`),
    ])
    return {
      state: await stateResponse.json(),
      logs: await logsResponse.json(),
    }
  }, importedProject.name)
  statePayloads.push(directBackend.state)
  logPayloads.push(directBackend.logs)

  await expect.poll(() => statePayloads
    .map(payload => payload?.state?.simulation?.simulation_panic)
    .find(Boolean) || null).not.toBeNull()
  await expect.poll(() => logPayloads
    .flatMap(payload => payload?.logs || [])
    .find(log => log.severity === 'panic') || null).not.toBeNull()
  const statePanic = statePayloads
    .map(payload => payload?.state?.simulation?.simulation_panic)
    .find(Boolean)
  const logPanic = logPayloads
    .flatMap(payload => payload?.logs || [])
    .find(log => log.severity === 'panic')
  expect(logPanic.id).toBe(statePanic.id)
  expect(logPanic.stacktrace).toContain('MockBrokenProtocol')

  const downloadPromise = page.waitForEvent('download')
  reportStarted = true
  await panicDialog.getByRole('button', { name: 'Report' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('Panic-Diagnostic-panic.json')
  const downloadedProject = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(downloadedProject.name).toBe(importedProject.name)
  expect(downloadedProject.net.protocols).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: MOCK_PROTOCOL }),
  ]))

  const copiedReport = await page.evaluate(() => navigator.clipboard.readText())
  expect(copiedReport).toContain('# WebQuantumSavory simulator panic report')
  expect(copiedReport).toContain('BoundsError')
  expect(copiedReport).toContain(`- WebQuantumSavory: ${platformInfo.versions.app}`)
  expect(copiedReport).toContain(`- QuantumSavory: ${platformInfo.versions.quantumsavory}`)
  expect(copiedReport).toContain(`- Julia: ${platformInfo.versions.julia}`)
  expect(copiedReport).toContain(`- Genie: ${platformInfo.versions.genie}`)
  expect(copiedReport).toContain(
    `- QuantumSavory tracked source: ${platformInfo.quantumsavory.tracked_source}`,
  )
  expect(copiedReport).toContain(
    `- QuantumSavory tracked revision: ${platformInfo.quantumsavory.tracked_revision}`,
  )
  expect(copiedReport).toContain(
    `- QuantumSavory Pkg tree hash: ${platformInfo.quantumsavory.tree_hash}`,
  )
  if (platformInfo.quantumsavory.commit) {
    expect(copiedReport).toContain(`- QuantumSavory commit: ${platformInfo.quantumsavory.commit}`)
  } else {
    expect(copiedReport).not.toContain('- QuantumSavory commit:')
  }

  const packageLock = JSON.parse(await readFile(packageLockUrl, 'utf8'))
  const dependencySections = [
    ['Frontend runtime dependencies', 'dependencies'],
    ['Frontend development dependencies', 'devDependencies'],
  ]
  for (const [section, lockGroup] of dependencySections) {
    expect(copiedReport).toContain(`### ${section}`)
    for (const name of Object.keys(packageLock.packages[''][lockGroup])) {
      const version = packageLock.packages[`node_modules/${name}`].version
      expect(copiedReport).toContain(`- ${name}: ${version}`)
    }
  }
  expect(copiedReport).toContain('## Reproduction')
  expect(requestsAfterReport.some(request => (
    request.method !== 'GET' && request.postData?.includes(MOCK_PROTOCOL)
  ))).toBe(false)

  await expect.poll(() => page.evaluate(() => window.__panicIssueOpenCalls)).toHaveLength(1)
  const [issueOpenCall] = await page.evaluate(() => window.__panicIssueOpenCalls)
  const issueUrl = new URL(issueOpenCall.url)
  expect(issueOpenCall.target).toBe('_blank')
  expect(issueOpenCall.features).toBeNull()
  expect(issueOpenCall.openerCleared).toBe(true)
  expect(`${issueUrl.origin}${issueUrl.pathname}`).toBe(
    'https://github.com/QuantumSavory/WebQuantumSavory/issues/new',
  )
  expect(issueUrl.searchParams.get('body')).toContain('attach the downloaded')
  expect(issueUrl.searchParams.get('body')).toContain('Panic-Diagnostic-panic.json')

  await panicDialog.getByRole('button', { name: 'Close', exact: true }).click()
  const panicLogs = page.locator('#logsPanel [aria-label="panic log from Simulator"]')
  await expect(panicLogs).toHaveCount(1)
  await expect(page.locator('#logsPanel [aria-label="error log from Simulator"]')).toHaveCount(0)
  const panicLog = panicLogs.first()
  await expect(panicLog).toBeVisible()

  const messageDisclosure = panicLog.getByRole('button', { name: /Show panic details/ })
  const rawDisclosure = panicLog.getByRole('button', { name: /Show raw JSON/ })
  await messageDisclosure.click()
  await expect(panicLog.getByLabel('Structured simulator details')).toBeVisible()
  await expect(panicLog.getByRole('heading', { name: 'Context' })).toBeVisible()
  await expect(panicLog.getByRole('heading', { name: 'Panic details' })).toBeVisible()
  await expect(panicLog.locator('.panic-exception-type')).toContainText('BoundsError')
  await expect(panicLog.locator('.panic-stacktrace')).toContainText('MockBrokenProtocol')
  await expect(panicLog.getByLabel('Raw log JSON')).toHaveCount(0)

  await rawDisclosure.click()
  await expect(panicLog.getByLabel('Structured simulator details')).toBeVisible()
  await expect(panicLog.getByLabel('Raw log JSON')).toBeVisible()

  await page.getByLabel('Search logs').fill('[100]')
  await expect(panicLog).toBeVisible()
})
