import { expect } from '@playwright/test'

export async function saveAndReadProject(page, projectName) {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Save', exact: true }).click()

  const storageKey = `cqn_project_${projectName}`
  await expect.poll(() => page.evaluate(
    key => localStorage.getItem(key),
    storageKey,
  )).not.toBeNull()

  return page.evaluate(
    key => JSON.parse(localStorage.getItem(key)),
    storageKey,
  )
}

export async function replaceStoredProjectAndReload(page, project) {
  await page.evaluate(document => {
    localStorage.setItem(`cqn_project_${document.name}`, JSON.stringify(document))
    localStorage.setItem('recentProjectName', document.name)
  }, project)
  await page.reload()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
}
