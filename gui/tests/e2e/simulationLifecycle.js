export async function mockParseAndDestroy(page) {
  await page.route('**/parse_network_graph', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: true, message: 'Parsed' },
  }))
  await page.route('**/destroy_simulation', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    json: { success: true, message: 'Destroyed' },
  }))
}

export async function parseNetworkThroughRunner(page) {
  await page.getByRole('button', { name: 'Toggle advanced controls' }).click()
  const response = page.waitForResponse(candidate => (
    candidate.url().endsWith('/parse_network_graph') && candidate.ok()
  ))
  await page.getByRole('button', { name: 'Parse', exact: true }).click()
  await response
}

export async function stopSimulationThroughRunner(page) {
  const response = page.waitForResponse(candidate => (
    candidate.url().endsWith('/destroy_simulation') && candidate.ok()
  ))
  await page.locator('#runnerPanel .stop-btn').click()
  await response
}
