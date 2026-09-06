import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DescriptionPanel from '../../src/components/panels/DescriptionPanel.vue'
import MarkdownEditor from '../../src/components/ui/MarkdownEditor.vue'

function createPasteEvent(items) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { items },
  })
  return event
}

function clipboardFile(file, advertisedType = file.type) {
  return {
    kind: 'file',
    type: advertisedType,
    getAsFile: vi.fn(() => file),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DescriptionPanel', () => {
  it('is a project-specific Markdown editor adapter', () => {
    const wrapper = mount(DescriptionPanel, {
      props: { modelValue: 'Project details' },
    })
    const editor = wrapper.getComponent(MarkdownEditor)
    const purpose = wrapper.get('[role="note"]')

    expect(purpose.text()).toContain("project's purpose, assumptions, and usage notes")
    expect(editor.props()).toMatchObject({
      modelValue: 'Project details',
      idPrefix: 'project-description',
      editorLabel: 'Project description in Markdown',
      editButtonLabel: 'Edit project description',
      saveButtonLabel: 'Save project description',
      cancelButtonLabel: 'Cancel description editing',
      emptyText: 'No description yet.',
    })

    editor.vm.$emit('update:modelValue', 'Updated details')
    expect(wrapper.emitted('update:modelValue')).toEqual([['Updated details']])
  })

  it('inserts pasted images as Markdown data URLs at the current selection', async () => {
    const wrapper = mount(DescriptionPanel, {
      props: { modelValue: 'Before selected after' },
    })

    await wrapper.get('[aria-label="Edit project description"]').trigger('click')
    const textarea = wrapper.get('textarea')
    textarea.element.setSelectionRange(7, 15)

    const image = new File([new Uint8Array([0, 1, 2])], 'pixel.png', { type: 'image/png' })
    const pasteEvent = createPasteEvent([clipboardFile(image)])
    textarea.element.dispatchEvent(pasteEvent)

    expect(pasteEvent.defaultPrevented).toBe(true)

    const expected = 'Before ![Pasted image](data:image/png;base64,AAEC) after'
    await vi.waitFor(() => expect(textarea.element.value).toBe(expected))
    await vi.waitFor(() => expect(textarea.element.readOnly).toBe(false))
    const expectedCaret = expected.indexOf(' after')
    expect(textarea.element.selectionStart).toBe(expectedCaret)
    expect(textarea.element.selectionEnd).toBe(expectedCaret)

    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('update:modelValue')).toEqual([[expected]])
  })

  it('leaves ordinary and unsupported-image paste behavior to the browser', async () => {
    const wrapper = mount(DescriptionPanel, {
      props: { modelValue: 'Existing description' },
    })

    await wrapper.get('[aria-label="Edit project description"]').trigger('click')
    const textarea = wrapper.get('textarea')

    const textPaste = createPasteEvent([{
      kind: 'string',
      type: 'text/plain',
      getAsFile: vi.fn(() => null),
    }])
    textarea.element.dispatchEvent(textPaste)

    const svg = new File(['<svg/>'], 'vector.svg', { type: 'image/svg+xml' })
    const svgPaste = createPasteEvent([clipboardFile(svg, 'image/png')])
    textarea.element.dispatchEvent(svgPaste)

    expect(textPaste.defaultPrevented).toBe(false)
    expect(svgPaste.defaultPrevented).toBe(false)
    expect(textarea.element.value).toBe('Existing description')
  })

  it('locks stale selection state while reading and ignores completion after cancel', async () => {
    let finishReading
    class DeferredFileReader {
      addEventListener(type, listener) {
        this[`on${type}`] = listener
      }

      readAsDataURL() {
        finishReading = () => {
          this.result = 'data:image/png;base64,AAEC'
          this.onload()
        }
      }
    }
    vi.stubGlobal('FileReader', DeferredFileReader)

    const wrapper = mount(DescriptionPanel, {
      props: { modelValue: 'Keep this description' },
    })

    await wrapper.get('[aria-label="Edit project description"]').trigger('click')
    const textarea = wrapper.get('textarea')
    const image = new File([new Uint8Array([0, 1, 2])], 'pixel.png', { type: 'image/png' })
    textarea.element.dispatchEvent(createPasteEvent([clipboardFile(image)]))

    await vi.waitFor(() => expect(textarea.element.readOnly).toBe(true))
    expect(wrapper.get('[aria-label="Save project description"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[aria-label="Cancel description editing"]').trigger('click')
    finishReading()

    await wrapper.get('[aria-label="Edit project description"]').trigger('click')
    expect(wrapper.get('textarea').element.value).toBe('Keep this description')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
