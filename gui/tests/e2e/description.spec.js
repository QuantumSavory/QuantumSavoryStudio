import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

const EMBEDDED_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlWlY4AAAAASUVORK5CYII='
const MARKDOWN_DESCRIPTION = `# Bell network

This description has **rendered Markdown** and inline math $x^2 + y^2$.

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

![Embedded pixel](${EMBEDDED_PNG})

![Blocked vector](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=)

<script>window.__descriptionXss = true</script>`

async function mockBackend(page) {
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
    json: {
      versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
      capabilities: { unsafe_code_evaluation: false },
    },
  }))
  await page.route('**/destroy_simulation', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: true },
  }))
  await page.route('**/get_state?**', route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    json: { success: false, message: 'Simulation not found' },
  }))
}

async function loadApp(page) {
  await mockBackend(page)
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

test.describe('Project description', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page)
  })

  test('edits from rendered mode and safely renders Markdown, math, and data images', async ({ page }) => {
    await page.evaluate(() => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      setup.createNewProject('Description Markdown Test')
    })

    await page.getByRole('tab', { name: 'Description' }).click()
    const panel = page.getByTestId('description-panel')
    const editButton = panel.getByRole('button', { name: 'Edit project description' })

    await expect(panel).toContainText('No description yet.')
    await expect(panel.locator('textarea')).toHaveCount(0)
    await expect(editButton.locator('svg.lucide-pencil-line')).toHaveCount(1)

    await editButton.click()
    const editor = panel.getByRole('textbox', { name: 'Project description in Markdown' })
    await expect(editor).toBeFocused()
    await editor.fill('This change should be discarded.')
    const cancelButton = panel.getByRole('button', { name: 'Cancel description editing' })
    await expect(cancelButton.locator('svg.lucide-x')).toHaveCount(1)
    await cancelButton.click()
    await expect(panel).toContainText('No description yet.')

    await editButton.click()
    await editor.fill(MARKDOWN_DESCRIPTION)
    const saveButton = panel.getByRole('button', { name: 'Save project description' })
    await expect(saveButton.locator('svg.lucide-save')).toHaveCount(1)
    await saveButton.click()

    const rendered = panel.getByTestId('markdown-rendered')
    await expect(rendered.getByRole('heading', { name: 'Bell network' })).toBeVisible()
    await expect(rendered.locator('strong')).toHaveText('rendered Markdown')
    await expect(rendered.locator('.katex')).toHaveCount(2)
    await expect(rendered.locator('.katex-display')).toBeVisible()

    const embeddedImage = rendered.getByRole('img', { name: 'Embedded pixel' })
    await expect(embeddedImage).toHaveAttribute('src', EMBEDDED_PNG)
    await expect.poll(() => embeddedImage.evaluate(image => image.complete && image.naturalWidth === 1)).toBe(true)
    await expect(rendered.getByRole('img', { name: 'Blocked vector' })).toHaveCount(0)

    await expect(rendered.locator('script')).toHaveCount(0)
    await expect(rendered).toContainText('<script>window.__descriptionXss = true</script>')
    await expect.poll(() => page.evaluate(() => window.__descriptionXss)).toBeUndefined()
  })

  test('pastes a clipboard image at the selection and renders the generated Markdown', async ({ page }) => {
    await page.evaluate(() => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      setup.createNewProject('Description Image Paste Test')
    })

    await page.getByRole('tab', { name: 'Description' }).click()
    const panel = page.getByTestId('description-panel')
    await panel.getByRole('button', { name: 'Edit project description' }).click()

    const editor = panel.getByRole('textbox', { name: 'Project description in Markdown' })
    await editor.fill('Before selected after')
    await editor.evaluate(textarea => textarea.setSelectionRange(7, 15))

    const pasteWasPrevented = await editor.evaluate((textarea, dataUrl) => {
      const [, base64] = dataUrl.split(',')
      const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))
      const clipboard = new DataTransfer()
      clipboard.items.add(new File([bytes], 'pixel.png', { type: 'image/png' }))
      const event = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      })
      textarea.dispatchEvent(event)
      return event.defaultPrevented
    }, EMBEDDED_PNG)

    expect(pasteWasPrevented).toBe(true)
    const expectedMarkdown = `Before ![Pasted image](${EMBEDDED_PNG}) after`
    await expect(editor).toHaveValue(expectedMarkdown)
    await panel.getByRole('button', { name: 'Save project description' }).click()

    const pastedImage = panel.getByRole('img', { name: 'Pasted image' })
    await expect(pastedImage).toHaveAttribute('src', EMBEDDED_PNG)
    await expect.poll(() => pastedImage.evaluate(image => image.complete && image.naturalWidth === 1)).toBe(true)
  })

  test('persists only in canonical saved, exported, and imported v2 JSON', async ({ page }) => {
    const defaults = await page.evaluate(() => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      const initialDescription = setup.projectData.description
      setup.createNewProject('Description Persistence Test')
      const newDescription = setup.projectData.description
      let legacyError
      try {
        setup.deserializeProjectData({
          name: 'Legacy Project',
          variables: [],
          simulationConfig: { time: 1, timeStep: 0.1 },
          net: { nodes: [], edges: [], protocols: [] },
        })
      } catch (error) {
        legacyError = {
          code: error.code,
          contract: error.details?.contract,
          supportedVersions: error.details?.supported_versions,
        }
      }
      return { initialDescription, newDescription, legacyError }
    })
    expect(defaults).toEqual({
      initialDescription: '',
      newDescription: '',
      legacyError: {
        code: 'UNSUPPORTED_VERSION',
        contract: 'project',
        supportedVersions: [2],
      },
    })

    await page.getByRole('tab', { name: 'Description' }).click()
    const panel = page.getByTestId('description-panel')
    await panel.getByRole('button', { name: 'Edit project description' }).click()
    await panel.getByRole('textbox', { name: 'Project description in Markdown' }).fill(MARKDOWN_DESCRIPTION)
    await panel.getByRole('button', { name: 'Save project description' }).click()

    const serialized = await page.evaluate(() => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      setup.saveProject()
      const full = setup.serializeProjectData()
      const minimized = setup.minimizedProjectData?.value ?? setup.minimizedProjectData
      const saved = JSON.parse(localStorage.getItem('cqn_project_Description Persistence Test'))
      return {
        live: setup.projectData.description,
        fullDescription: full.description,
        savedDescription: saved.description,
        minimizedHasDescription: Object.hasOwn(minimized, 'description'),
      }
    })
    expect(serialized).toEqual({
      live: MARKDOWN_DESCRIPTION,
      fullDescription: MARKDOWN_DESCRIPTION,
      savedDescription: MARKDOWN_DESCRIPTION,
      minimizedHasDescription: false,
    })

    const downloadPromise = page.waitForEvent('download')
    await page.evaluate(() => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      setup.exportProject()
    })
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('Description Persistence Test.json')
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
    expect(exported.description).toBe(MARKDOWN_DESCRIPTION)

    const importTemplate = await page.evaluate(() => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      return setup.serializeProjectData()
    })
    const invalidImport = {
      ...importTemplate,
      name: 'Invalid Description Import',
      description: ['not', 'a', 'string'],
    }
    await page.evaluate(project => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      setup.validateAndProcessImport(project)
    }, invalidImport)
    let appDialog = page.getByRole('dialog', { name: 'Import failed' })
    await expect(appDialog).toContainText('Invalid project document at /description')
    await appDialog.getByRole('button', { name: 'OK' }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cqn_project_Invalid Description Import'))).toBeNull()

    const importedDescription = '# Imported\n\nWith $a+b$.'
    await page.evaluate(({ project, description }) => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      setup.validateAndProcessImport({
        ...project,
        name: 'Imported Description Project',
        description,
      })
    }, { project: importTemplate, description: importedDescription })
    appDialog = page.getByRole('dialog', { name: 'Project imported' })
    await expect(appDialog).toContainText('Project "Imported Description Project" imported successfully!')
    await appDialog.getByRole('button', { name: 'OK' }).click()

    await expect.poll(() => page.evaluate(() => {
      const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState
      return setup.projectData.description
    })).toBe(importedDescription)
    await expect.poll(() => page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('cqn_project_Imported Description Project'))
      return stored.description
    })).toBe(importedDescription)
  })
})
