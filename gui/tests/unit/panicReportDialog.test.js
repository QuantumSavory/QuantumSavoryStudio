import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import PanicReportDialog from '../../src/components/PanicReportDialog.vue'

const AppDialogStub = {
  props: ['show', 'title'],
  emits: ['close'],
  template: `
    <section v-if="show" role="dialog" :aria-label="title">
      <slot />
      <footer><slot name="footer" /></footer>
    </section>
  `,
}

const AppButtonStub = {
  props: ['disabled'],
  emits: ['click'],
  template: `
    <button :disabled="disabled" @click="$emit('click', $event)">
      <slot name="icon" /><slot />
    </button>
  `,
}

const panic = {
  id: 'panic-dialog-1',
  timestamp: '2026-07-13T17:00:00Z',
  source: 'Simulator',
  summary: 'Diagnostic protocol crashed',
  exception_type: 'BoundsError',
  message: 'BoundsError at index 100',
  stacktrace: 'BoundsError\n [1] getindex\n [2] run_simulation',
}

const project = {
  schemaVersion: 2,
  name: 'Unsafe / Project',
  description: 'Full canonical project',
  variables: [],
  simulationConfig: { time: 1, timeStep: 0.1 },
  net: { nodes: [{ id: 'node-1' }], edges: [], protocols: [] },
}

let wrappers = []

afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  wrappers = []
})

function mountDialog(browserActions) {
  const wrapper = mount(PanicReportDialog, {
    attachTo: document.body,
    props: {
      show: true,
      panic,
      projectName: project.name,
      platformInfo: {
        versions: {
          app: '1.6.0',
          quantumSavory: '0.7.2',
          julia: '1.12.1',
          genie: '5.33.8',
        },
        quantumsavory: {
          tracked_revision: 'master',
          tree_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      serializeProject: vi.fn(() => project),
      browserActions,
    },
    global: {
      stubs: {
        AppDialog: AppDialogStub,
        AppButton: AppButtonStub,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

function reportButton(wrapper) {
  return wrapper.findAll('button').find(button => button.text().trim() === 'Report')
}

describe('PanicReportDialog', () => {
  it('shows a focused crash explanation and a collapsed complete stacktrace disclosure', () => {
    const wrapper = mountDialog({})

    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Simulator panic')
    expect(wrapper.text()).toContain('The simulator backend crashed')
    expect(wrapper.text()).toContain('BoundsError at index 100')
    const details = wrapper.get('details')
    expect(details.attributes('open')).toBeUndefined()
    expect(details.get('summary').text()).toContain('Complete stacktrace')
    expect(details.get('[data-testid="panic-stacktrace"]').text()).toContain('[2] run_simulation')
    expect(wrapper.text()).toContain('not uploaded automatically')
  })

  it('copies Markdown, downloads full canonical JSON, and opens a prepared issue', async () => {
    const writeClipboard = vi.fn().mockResolvedValue(undefined)
    const downloadText = vi.fn()
    const openIssue = vi.fn()
    const wrapper = mountDialog({ writeClipboard, downloadText, openIssue })

    await reportButton(wrapper).trigger('click')
    await flushPromises()

    expect(writeClipboard).toHaveBeenCalledOnce()
    const report = writeClipboard.mock.calls[0][0]
    expect(report).toContain(panic.stacktrace)
    expect(report).toContain('- QuantumSavory Studio: 1.6.0')
    expect(report).toContain('- QuantumSavory: 0.7.2')
    expect(report).toContain('- Julia: 1.12.1')
    expect(report).toContain('- Genie: 5.33.8')
    expect(report).toContain('- QuantumSavory tracked revision: master')
    expect(report).toContain('- QuantumSavory Pkg tree hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(report).toContain('### Frontend runtime dependencies')
    expect(report).toContain('### Frontend development dependencies')

    expect(downloadText).toHaveBeenCalledOnce()
    const [content, filename, mimeType] = downloadText.mock.calls[0]
    expect(JSON.parse(content)).toEqual(project)
    expect(filename).toBe('Unsafe-Project-panic.json')
    expect(mimeType).toBe('application/json;charset=utf-8')

    expect(openIssue).toHaveBeenCalledOnce()
    const issueUrl = new URL(openIssue.mock.calls[0][0])
    expect(`${issueUrl.origin}${issueUrl.pathname}`).toBe(
      'https://github.com/QuantumSavory/QuantumSavoryStudio/issues/new',
    )
    expect(issueUrl.searchParams.get('body')).toContain('attach the downloaded')
    expect(wrapper.get('[role="status"]').text()).toContain('Report copied')
    expect(wrapper.emitted('reported')).toHaveLength(1)
    expect(wrapper.emitted('reported')[0][0]).toMatchObject({
      report,
      filename: 'Unsafe-Project-panic.json',
      clipboardCopied: true,
      errors: [],
    })
  })

  it('provides a focused selectable inline fallback when clipboard access fails', async () => {
    const clipboardError = new Error('permission denied')
    const wrapper = mountDialog({
      writeClipboard: vi.fn().mockRejectedValue(clipboardError),
      downloadText: vi.fn(),
      openIssue: vi.fn(),
    })

    await reportButton(wrapper).trigger('click')
    await flushPromises()

    const fallback = wrapper.get('textarea[aria-label="Panic report Markdown"]')
    expect(fallback.attributes('readonly')).toBeDefined()
    expect(fallback.element.value).toContain(panic.stacktrace)
    expect(document.activeElement).toBe(fallback.element)
    expect(wrapper.get('[role="alert"]').text()).toContain('Clipboard copy failed')
    expect(wrapper.emitted('reported')[0][0]).toMatchObject({
      clipboardCopied: false,
      errors: ['Clipboard copy failed: permission denied'],
    })
  })

  it('emits close independently of the report workflow', async () => {
    const wrapper = mountDialog({})
    const close = wrapper.findAll('button').find(button => button.text().trim() === 'Close')

    await close.trigger('click')

    expect(wrapper.emitted('close')).toEqual([[]])
    expect(wrapper.emitted('reported')).toBeUndefined()
  })
})
