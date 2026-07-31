import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { backendPlatformInfo } from '../platformInfoFixtures.js'
import { SLOT_TYPE_CATALOG } from '../catalogFixtures.js'

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return /\.(?:css|js|vue)$/.test(entry.name) ? [entryPath] : []
  })
}

async function mockBackend(page) {
  await page.route('http://localhost:8000/**', route => {
    const requestPath = new URL(route.request().url()).pathname
    const responses = {
      '/known_functions': { known_functions: [] },
      '/background_types': { background_types: [] },
      '/slot_types': { slot_types: SLOT_TYPE_CATALOG },
      '/protocol_types': { protocol_types: [] },
      '/states_zoo_types': { states_zoo_types: [] },
      '/platform_info': backendPlatformInfo(),
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: responses[requestPath] || { success: true, logs: [], count: 0 },
    })
  })
}

test('source uses the official Lucide package without legacy icon markup', async () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
  expect(packageJson.dependencies['@lucide/vue']).toBeTruthy()
  expect(packageJson.dependencies.primeicons).toBeUndefined()
  expect(packageJson.dependencies['lucide-vue-next']).toBeUndefined()

  const files = sourceFiles(path.resolve('src'))
  const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
  expect(source).not.toMatch(/primeicons|\bpi pi-|<i\b/)
  expect(source).not.toMatch(/>\s*[+×⋮▶▼]\s*(?:Add|<)/)

  const rawSvgComponents = files
    .filter(file => file.endsWith('.vue'))
    .filter(file => fs.readFileSync(file, 'utf8').includes('<svg'))
    .map(file => path.basename(file))
  expect(rawSvgComponents).toEqual(['StateConnectionOverlay.vue'])
})

test('renders Lucide artwork across application and third-party controls', async ({ page }) => {
  await mockBackend(page)
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('cqn_project_Icon Fixture', JSON.stringify({
      name: 'Icon Fixture',
      variables: [],
      simulationConfig: { time: 1, timeStep: 0.1 },
      net: { nodes: [], edges: [], protocols: [] },
    }))
    localStorage.setItem('cqn_projects_metadata_index', JSON.stringify({
      'Icon Fixture': {
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        openedAt: '2026-01-03T00:00:00.000Z',
        nodeCount: 0,
        edgeCount: 0,
        slotCount: 0,
        protocolCount: 0,
      },
    }))
  })

  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })

  await expect(page.getByRole('button', { name: 'Menu' }).locator('.lucide-menu')).toBeVisible()
  for (const selector of [
    '.maplibregl-ctrl-zoom-in',
    '.maplibregl-ctrl-zoom-out',
    '.maplibregl-ctrl-compass',
  ]) {
    const mapControlIcon = page.locator(`${selector} .maplibregl-ctrl-icon`)
    await expect(mapControlIcon).toBeVisible()
    await expect(mapControlIcon.locator('.lucide')).toHaveCount(0)
    await expect(mapControlIcon).not.toHaveCSS('background-image', 'none')
  }
  await expect(page.locator('.settings-toggle-btn .lucide-settings-2')).toBeVisible()
  await expect(page.locator('.stop-btn .lucide-square')).toBeVisible()

  await page.getByRole('tab', { name: 'Layout Tools' }).click()
  await expect(page.getByRole('button', { name: 'Repeater Chain Generator' }).locator('.lucide-waypoints')).toBeVisible()

  await page.getByRole('button', { name: 'Menu' }).click()
  const mainMenu = page.getByRole('menubar')
  await expect(mainMenu.locator('.lucide-file-plus-corner')).toBeVisible()
  await expect(mainMenu.locator('.lucide-folder-open')).toBeVisible()
  await expect(mainMenu.locator('.lucide-library')).toBeVisible()
  await expect(mainMenu.locator('.lucide-chevron-right')).toBeVisible()
  await mainMenu.getByRole('menuitem', { name: 'Open' }).click()

  const openDialog = page.getByRole('heading', { name: 'Open Project' }).locator('..').locator('..')
  await expect(openDialog).toBeVisible()
  await expect(openDialog.locator('.lucide-arrow-down-wide-narrow')).toHaveCount(1)
  await expect(openDialog.locator('.lucide-arrow-up-down')).toHaveCount(6)
  await expect(openDialog.locator('.lucide-trash-2')).toBeVisible()
  await openDialog.getByText('Project Name', { exact: true }).click()
  await expect(openDialog.locator('.lucide-arrow-up-narrow-wide')).toHaveCount(1)
  await openDialog.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'JSON Viewer' }).click()
  const jsonViewer = page.locator('.json-viewer-box')
  await expect(jsonViewer.locator('.jv-button .lucide-copy')).toBeVisible()
  await expect(jsonViewer.locator('.jv-toggle').first()).toHaveCSS('background-image', 'none')
  const disclosureMask = await jsonViewer.locator('.jv-toggle').first().evaluate(element => (
    getComputedStyle(element).maskImage || getComputedStyle(element).webkitMaskImage
  ))
  expect(disclosureMask).toContain('svg')

  await expect(page.locator('.pi')).toHaveCount(0)
  await expect(page.locator('svg:not(.lucide)')).toHaveCount(0)
})
