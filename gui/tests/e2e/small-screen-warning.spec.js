import { expect, test } from '@playwright/test'

async function mockBackend(page) {
  await page.route('http://localhost:8000/**', route => {
    const requestPath = new URL(route.request().url()).pathname
    const responses = {
      '/known_functions': { known_functions: [] },
      '/background_types': { background_types: [] },
      '/slot_types': { slot_types: ['Qubit', 'Qumode'] },
      '/protocol_types': { protocol_types: [] },
      '/states_zoo_types': { states_zoo_types: [] },
      '/platform_info': {
        versions: { julia: 'test', quantumsavory: 'test', app: 'test' },
        capabilities: { unsafe_code_evaluation: false },
      },
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: responses[requestPath] || { success: true, logs: [], count: 0 },
    })
  })
}

test.beforeEach(async ({ page }) => {
  await mockBackend(page)
})

test('warns on a phone-sized viewport and supports explicit dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const warning = page.getByRole('alertdialog', {
    name: 'WebQuantumSavory works best on a larger screen',
  })
  const continueButton = warning.getByRole('button', { name: 'Continue anyway' })

  await expect(warning).toBeVisible()
  await expect(warning.locator('.lucide-monitor-x')).toBeVisible()
  await expect(continueButton).toBeFocused()

  const bounds = await warning.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
  expect(bounds).toEqual({ x: 0, y: 0, width: 390, height: 844 })

  await continueButton.click()
  await expect(warning).toBeHidden()

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(warning).toBeHidden()
})

test('reacts to viewport changes and can be dismissed with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const warning = page.getByRole('alertdialog', {
    name: 'WebQuantumSavory works best on a larger screen',
  })
  await expect(warning).toBeHidden()

  await page.setViewportSize({ width: 899, height: 700 })
  await expect(warning).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(warning).toBeHidden()
})

test('warns on a short landscape viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 599 })
  await page.goto('/')

  await expect(page.getByRole('alertdialog', {
    name: 'WebQuantumSavory works best on a larger screen',
  })).toBeVisible()
})
