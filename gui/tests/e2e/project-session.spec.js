import { expect, test } from '@playwright/test'

async function mockBackend(page, prepareRequests, { platformHandler } = {}) {
  await page.route('**/known_functions', route => route.fulfill({ json: { known_functions: [] } }))
  await page.route('**/background_types', route => route.fulfill({ json: { background_types: [] } }))
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
  await page.route('**/destroy_simulation', route => route.fulfill({ json: { success: true } }))
  await page.route('**/get_state?**', route => route.fulfill({
    status: 404,
    json: { success: false, error_code: 'NOT_FOUND', message: 'Simulation not found' }
  }))
  await page.route('**/logs/**', route => route.fulfill({ json: { success: true, logs: [] } }))
  await page.route('**/prepare_simulation', async route => {
    prepareRequests.push(route.request().postDataJSON())
    await route.fulfill({ json: { success: true, message: 'Prepared' } })
  })
}

async function seedProjects(page, names) {
  await page.addInitScript(projectNames => {
    for (const name of projectNames) {
      localStorage.setItem(`cqn_v2_project_${name}`, JSON.stringify({
        schemaVersion: 2,
        name,
        description: '',
        annotations: [],
        variables: [],
        simulationConfig: {
          time: 1,
          timeStep: 0.1,
          qubitRepresentation: 'QuantumOpticsRepr',
          qumodeRepresentation: 'QuantumOpticsRepr',
        },
        net: {
          nodes: [],
          edges: [],
          protocols: [],
          physicalConfig: {
            refractiveIndex: 1.5,
            lossDbPerKm: 0.2,
            nodeTemplate: { slots: [] },
          },
        },
        map: { position: [-98.5795, 39.8283], zoom: 4 },
      }))
    }
  }, names)
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
  await expect.poll(() => page.evaluate(() => (
    localStorage.getItem('cqn_v2_project_Delete Me')
  ))).toBeNull()
})

test('Save As keeps storage, document, reload, and simulation namespaces aligned', async ({ page }) => {
  const prepareRequests = []
  await mockBackend(page, prepareRequests)
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

  const stored = await page.evaluate(() => (
    JSON.parse(localStorage.getItem('cqn_v2_project_Project B'))
  ))
  expect(stored).toMatchObject({ schemaVersion: 2, name: 'Project B' })
  expect(stored.net.nodes).toHaveLength(2)
  expect(stored.net.physicalConfig).toEqual({
    refractiveIndex: 1.468,
    lossDbPerKm: 0.2,
    nodeTemplate: { slots: [] },
  })
  expect(stored.simulationConfig).toMatchObject({
    qubitRepresentation: 'CliffordRepr',
    qumodeRepresentation: 'GabsRepr',
  })

  await page.getByRole('button', { name: 'Prepare', exact: true }).click()
  await expect.poll(() => prepareRequests.length).toBe(1)
  expect(prepareRequests[0].name).toMatch(/_Project B$/)
  expect(prepareRequests[0].simulationConfig).toEqual({
    qubitRepresentation: 'CliffordRepr',
    qumodeRepresentation: 'GabsRepr',
  })
  expect(await page.evaluate(() => ({
    recent: localStorage.getItem('cqn_v2_recent_project_name'),
    physicalConfig: JSON.parse(
      localStorage.getItem('cqn_v2_project_Project B'),
    ).net.physicalConfig,
  }))).toEqual({
    recent: 'Project B',
    physicalConfig: stored.net.physicalConfig,
  })

  await page.reload()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.project-name-label')).toHaveText('Project B')
  await expect(page.locator('.node-marker')).toHaveCount(2)
  await page.getByRole('button', { name: 'Toggle advanced controls' }).click()
  await expect(page.getByLabel('Qubits')).toHaveValue('CliffordRepr')
  await expect(page.getByLabel('Qmodes')).toHaveValue('GabsRepr')

  const reloaded = await page.evaluate(() => ({
    recent: localStorage.getItem('cqn_v2_recent_project_name'),
    stored: JSON.parse(localStorage.getItem('cqn_v2_project_Project B'))
  }))
  expect(reloaded.recent).toBe('Project B')
  expect(reloaded.stored.name).toBe('Project B')
})

test('editing the project name renames its saved document in place', async ({ page }) => {
  await mockBackend(page, [])
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'New' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Project' })
  await dialog.getByPlaceholder('Project name').fill('Project A')
  await dialog.getByRole('button', { name: 'Create' }).click()

  await page.keyboard.down('Alt')
  await page.locator('canvas').first().click({ position: { x: 420, y: 280 } })
  await page.keyboard.up('Alt')
  await expect(page.locator('.node-marker')).toHaveCount(1)
  const nodeNameInput = page.locator('#node-name-input')
  await expect(nodeNameInput).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(nodeNameInput).toHaveCount(0)

  const collisionTarget = JSON.stringify({ sentinel: 'must not be overwritten' })
  const originalCreatedAt = await page.evaluate(target => {
    localStorage.setItem('cqn_v2_project_Existing Target', target)
    return JSON.parse(localStorage.getItem('cqn_v2_projects_metadata_index'))['Project A'].createdAt
  }, collisionTarget)

  const renameButton = page.getByRole('button', { name: 'Rename project Project A' })
  await renameButton.focus()
  await page.keyboard.press('Enter')
  const nameInput = page.getByRole('textbox', { name: 'Project name' })
  await expect(nameInput).toBeFocused()
  await expect(nameInput).toHaveValue('Project A')
  expect(await nameInput.evaluate(input => [input.selectionStart, input.selectionEnd])).toEqual([0, 9])

  await nameInput.fill('Canceled name')
  await page.keyboard.press('Escape')
  await expect(renameButton).toBeFocused()
  await expect(renameButton).toBeVisible()

  await renameButton.click()
  await nameInput.fill('Existing Target')
  await page.keyboard.press('Enter')
  const errorDialog = page.getByRole('dialog', { name: 'Project Error' })
  await expect(errorDialog).toContainText(
    'Failed to rename project: A project named "Existing Target" already exists'
  )
  await errorDialog.getByRole('button', { name: 'OK' }).click()
  await expect(nameInput).toBeFocused()

  await nameInput.fill('  Project B  ')
  await page.keyboard.press('Enter')
  const renamedButton = page.getByRole('button', { name: 'Rename project Project B' })
  await expect(renamedButton).toBeFocused()

  const renamed = await page.evaluate(() => ({
    oldProject: localStorage.getItem('cqn_v2_project_Project A'),
    project: JSON.parse(localStorage.getItem('cqn_v2_project_Project B')),
    collisionTarget: localStorage.getItem('cqn_v2_project_Existing Target'),
    recent: localStorage.getItem('cqn_v2_recent_project_name'),
    metadata: JSON.parse(localStorage.getItem('cqn_v2_projects_metadata_index')),
  }))
  expect(renamed.oldProject).toBeNull()
  expect(renamed.collisionTarget).toBe(collisionTarget)
  expect(renamed.project).toMatchObject({ name: 'Project B' })
  expect(renamed.project.net.nodes).toHaveLength(1)
  expect(renamed.recent).toBe('Project B')
  expect(renamed.metadata['Project A']).toBeUndefined()
  expect(renamed.metadata['Project B']).toMatchObject({
    createdAt: originalCreatedAt,
    nodeCount: 1,
  })

  await page.reload()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
  const reloadedRenameButton = page.getByRole('button', { name: 'Rename project Project B' })
  await expect(reloadedRenameButton).toBeVisible()
  await expect(page.locator('.node-marker')).toHaveCount(1)

  await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    app._instance.setupState.simulationState.phase = 'prepared'
  })
  await expect(reloadedRenameButton).toBeDisabled()
  await expect(reloadedRenameButton).toHaveAttribute(
    'title',
    'Reset or stop the simulation before renaming the project.'
  )
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
    localStorage.setItem('cqn_v2_project_Existing Target', target)
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
      recentName: localStorage.getItem('cqn_v2_recent_project_name'),
      target: localStorage.getItem('cqn_v2_project_Existing Target'),
    }
  })
  expect(afterRejectedSaveAs).toEqual({
    activeName: 'Active Project',
    activeDescription: 'unsaved active-session edit',
    recentName: 'Active Project',
    target: originalTarget,
  })
})

test('a late startup restore cannot replace a user-created session', async ({ page }) => {
  let releasePlatform
  let markPlatformRequested
  const platformReleased = new Promise(resolve => { releasePlatform = resolve })
  const platformRequested = new Promise(resolve => { markPlatformRequested = resolve })

  await page.addInitScript(() => {
    const oldProject = {
      schemaVersion: 2,
      name: 'Old Project',
      description: 'old snapshot',
      annotations: [],
      variables: [],
      simulationConfig: {
        time: 1,
        timeStep: 0.1,
        qubitRepresentation: 'QuantumOpticsRepr',
        qumodeRepresentation: 'QuantumOpticsRepr',
      },
      net: {
        nodes: [],
        edges: [],
        protocols: [],
        physicalConfig: {
          refractiveIndex: 1.5,
          lossDbPerKm: 0.2,
          nodeTemplate: { slots: [] },
        },
      },
      map: { position: [-98.5795, 39.8283], zoom: 4 },
    }
    localStorage.setItem('cqn_v2_project_Old Project', JSON.stringify(oldProject))
    localStorage.setItem('cqn_v2_recent_project_name', 'Old Project')
  })

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
  await page.evaluate(() => {
    const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
    setup.createNewProject('New Session')
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
