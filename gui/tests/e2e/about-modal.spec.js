import { test, expect } from '@playwright/test'

test('About describes the project, its support, and ways to participate', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'About' }).click()

  const dialog = page.getByRole('dialog', { name: 'About WebQuantumSavory Simulation Builder' })
  await expect(dialog).toBeVisible()

  await expect(dialog.getByRole('link', { name: 'QuantumSavory', exact: true })).toHaveAttribute(
    'href',
    'https://quantumsavory.org/'
  )
  await expect(dialog.getByRole('link', { name: 'Julia', exact: true })).toHaveAttribute(
    'href',
    'https://julialang.org/'
  )
  await expect(dialog.getByRole('link', { name: 'Genie' })).toHaveAttribute(
    'href',
    'https://genieframework.com/'
  )
  await expect(dialog.getByRole('link', { name: 'Vue', exact: true })).toHaveAttribute(
    'href',
    'https://vuejs.org/'
  )
  await expect(dialog.getByRole('link', { name: 'Vite' })).toHaveAttribute('href', 'https://vite.dev/')
  await expect(dialog.getByRole('link', { name: 'PrimeVue' })).toHaveAttribute(
    'href',
    'https://primevue.org/'
  )
  await expect(dialog.getByRole('link', { name: 'MapLibre GL JS' })).toHaveAttribute(
    'href',
    'https://maplibre.org/maplibre-gl-js/docs/'
  )

  await expect(dialog.getByRole('link', { name: 'Julia installation page' })).toHaveAttribute(
    'href',
    'https://julialang.org/install/'
  )
  const localSteps = dialog.locator('.local-run-steps > li')
  await expect(localSteps).toHaveCount(4)
  await expect(localSteps.nth(0)).toContainText('Install Juliaup through the Julia installation page.')
  await expect(localSteps.nth(1).locator('code')).toHaveText(
    'git clone https://github.com/QuantumSavory/WebQuantumSavory.git'
  )
  await expect(localSteps.nth(2).locator('code')).toHaveText(
    "julia --project=. -e 'using Pkg; Pkg.instantiate(); Pkg.precompile()'"
  )
  await expect(localSteps.nth(3).locator('code')).toHaveText(
    'WQS_DEPLOYMENT_PROFILE=local WQS_ENABLE_SOURCE_EVALUATION=true ./bin/server'
  )

  await expect(dialog.getByRole('link', { name: 'Krastanov Lab' })).toHaveAttribute(
    'href',
    'https://lab.krastanov.org/'
  )
  await expect(dialog.getByRole('link', { name: /Manning College/ })).toHaveAttribute(
    'href',
    'https://www.cics.umass.edu/'
  )
  await expect(
    dialog.getByRole('link', { name: 'NSF Engineering and Research Center for Quantum Networks' })
  ).toHaveAttribute('href', 'https://cqn-erc.arizona.edu/')
  await expect(dialog.getByRole('link', { name: 'NSF Grant 2346089' })).toHaveAttribute(
    'href',
    'https://www.nsf.gov/awardsearch/show-award/?AWD_ID=2346089'
  )

  await expect(dialog.getByRole('link', { name: /Office hours/ })).toHaveAttribute(
    'href',
    'https://quantumsavory.org/community/office-hours/'
  )
  await expect(dialog.getByRole('link', { name: /Bounty program/ })).toHaveAttribute(
    'href',
    'https://quantumsavory.org/community/bounties/'
  )
  await expect(dialog).not.toContainText(/Friday|12:30|Zoom/)

  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused()
})
