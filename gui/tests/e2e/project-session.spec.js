import { expect, test } from '@playwright/test'
import { simulationNotFoundResponse } from './httpResponses.js'

async function mockBackend(page, parseRequests, {
  platformHandler,
  destroyRequests = []
} = {}) {
  await page.route('**/known_functions', route => route.fulfill({ json: { known_functions: [] } }))
  await page.route('**/background_types', route => route.fulfill({ json: { background_types: [] } }))
  await page.route('**/slot_types', route => route.fulfill({
    json: { slot_types: ['Qubit', 'Qumode'] },
  }))
  await page.route('**/protocol_types', route => route.fulfill({ json: { protocol_types: [] } }))
  await page.route('**/states_zoo_types', route => route.fulfill({ json: { states_zoo_types: [] } }))
  await page.route('**/platform_info', route => {
    if (platformHandler) return platformHandler(route)
    return route.fulfill({
      json: {
        versions: { julia: '1.12', quantumsavory: '0.7', app: '1.6' },
        capabilities: { unsafe_code_evaluation: false }
      }
    })
  })
  await page.route('**/destroy_simulation', async route => {
    destroyRequests.push(route.request().postDataJSON())
    await route.fulfill({ json: { success: true } })
  })
  await page.route('**/get_state?**', route => route.fulfill(
    simulationNotFoundResponse(),
  ))
  await page.route('**/logs/**', route => route.fulfill({ json: { success: true, logs: [] } }))
  await page.route('**/parse_network_graph', async route => {
    parseRequests.push(route.request().postDataJSON())
    await route.fulfill({ json: { success: true, message: 'Parsed' } })
  })
}

function projectDocument(name, {
  schemaVersion = 2,
  description = '',
  platformInfo
} = {}) {
  return {
    schemaVersion,
    name,
    description,
    annotations: [],
    variables: [],
    simulationConfig: {
      time: 1,
      timeStep: 0.1,
      qubitRepresentation: 'QuantumOpticsRepr',
      qumodeRepresentation: 'QuantumOpticsRepr'
    },
    ...(platformInfo ? { platformInfo } : {}),
    net: {
      nodes: [],
      edges: [],
      protocols: [],
      physicalConfig: {
        refractiveIndex: 1.468,
        lossDbPerKm: 0.2,
        nodeTemplate: { slots: [] }
      }
    },
    uiGlobal: { map: { position: [-98.5795, 39.8283], zoom: 4 } }
  }
}

async function seedProjects(page, names) {
  const documents = names.map(name => projectDocument(name))
  await page.addInitScript(projects => {
    for (const project of projects) {
      localStorage.setItem(`cqn_project_${project.name}`, JSON.stringify(project))
    }
  }, documents)
}

async function startSetupCall(page, method, args = []) {
  await page.evaluate(({ methodName, callArgs }) => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    globalThis.__pendingProjectSessionCall = setup[methodName](...callArgs)
  }, { methodName: method, callArgs: args })
}

async function finishSetupCall(page) {
  return page.evaluate(() => globalThis.__pendingProjectSessionCall)
}

test('confirmed deletion immediately refreshes the open-project list', async ({ page }) => {
  await mockBackend(page, [])
  await seedProjects(page, ['Keep Me', 'Delete Me'])
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Open' }).click()
  const openDialog = page.getByRole('dialog', { name: 'Open Project' })
  const deleteRow = openDialog.getByRole('row').filter({ hasText: 'Delete Me' })
  await expect(deleteRow).toBeVisible()

  await deleteRow.getByRole('button', { name: 'Delete project' }).click()
  let confirmDialog = page.getByRole('dialog', { name: 'Delete project' })
  await confirmDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(deleteRow).toBeVisible()

  await deleteRow.getByRole('button', { name: 'Delete project' }).click()
  confirmDialog = page.getByRole('dialog', { name: 'Delete project' })
  await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(openDialog).toBeVisible()
  await expect(openDialog.getByText('Delete Me', { exact: true })).toHaveCount(0)
  await expect(openDialog.getByText('Keep Me', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cqn_project_Delete Me'))).toBeNull()
})

test('Save As keeps storage, document, reload, and simulation namespaces aligned', async ({ page }) => {
  const parseRequests = []
  await mockBackend(page, parseRequests)
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.locator('.hamburger-btn').click()
  await page.getByRole('menuitem', { name: 'New' }).click()
  let dialog = page.getByRole('dialog', { name: 'New Project' })
  await dialog.getByPlaceholder('Project name').fill('Project A')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('.project-name-label')).toHaveText('Project A')

  await page.keyboard.down('Alt')
  await page.locator('canvas').first().click({ position: { x: 420, y: 280 } })
  await page.locator('canvas').first().click({ position: { x: 620, y: 380 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(2)
  const firstNode = page.locator('.node-marker').first()
  await firstNode.hover()
  await firstNode.locator('.connector.output').dragTo(page.locator('.node-marker').nth(1))
  await expect(page.locator('.edge-list-item')).toHaveCount(1)
  await page.evaluate(() => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    setup.projectData.net.nodes.forEach(node => node.createNewSlot())
  })
  await page.getByRole('button', { name: 'Toggle advanced controls' }).click()
  await page.getByLabel('Qubits').selectOption('CliffordRepr')
  await page.getByLabel('Qmodes').selectOption('GabsRepr')

  await page.locator('.hamburger-btn').click()
  await page.getByRole('menuitem', { name: 'Save As' }).click()
  dialog = page.getByRole('dialog', { name: 'Save As' })
  await dialog.getByPlaceholder('Project name').fill('Project B')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.project-name-label')).toHaveText('Project B')

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cqn_project_Project B')))
  expect(stored).toMatchObject({ schemaVersion: 2, name: 'Project B' })
  expect(stored.net.nodes).toHaveLength(2)
  expect(stored.simulationConfig).toMatchObject({
    qubitRepresentation: 'CliffordRepr',
    qumodeRepresentation: 'GabsRepr',
  })

  await page.getByRole('button', { name: 'Parse', exact: true }).click()
  await expect.poll(() => parseRequests.length).toBe(1)
  expect(parseRequests[0].name).toMatch(/_Project B$/)
  expect(parseRequests[0].simulationConfig).toEqual({
    qubitRepresentation: 'CliffordRepr',
    qumodeRepresentation: 'GabsRepr',
  })

  await page.reload()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.project-name-label')).toHaveText('Project B')
  await expect(page.locator('.node-marker')).toHaveCount(2)
  await page.getByRole('button', { name: 'Toggle advanced controls' }).click()
  await expect(page.getByLabel('Qubits')).toHaveValue('CliffordRepr')
  await expect(page.getByLabel('Qmodes')).toHaveValue('GabsRepr')

  const reloaded = await page.evaluate(() => ({
    recent: localStorage.getItem('recentProjectName'),
    stored: JSON.parse(localStorage.getItem('cqn_project_Project B'))
  }))
  expect(reloaded.recent).toBe('Project B')
  expect(reloaded.stored.name).toBe('Project B')
})

test('Save As refuses to overwrite a different existing project', async ({ page }) => {
  await mockBackend(page, [])
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'New' }).click()
  const newProjectDialog = page.getByRole('dialog', { name: 'New Project' })
  await newProjectDialog.getByPlaceholder('Project name').fill('Active Project')
  await newProjectDialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('.project-name-label')).toHaveText('Active Project')

  const originalTarget = JSON.stringify({ sentinel: 'must not be overwritten' })
  await page.evaluate(({ target }) => {
    localStorage.setItem('cqn_project_Existing Target', target)
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    setup.projectData.description = 'unsaved active-session edit'
  }, { target: originalTarget })

  const saved = await page.evaluate(() => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    return setup.createSaveAsProject('Existing Target')
  })
  expect(saved).toBe(false)

  const errorDialog = page.getByRole('dialog', { name: 'Project Error' })
  await expect(errorDialog).toContainText(
    'Failed to save project: A project named "Existing Target" already exists'
  )
  await expect(page.locator('.project-name-label')).toHaveText('Active Project')

  const afterRejectedSaveAs = await page.evaluate(() => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    return {
      activeName: setup.projectData.name,
      activeDescription: setup.projectData.description,
      recentName: localStorage.getItem('recentProjectName'),
      target: localStorage.getItem('cqn_project_Existing Target'),
    }
  })
  expect(afterRejectedSaveAs).toEqual({
    activeName: 'Active Project',
    activeDescription: 'unsaved active-session edit',
    recentName: 'Active Project',
    target: originalTarget,
  })
})

test('invalid browser imports preserve their source, active work, and storage', async ({ page }) => {
  const destroyRequests = []
  await mockBackend(page, [], { destroyRequests })
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  const result = await page.evaluate(async () => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    await setup.createNewProject('Active Project')
    setup.projectData.description = 'unsaved active-session edit'

    const imported = setup.serializeProjectData()
    imported.name = 'Rejected Project'
    imported.unexpected = { nested: true }
    const sourceBefore = JSON.stringify(imported)
    const admitted = await setup.validateAndProcessImport(imported)

    return {
      admitted,
      sourceBefore,
      sourceAfter: JSON.stringify(imported),
      activeName: setup.projectData.name,
      activeDescription: setup.projectData.description,
      recentName: localStorage.getItem('recentProjectName'),
      rejectedStored: localStorage.getItem('cqn_project_Rejected Project'),
    }
  })

  const errorDialog = page.getByRole('dialog', { name: 'Import failed' })
  await expect(errorDialog).toContainText(
    'Project schema validation failed at /unexpected: expected declared field',
  )
  expect(result.sourceAfter).toBe(result.sourceBefore)
  expect(result).toMatchObject({
    admitted: false,
    activeName: 'Active Project',
    activeDescription: 'unsaved active-session edit',
    recentName: 'Active Project',
    rejectedStored: null,
  })
  expect(destroyRequests).toEqual([])
})

test('invalid replacement classes preserve the populated active session', async ({ page }) => {
  const destroyRequests = []
  const invalidDocument = projectDocument('Invalid Candidate', { schemaVersion: 1 })
  const invalidRaw = JSON.stringify(invalidDocument)
  await page.addInitScript(({ raw }) => {
    localStorage.setItem('cqn_project_Invalid Saved', raw)
  }, { raw: invalidRaw })
  await mockBackend(page, [], { destroyRequests })
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  expect(await page.evaluate(async () => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const created = await setup.createNewProject('Active Project')
    setup.projectData.description = 'unsaved active work'
    return created
  })).toBe(true)

  const attempts = [
    ['openProject', ['Invalid Saved'], /schema validation.*schemaVersion/i],
    ['importProjectIntoSession', [invalidDocument, 'Imported Candidate'], /schema validation.*schemaVersion/i],
    ['loadDemoProject', [invalidDocument], /schema validation.*schemaVersion/i],
    ['createNewProject', ['   '], /Project name cannot be empty/i]
  ]
  for (const [method, args, expectedError] of attempts) {
    await startSetupCall(page, method, args)
    const errorDialog = page.getByRole('dialog', { name: 'Project Error' })
    await expect(errorDialog).toContainText(expectedError)
    expect(await finishSetupCall(page)).toBe(false)
    await errorDialog.getByRole('button', { name: 'OK' }).click()
  }

  const state = await page.evaluate(() => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    return {
      activeName: setup.currentProjectName,
      activeDescription: setup.projectData.description,
      recent: localStorage.getItem('recentProjectName'),
      invalidSaved: localStorage.getItem('cqn_project_Invalid Saved'),
      imported: localStorage.getItem('cqn_project_Imported Candidate'),
      demo: localStorage.getItem('cqn_project_Invalid Candidate')
    }
  })
  expect(state).toEqual({
    activeName: 'Active Project',
    activeDescription: 'unsaved active work',
    recent: 'Active Project',
    invalidSaved: invalidRaw,
    imported: null,
    demo: null
  })
  expect(destroyRequests).toEqual([])
})

test('failed bootstrap restore clears only its stale recent pointer', async ({ page }) => {
  const destroyRequests = []
  const invalidDocument = projectDocument('Broken Recent', {
    schemaVersion: 1,
    description: 'stored bytes must survive'
  })
  const invalidRaw = JSON.stringify(invalidDocument)
  await page.addInitScript(({ raw }) => {
    localStorage.setItem('cqn_project_Broken Recent', raw)
    localStorage.setItem('recentProjectName', 'Broken Recent')
  }, { raw: invalidRaw })
  await mockBackend(page, [], { destroyRequests })

  await page.goto('/')
  const errorDialog = page.getByRole('dialog', { name: 'Project Error' })
  await expect(errorDialog).toContainText(/schema validation.*schemaVersion/i)

  const state = await page.evaluate(() => ({
    recent: localStorage.getItem('recentProjectName'),
    stored: localStorage.getItem('cqn_project_Broken Recent'),
    activeName: document.querySelector('#app')?.__vue_app__?._instance?.setupState
      ?.currentProjectName
  }))
  expect(state.recent).toBeNull()
  expect(state.stored).toBe(invalidRaw)
  expect(state.activeName).not.toBe('Broken Recent')
  expect(destroyRequests).toEqual([])
})

test('a superseded delayed open cannot affect a newer created project', async ({ page }) => {
  const destroyRequests = []
  const delayedDocument = projectDocument('Delayed Project', {
    description: 'stored candidate',
    platformInfo: {
      versions: { julia: '2.0', genie: '5.0', quantumSavory: '0.7', app: '1.6' }
    }
  })
  const delayedRaw = JSON.stringify(delayedDocument)
  await page.addInitScript(({ raw }) => {
    localStorage.setItem('cqn_project_Delayed Project', raw)
  }, { raw: delayedRaw })
  await mockBackend(page, [], { destroyRequests })
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.evaluate(() => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    globalThis.__pendingDelayedOpen = setup.openProject('Delayed Project')
  })
  const mismatchDialog = page.getByRole('dialog', { name: 'Project version mismatch' })
  await expect(mismatchDialog).toBeVisible()

  expect(await page.evaluate(async () => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    const created = await setup.createNewProject('User Project')
    setup.projectData.description = 'unsaved work in the winning session'
    return created
  })).toBe(true)
  await expect(page.locator('.project-name-label')).toHaveText('User Project')

  await mismatchDialog.getByRole('button', { name: 'Open project' }).click()
  expect(await page.evaluate(() => globalThis.__pendingDelayedOpen)).toBe(false)

  const state = await page.evaluate(() => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    return {
      activeName: setup.currentProjectName,
      activeDescription: setup.projectData.description,
      recent: localStorage.getItem('recentProjectName'),
      delayed: localStorage.getItem('cqn_project_Delayed Project'),
      created: JSON.parse(localStorage.getItem('cqn_project_User Project'))
    }
  })
  expect(state).toMatchObject({
    activeName: 'User Project',
    activeDescription: 'unsaved work in the winning session',
    recent: 'User Project',
    delayed: delayedRaw,
    created: { schemaVersion: 2, name: 'User Project' }
  })
  expect(destroyRequests).toEqual([])
})

test('a late startup restore cannot replace a user-created session', async ({ page }) => {
  let releasePlatform
  let markPlatformRequested
  const platformReleased = new Promise(resolve => { releasePlatform = resolve })
  const platformRequested = new Promise(resolve => { markPlatformRequested = resolve })

  const oldProject = projectDocument('Old Project', { description: 'old snapshot' })
  await page.addInitScript(project => {
    localStorage.setItem('cqn_project_Old Project', JSON.stringify(project))
    localStorage.setItem('recentProjectName', 'Old Project')
  }, oldProject)

  await mockBackend(page, [], {
    platformHandler: async route => {
      markPlatformRequested()
      await platformReleased
      await route.fulfill({
        json: {
          versions: { julia: '1.12', quantumsavory: '0.7', app: '1.6' },
          capabilities: { unsafe_code_evaluation: false }
        }
      })
    }
  })

  await page.goto('/')
  await platformRequested
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
  const loadingIndicator = page.locator('.topbar-loading-indicator')
  await expect(loadingIndicator).toBeVisible()
  await expect(loadingIndicator).toContainText('Loading application metadata')
  await page.evaluate(async () => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    await setup.createNewProject('New Session')
    setup.projectData.description = 'unsaved edit made during startup'
  })

  const platformResponse = page.waitForResponse(response => response.url().endsWith('/platform_info'))
  releasePlatform()
  await platformResponse
  await expect(page.locator('.project-name-label')).toHaveText('New Session')
  await expect(loadingIndicator).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    return setup.projectData.description
  })).toBe('unsaved edit made during startup')
})
