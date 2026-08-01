import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TagBadgeSequence from '../../src/components/tags/TagBadgeSequence.vue'
import TagConstructor from '../../src/components/tags/TagConstructor.vue'
import TagResultsList from '../../src/components/tags/TagResultsList.vue'
import { normalizeTagCatalog } from '../../src/utils/tagExplorer.js'
import { api } from '../../src/utils/ApiConnector.js'

const catalog = normalizeTagCatalog({
  named_tags: [{
    type_id: 'QuantumSavory.PriorityTag',
    display_name: 'PriorityTag',
    doc: '**PriorityTag** catalog documentation.',
    fields: [
      { name: 'priority', type: 'Int64', doc: 'Priority value', position: 1 },
      { name: 'owner', type: 'Symbol', doc: 'Owner symbol', position: 2 }
    ]
  }],
  general_signatures: [
    {
      signature_id: 'symbol-empty',
      head_type: 'Symbol',
      display_name: 'Symbol tag',
      fields: [],
      allowed_data_type_ids: [],
      variadic: false
    },
    {
      signature_id: 'symbol-int',
      head_type: 'Symbol',
      display_name: 'Symbol tag',
      fields: [{ name: 'field_1', type: 'Int64', doc: '', position: 1 }],
      allowed_data_type_ids: [],
      variadic: false
    },
    {
      signature_id: 'symbol-float',
      head_type: 'Symbol',
      display_name: 'Symbol tag',
      fields: [{ name: 'field_1', type: 'Float64', doc: '', position: 1 }],
      allowed_data_type_ids: [],
      variadic: false
    },
    {
      signature_id: 'symbol-int-symbol',
      head_type: 'Symbol',
      display_name: 'Symbol tag',
      fields: [
        { name: 'field_1', type: 'Int64', doc: '', position: 1 },
        { name: 'field_2', type: 'Symbol', doc: '', position: 2 }
      ],
      allowed_data_type_ids: [],
      variadic: false
    },
    {
      signature_id: 'datatype-empty',
      head_type: 'DataType',
      display_name: 'DataType tag',
      fields: [],
      allowed_data_type_ids: ['Core.Int64'],
      variadic: false
    }
  ],
  allowed_data_types: [
    { type_id: 'Core.Float64', display_name: 'Float64' },
    { type_id: 'Core.Int64', display_name: 'Int64' }
  ],
  unsafe_evaluation: false
})

const CodeEditorStub = defineComponent({
  name: 'CodeEditorWithSymbols',
  props: ['modelValue', 'readOnly', 'errorMessage'],
  emits: ['update:modelValue', 'validate'],
  template: '<textarea class="code-editor-stub" :value="modelValue" :readonly="readOnly" @input="$emit(\'update:modelValue\', $event.target.value)" />'
})

const tooltipDirective = {
  mounted(element, binding) {
    element.dataset.tooltipMarkdown = typeof binding.value === 'string'
      ? binding.value
      : binding.value?.value || ''
  },
  updated(element, binding) {
    element.dataset.tooltipMarkdown = typeof binding.value === 'string'
      ? binding.value
      : binding.value?.value || ''
  }
}

function previewResponse(tag, rendered = 'Rendered tag') {
  const structured = tag.kind === 'named'
    ? {
        kind: 'named',
        type_id: tag.type_id,
        display_name: 'PriorityTag',
        fields: Object.entries(tag.fields).map(([name, value], index) => ({
          name,
          type: index === 0 ? 'Int64' : 'Symbol',
          value,
          position: index + 1
        }))
      }
    : {
        kind: 'general',
        head: tag.head,
        fields: tag.fields.map((field, index) => ({
          name: `field_${index + 1}`,
          type: field.type,
          value: field.value,
          position: index + 1
        }))
      }
  return { success: true, rendered, tag: structured }
}

function mountConstructor(props = {}) {
  const previewer = props.previewer || vi.fn(async tag => previewResponse(tag))
  return mount(TagConstructor, {
    props: { catalog, previewer, ...props },
    global: {
      directives: { tooltip: tooltipDirective },
      stubs: { CodeEditorWithSymbols: CodeEditorStub }
    }
  })
}

async function typeHead(wrapper, value) {
  const combobox = wrapper.get('[role="combobox"]')
  await combobox.trigger('focus')
  await combobox.setValue(value)
  return combobox
}

async function clickOption(wrapper, text) {
  const option = wrapper.findAll('.tag-option').find(candidate => candidate.text().includes(text))
  expect(option, `option containing ${text}`).toBeTruthy()
  await option.trigger('click')
}

describe('shared tag badge sequence', () => {
  it('wraps identity and fields with labels, type colors, editable styling, and Markdown tooltips', async () => {
    const wrapper = mount(TagBadgeSequence, {
      props: {
        editable: true,
        identity: { kind: 'named', name: 'Tag', type: 'Named', value: 'PriorityTag', doc: '**Named docs**' },
        fields: [
          { name: 'owner', type: 'Symbol', value: 'alice', doc: 'Owner *documentation*' },
          { name: 'count', type: 'Int64', value: 2, doc: '' },
          { name: 'anything', type: 'Symbol', value: '', termKind: 'wildcard' },
          { name: 'filter', type: 'Float64', value: 2, termKind: 'predicate', operator: '>' }
        ]
      },
      global: { directives: { tooltip: tooltipDirective } }
    })

    const badges = wrapper.findAll('.tag-badge')
    expect(wrapper.get('.tag-badge-sequence').classes()).toContain('tag-badge-sequence-editable')
    expect(badges.map(badge => badge.attributes('data-badge-kind'))).toEqual([
      'named', 'symbol', 'number', 'wildcard', 'predicate'
    ])
    expect(badges.every(badge => badge.classes().includes('tag-badge-editable'))).toBe(true)
    expect(badges[1].get('.tag-badge-label').text()).toBe('owner')
    expect(badges[1].get('.tag-badge-type').text()).toBe('Symbol')
    expect(badges[0].attributes('data-tooltip-markdown')).toBe('**Named docs**')
    expect(badges[2].attributes('data-tooltip-markdown')).toBe('**count**\n\nType: `Int64`')

    await wrapper.setProps({ editable: false })
    expect(wrapper.findAll('.tag-badge-editable')).toHaveLength(0)
  })
})

describe('progressive tag constructor', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('lists only named tags when empty and commits a named head by click', async () => {
    const wrapper = mountConstructor({ query: true })
    await wrapper.get('[role="combobox"]').trigger('focus')

    expect(wrapper.findAll('.tag-option').map(option => option.text())).toEqual([
      expect.stringContaining('PriorityTag')
    ])
    expect(wrapper.text()).not.toContain('Symbol tag (Symbol)')
    await clickOption(wrapper, 'PriorityTag')

    const badges = wrapper.findAll('.tag-badge')
    expect(badges).toHaveLength(3)
    expect(badges[0].attributes('data-badge-kind')).toBe('named')
    expect(badges[0].attributes('data-tooltip-markdown')).toContain('catalog documentation')
    expect(badges[1].get('.tag-badge-label').text()).toBe('priority')
    expect(badges[2].get('.tag-badge-type').text()).toBe('Symbol')
  })

  it('commits named and colon-Symbol heads only through Enter or a choice, while blur preserves unfinished text', async () => {
    vi.useFakeTimers()
    const wrapper = mountConstructor({ query: true })
    const combobox = await typeHead(wrapper, 'Priority')
    await combobox.trigger('keydown', { key: 'Enter' })
    expect(wrapper.findAll('.tag-field-badge')).toHaveLength(2)

    await combobox.setValue(':unfinished')
    expect(wrapper.findAll('.tag-field-badge')).toHaveLength(0)
    await combobox.trigger('blur')
    await vi.advanceTimersByTimeAsync(100)
    expect(combobox.element.value).toBe(':unfinished')
    expect(wrapper.findAll('.tag-field-badge')).toHaveLength(0)

    await combobox.trigger('focus')
    expect(wrapper.get('.tag-option').text()).toContain('General Tag: Symbol')
    await combobox.trigger('keydown', { key: 'Enter' })
    expect(combobox.element.value).toBe(':unfinished')
    expect(wrapper.get('.tag-badge-identity').attributes('data-badge-kind')).toBe('symbol')
    expect(wrapper.get('[aria-label="Next field type"]').findAll('option').map(option => option.text()))
      .toEqual(['Add field…', 'Int64', 'Float64'])
  })

  it('requires a nonempty colon Symbol and clears fields plus preview when a committed head is edited', async () => {
    vi.useFakeTimers()
    const previewer = vi.fn(async tag => previewResponse(tag))
    const wrapper = mountConstructor({ previewer })
    const combobox = await typeHead(wrapper, ':')
    expect(wrapper.get('.tag-option').attributes()).toHaveProperty('disabled')
    await combobox.trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('.tag-preview').exists()).toBe(false)

    await combobox.setValue(':ready')
    await clickOption(wrapper, 'General Tag: Symbol')
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()
    expect(wrapper.get('.tag-preview code').text()).toBe('Rendered tag')

    await combobox.setValue(':changed')
    expect(wrapper.find('.tag-preview').exists()).toBe(false)
    expect(wrapper.findAll('.tag-field-badge')).toHaveLength(0)
  })

  it('commits only unique, allowed catalog DataTypes and accepts qualified IDs for ambiguous short names', async () => {
    const dataTypeCatalog = normalizeTagCatalog({
      named_tags: [],
      general_signatures: [{
        signature_id: 'datatype-empty',
        head_type: 'DataType',
        display_name: 'DataType tag',
        fields: [],
        allowed_data_type_ids: ['Foo.Token', 'Bar.Token'],
        variadic: false
      }],
      allowed_data_types: [
        { type_id: 'Foo.Token', display_name: 'Token' },
        { type_id: 'Bar.Token', display_name: 'Token' },
        { type_id: 'Core.Float64', display_name: 'Float64' }
      ],
      unsafe_evaluation: false
    })
    const wrapper = mountConstructor({ catalog: dataTypeCatalog, query: true })

    await typeHead(wrapper, 'Token')
    expect(wrapper.findAll('.tag-option')).toHaveLength(0)
    await typeHead(wrapper, 'Core.Float64')
    expect(wrapper.findAll('.tag-option')).toHaveLength(0)
    const combobox = await typeHead(wrapper, 'Foo.Token')
    expect(wrapper.get('.tag-option').text()).toContain('General Tag: DataType')
    await combobox.trigger('keydown', { key: 'Enter' })
    expect(wrapper.get('.tag-badge-identity').attributes('data-badge-kind')).toBe('datatype')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('serializes a unique friendly DataType search as its advertised ID', async () => {
    const wrapper = mountConstructor({ query: true })
    const combobox = await typeHead(wrapper, 'Int64')

    expect(wrapper.get('.tag-option').text()).toContain('General Tag: DataType')
    await combobox.trigger('keydown', { key: 'Enter' })
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')?.at(-1)?.[0]).toEqual({
      kind: 'general',
      signature_id: 'datatype-empty',
      head: { type: 'DataType', value: 'Core.Int64' },
      fields: []
    })
  })

  it('narrows general signatures by prefix, allows only final-field backtracking, and submits only complete signatures', async () => {
    const wrapper = mountConstructor({ query: true, actionLabel: 'Run query' })
    const combobox = await typeHead(wrapper, ':priority')
    await combobox.trigger('keydown', { key: 'Enter' })

    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[aria-label="Next field type"]').setValue('Int64')
    expect(wrapper.findAll('.tag-field-badge')).toHaveLength(1)
    expect(wrapper.get('[aria-label="Next field type"]').findAll('option').map(option => option.text()))
      .toEqual(['Add field…', 'Symbol'])
    expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')

    await wrapper.get('[aria-label="field_1 value"]').setValue('9')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[aria-label="Next field type"]').setValue('Symbol')
    expect(wrapper.findAll('[aria-label^="Remove "]')).toHaveLength(1)
    expect(wrapper.find('[aria-label="Remove field_1"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Next field type"]').exists()).toBe(false)

    await wrapper.get('[aria-label="field_2 value"]').setValue('alice')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.at(-1)?.[0]).toEqual({
      kind: 'general',
      signature_id: 'symbol-int-symbol',
      head: { type: 'Symbol', value: 'priority' },
      fields: [
        { type: 'Int64', value: { kind: 'exact', value: 9 } },
        { type: 'Symbol', value: { kind: 'exact', value: 'alice' } }
      ]
    })

    await wrapper.get('[aria-label="Remove field_2"]').trigger('click')
    expect(wrapper.findAll('.tag-field-badge')).toHaveLength(1)
    expect(wrapper.find('[aria-label="Next field type"]').exists()).toBe(true)
  })

  it('previews complete tags with debounce and keeps preview failures from attachment', async () => {
    vi.useFakeTimers()
    const previewer = vi.fn(async tag => previewResponse(tag, 'Tag(PriorityTag(2, :alice))'))
    const wrapper = mountConstructor({ previewer })
    await wrapper.get('[role="combobox"]').trigger('focus')
    await clickOption(wrapper, 'PriorityTag')
    await wrapper.get('[aria-label="priority value"]').setValue('2')
    await wrapper.get('[aria-label="owner value"]').setValue('alice')
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()

    expect(previewer).toHaveBeenCalledWith({
      kind: 'named',
      type_id: 'QuantumSavory.PriorityTag',
      fields: { priority: 2, owner: 'alice' }
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(wrapper.get('.tag-preview code').text()).toBe('Tag(PriorityTag(2, :alice))')

    previewer.mockRejectedValueOnce(new Error('Field value is invalid'))
    await wrapper.get('[aria-label="priority value"]').setValue('3')
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Field value is invalid')
    expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')
  })

  it('serializes exact, wildcard, preset, and custom query badges and uses raw diagnostics in Markdown fences', async () => {
    const validate = vi.spyOn(api, 'validateFunction').mockResolvedValue({
      success: false,
      error: 'bad <tag> & `code`'
    })
    const wrapper = mountConstructor({
      query: true,
      actionLabel: 'Run query',
      unsafeEvaluationEnabled: true
    })
    await wrapper.get('[role="combobox"]').trigger('focus')
    await clickOption(wrapper, 'PriorityTag')

    const termSelectors = wrapper.findAll('.query-term-kind')
    await termSelectors[0].setValue('predicate')
    await wrapper.get('[aria-label="Predicate operator for priority"]').setValue('≥')
    await wrapper.get('[aria-label="Predicate operand for priority"]').setValue('2')
    await termSelectors[1].setValue('wildcard')
    expect(wrapper.findAll('.tag-field-badge').map(badge => badge.attributes('data-badge-kind')))
      .toEqual(['predicate', 'wildcard'])
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0].fields).toEqual({
      priority: { kind: 'predicate', predicate: 'preset', operator: '≥', operand: 2 },
      owner: { kind: 'wildcard' }
    })

    await wrapper.get('[aria-label="Predicate kind for priority"]').setValue('custom')
    await flushPromises()
    let editor = wrapper.findComponent(CodeEditorStub)
    editor.vm.$emit('update:modelValue', 'x -> true')
    await nextTick()
    editor.vm.$emit('validate')
    await flushPromises()
    editor = wrapper.findComponent(CodeEditorStub)
    expect(validate).toHaveBeenCalledWith('x -> true', 'query')
    expect(editor.props('errorMessage')).toContain('bad <tag> & `code`')
    expect(editor.props('errorMessage')).not.toContain('&lt;tag&gt;')
    expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')

    await wrapper.get('[aria-label="Predicate kind for priority"]').setValue('preset')
    expect(wrapper.get('button[type="submit"]').attributes()).not.toHaveProperty('disabled')
    await wrapper.get('[aria-label="Predicate kind for priority"]').setValue('custom')
    await flushPromises()
    expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')

    validate.mockResolvedValueOnce({ success: true })
    editor = wrapper.findComponent(CodeEditorStub)
    editor.vm.$emit('validate')
    await flushPromises()
    expect(wrapper.get('button[type="submit"]').attributes()).not.toHaveProperty('disabled')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.at(-1)?.[0].fields.priority).toEqual({
      kind: 'predicate',
      predicate: 'custom',
      source: 'x -> true'
    })
  })

  it('ignores stale custom-predicate validation responses', async () => {
    let resolveFirst
    let resolveSecond
    const validate = vi.spyOn(api, 'validateFunction')
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve }))
    const wrapper = mountConstructor({
      query: true,
      actionLabel: 'Run query',
      unsafeEvaluationEnabled: true
    })
    await wrapper.get('[role="combobox"]').trigger('focus')
    await clickOption(wrapper, 'PriorityTag')
    await wrapper.findAll('.query-term-kind')[0].setValue('predicate')
    await wrapper.findAll('.query-term-kind')[1].setValue('wildcard')
    await wrapper.get('[aria-label="Predicate kind for priority"]').setValue('custom')

    let editor = wrapper.findComponent(CodeEditorStub)
    editor.vm.$emit('update:modelValue', 'x -> false')
    await nextTick()
    editor.vm.$emit('validate')
    editor.vm.$emit('update:modelValue', 'x -> true')
    await nextTick()
    editor = wrapper.findComponent(CodeEditorStub)
    editor.vm.$emit('validate')

    resolveSecond({ success: true })
    await flushPromises()
    resolveFirst({ success: false, error: 'stale failure' })
    await flushPromises()

    editor = wrapper.findComponent(CodeEditorStub)
    expect(validate).toHaveBeenNthCalledWith(1, 'x -> false', 'query')
    expect(validate).toHaveBeenNthCalledWith(2, 'x -> true', 'query')
    expect(editor.props('errorMessage')).toBe('')
    expect(wrapper.get('button[type="submit"]').attributes()).not.toHaveProperty('disabled')
  })

  it('policy-gates the shared custom Function editor', async () => {
    const wrapper = mountConstructor({ query: true })
    await wrapper.get('[role="combobox"]').trigger('focus')
    await clickOption(wrapper, 'PriorityTag')
    await wrapper.findAll('.query-term-kind')[0].setValue('predicate')

    const custom = wrapper.get('[aria-label="Predicate kind for priority"] option[value="custom"]')
    expect(custom.attributes()).toHaveProperty('disabled')
    expect(wrapper.get('.evaluation-guidance').text()).toContain('unsafe evaluation is disabled')
  })
})

describe('read-only tag results', () => {
  it('keeps context collapsed, uses shared badges, and discloses every available detail', async () => {
    const entry = {
      id: 'tag-1',
      kind: 'named',
      type_id: 'QuantumSavory.PriorityTag',
      display_name: 'PriorityTag',
      fields: [{ name: 'priority', type: 'Int64', value: 2, position: 1 }],
      rendered: 'Tag(PriorityTag(2))',
      slotId: 'slot-external',
      time: 1.5,
      source: 'Alice',
      depth: 3
    }
    const wrapper = mount(TagResultsList, {
      props: { entries: [entry], catalog, deletable: true },
      global: { directives: { tooltip: tooltipDirective } }
    })

    expect(wrapper.find('[data-testid="tag-badge-sequence"]').exists()).toBe(true)
    expect(wrapper.findAll('.tag-badge-editable')).toHaveLength(0)
    expect(wrapper.get('.tag-field-badge').attributes('data-badge-kind')).toBe('number')
    expect(wrapper.text()).not.toContain('Tag(PriorityTag(2))')
    expect(wrapper.text()).not.toContain('slot-external')
    expect(wrapper.text()).not.toContain('Alice')
    expect(wrapper.text()).not.toContain('Buffer depth')

    await wrapper.get('[aria-label="Show rendered tag details"]').trigger('click')
    expect(wrapper.text()).toContain('Tag(PriorityTag(2))')
    expect(wrapper.text()).toContain('tag-1')
    expect(wrapper.text()).toContain('slot-external')
    expect(wrapper.text()).toContain('1.5')
    expect(wrapper.text()).toContain('Message source')
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('Buffer depth')
    expect(wrapper.text()).toContain('3')

    await wrapper.get('[aria-label="Delete tag tag-1"]').trigger('click')
    expect(wrapper.emitted('delete')?.[0]?.[0]).toEqual(entry)
    await wrapper.setProps({ deletable: false })
    expect(wrapper.find('[aria-label="Delete tag tag-1"]').exists()).toBe(false)
  })

  it('omits unavailable expanded metadata', async () => {
    const wrapper = mount(TagResultsList, {
      props: {
        entries: [{
          id: 'tag-2',
          kind: 'general',
          head: { type: 'Symbol', value: 'ready' },
          fields: [],
          rendered: 'SymbolTag(:ready)'
        }]
      },
      global: { directives: { tooltip: tooltipDirective } }
    })
    await wrapper.get('[aria-label="Show rendered tag details"]').trigger('click')
    expect(wrapper.findAll('.tag-result-details dt').map(label => label.text())).toEqual([
      'Rendered', 'Tag ID'
    ])
  })
})
