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

export async function addOneSlotToEachNode(page) {
  const nodes = page.locator('.node-marker')
  const nodeCount = await nodes.count()
  const nodePanel = page.locator('#nodePanel')

  for (let index = 0; index < nodeCount; index += 1) {
    await nodes.nth(index).click()
    await nodePanel.getByRole('button', { name: 'Add Slot' }).click()
    await nodePanel.locator('.slot-row-container').waitFor()
  }
}

export async function parseNetworkThroughRunner(page) {
  const parseButton = page.getByRole('button', { name: 'Parse', exact: true })
  if (!await parseButton.isVisible()) {
    await page.getByRole('button', { name: 'Toggle advanced controls' }).click()
  }
  const response = page.waitForResponse(candidate => (
    candidate.url().endsWith('/parse_network_graph') && candidate.ok()
  ))
  await parseButton.click()
  await response
}

export async function parsePayloadThroughRunner(page) {
  const request = page.waitForRequest(candidate => (
    candidate.url().endsWith('/parse_network_graph')
  ))
  await parseNetworkThroughRunner(page)
  return (await request).postDataJSON()
}

export async function stopSimulationThroughRunner(page) {
  const response = page.waitForResponse(candidate => (
    candidate.url().endsWith('/destroy_simulation') && candidate.ok()
  ))
  await page.locator('#runnerPanel .stop-btn').click()
  await response
}
