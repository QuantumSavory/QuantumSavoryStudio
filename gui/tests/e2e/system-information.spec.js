import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const packageLockUrl = new URL('../../package-lock.json', import.meta.url)

function directDependencyVersions(packageLock, groupName) {
  return Object.keys(packageLock.packages[''][groupName])
    .sort()
    .map(name => ({
      name,
      version: packageLock.packages[`node_modules/${name}`].version,
    }))
}

test('version badge opens complete system information with exact locked dependencies', async ({ page }) => {
  const platformResponsePromise = page.waitForResponse(response => (
    response.url().endsWith('/platform_info') && response.ok()
  ))
  await page.goto('/')
  const platformInfo = await (await platformResponsePromise).json()
  const packageLock = JSON.parse(await readFile(packageLockUrl, 'utf8'))
  const appVersion = packageLock.packages[''].version

  const versionButton = page.getByRole('button', {
    name: `WebQuantumSavory version ${appVersion}. Open System Information`,
  })
  await expect(versionButton).toBeVisible()
  await expect(versionButton).toHaveAttribute('title', 'Open System Information')
  await versionButton.click()

  const dialog = page.getByRole('dialog', { name: 'System Information' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('system-webquantumsavory-version'))
    .toHaveText(platformInfo.versions.app)
  await expect(dialog.getByTestId('system-julia-version')).toHaveText(platformInfo.versions.julia)
  await expect(dialog.getByTestId('system-genie-version')).toHaveText(platformInfo.versions.genie)
  await expect(dialog.getByTestId('system-quantumsavory-version'))
    .toHaveText(platformInfo.quantumsavory.version)
  for (const [testId, value] of [
    ['system-quantumsavory-source', platformInfo.quantumsavory.tracked_source],
    ['system-quantumsavory-revision', platformInfo.quantumsavory.tracked_revision],
    ['system-quantumsavory-tree-hash', platformInfo.quantumsavory.tree_hash],
  ]) {
    if (value) await expect(dialog.getByTestId(testId)).toHaveText(value)
    else await expect(dialog.getByTestId(testId)).toHaveCount(0)
  }

  if (platformInfo.quantumsavory.commit) {
    await expect(dialog.getByTestId('system-quantumsavory-commit'))
      .toHaveText(platformInfo.quantumsavory.commit)
  } else {
    await expect(dialog.getByTestId('system-quantumsavory-commit')).toHaveCount(0)
  }

  const changelog = dialog.getByTestId('system-changelog')
  await expect(changelog.getByRole('heading', { name: 'Changelog', level: 1 })).toBeVisible()
  await expect(changelog.getByRole('heading', { name: appVersion, level: 2 })).toBeVisible()
  await expect(changelog.getByRole('heading', { name: '1.9.1', level: 2 })).toBeVisible()
  await expect(changelog).toContainText('project-persisted template-node slots')

  const dependencyGroups = [
    ['Runtime dependencies', 'system-runtime-dependencies', 'dependencies'],
    ['Development dependencies', 'system-development-dependencies', 'devDependencies'],
  ]
  for (const [summary, testId, lockGroup] of dependencyGroups) {
    await dialog.locator('.system-dependency-group summary').filter({ hasText: summary }).click()
    const expectedDependencies = directDependencyVersions(packageLock, lockGroup)
    const list = dialog.getByTestId(testId)
    await expect(list.locator('.system-dependency-row')).toHaveCount(expectedDependencies.length)
    for (const dependency of expectedDependencies) {
      const row = list.getByText(dependency.name, { exact: true }).locator('..')
      await expect(row).toContainText(dependency.version)
    }
  }

  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(versionButton).toBeFocused()
})
