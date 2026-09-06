import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TagsQueriesPanel from '../../src/components/tags/TagsQueriesPanel.vue'
import { api } from '../../src/utils/ApiConnector.js'

const wireCatalog = {
  named_tags: [{
    type_id: 'QuantumSavory.PriorityTag',
    display_name: 'PriorityTag',
    doc: 'Priority tag',
    fields: [{ name: 'priority', type: 'Int64', doc: '', position: 1 }]
  }],
  general_signatures: [],
  allowed_data_types: [],
  unsafe_evaluation: false
}

const projectData = {
  name: 'Explorer Test',
  net: {
    nodes: [{
      id: 'node-external',
      name: 'Alice',
      data: { slots: [{ id: 'slot-external', type: 'Qubit' }] }
    }],
    edges: [],
    protocols: []
  }
}

const ConstructorStub = defineComponent({
  props: { query: Boolean, actionLabel: String },
  emits: ['submit'],
  template: `
    <button
      type="button"
      :data-testid="query ? 'query-constructor-submit' : 'tag-constructor-submit'"
      @click="$emit('submit', query
        ? { kind: 'named', type_id: 'QuantumSavory.PriorityTag', fields: { priority: { kind: 'wildcard' } } }
        : { kind: 'named', type_id: 'QuantumSavory.PriorityTag', fields: { priority: 2 } })"
    >{{ actionLabel }}</button>
  `
})

function mountPanel(extraProps = {}) {
  return mount(TagsQueriesPanel, {
    props: {
      active: true,
      enabled: true,
      projectName: 'Explorer Test',
      projectData,
      ...extraProps
    },
    global: {
      directives: { tooltip: vi.fn() },
      stubs: { TagConstructor: ConstructorStub }
    }
  })
}

describe('TagsQueriesPanel orchestration', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists all slots by default and attaches selected-slot tags through the slot target', async () => {
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(wireCatalog)
    const list = vi.spyOn(api, 'listTags').mockResolvedValue({
      success: true,
      entries: [{
        tag_id: 'tag-1',
        kind: 'named',
        type_id: 'QuantumSavory.PriorityTag',
        display_name: 'PriorityTag',
        fields: [{ name: 'priority', type: 'Int64', value: 2, position: 1 }],
        rendered: 'Tag(PriorityTag(2))',
        slot_id: 'slot-external'
      }]
    })
    const attach = vi.spyOn(api, 'attachTag').mockResolvedValue({ success: true })
    const remove = vi.spyOn(api, 'deleteTag').mockResolvedValue({ success: true })
    const wrapper = mountPanel()
    await flushPromises()
    const tagsPanel = wrapper.get('#tag-explorer-tags-panel')

    expect(wrapper.get('[role="note"]').text()).toContain('non-consuming tag queries')
    expect(list).toHaveBeenCalledWith('Explorer Test', expect.objectContaining({
      kind: 'register',
      node_id: 'node-external'
    }), expect.any(Object))
    expect(list.mock.calls.at(-1)[1]).toEqual({
      kind: 'register',
      node_id: 'node-external'
    })
    expect(wrapper.text()).toContain('PriorityTag')
    expect(tagsPanel.get('[aria-label="Target slot"]').element.value).toBe('')
    expect(tagsPanel.get('[aria-label="Target slot"] option').text()).toBe('All slots')
    expect(tagsPanel.find('[data-testid="tag-constructor-submit"]').exists()).toBe(false)

    await tagsPanel.get('[aria-label="Target slot"]').setValue('slot-external')
    await flushPromises()
    expect(list).toHaveBeenCalledWith(
      'Explorer Test',
      { kind: 'slot', node_id: 'node-external', slot_id: 'slot-external' },
      expect.any(Object)
    )
    const sections = tagsPanel.findAll('.tag-explorer-columns > section')
    expect(sections[0].classes()).toContain('tag-constructor-column')
    expect(sections[1].classes()).toContain('tag-results-column')

    await tagsPanel.get('[data-testid="tag-constructor-submit"]').trigger('click')
    await flushPromises()
    expect(attach).toHaveBeenCalledWith(
      'Explorer Test',
      { kind: 'slot', node_id: 'node-external', slot_id: 'slot-external' },
      expect.objectContaining({ kind: 'named' }),
      expect.any(Object)
    )

    await tagsPanel.get('[aria-label="Delete tag tag-1"]').trigger('click')
    await flushPromises()
    expect(remove).toHaveBeenCalledWith(
      'Explorer Test',
      { kind: 'slot', node_id: 'node-external', slot_id: 'slot-external' },
      'tag-1',
      expect.any(Object)
    )

    const beforeRefresh = list.mock.calls.length
    await tagsPanel.get('.tag-refresh-button').trigger('click')
    await flushPromises()
    expect(list.mock.calls.length).toBeGreaterThan(beforeRefresh)

    list.mockRejectedValueOnce(new Error('Message list failed'))
    await tagsPanel.get('[aria-label="Tag target kind"]').setValue('message_buffer')
    await flushPromises()
    expect(tagsPanel.find('[aria-label="Target slot"]').exists()).toBe(false)
    expect(tagsPanel.find('[data-testid="tag-constructor-submit"]').exists()).toBe(true)
    expect(tagsPanel.find('[aria-label="Delete tag tag-1"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('PriorityTag')
    expect(wrapper.text()).toContain('Message list failed')
    expect(wrapper.text()).toContain('can be inserted and listed, but not deleted')

    await tagsPanel.get('[data-testid="tag-constructor-submit"]').trigger('click')
    await flushPromises()
    expect(attach).toHaveBeenLastCalledWith(
      'Explorer Test',
      { kind: 'message_buffer', node_id: 'node-external' },
      expect.objectContaining({ kind: 'named' }),
      expect.any(Object)
    )
    expect(tagsPanel.find('[aria-label="Delete tag tag-1"]').exists()).toBe(false)
  })

  it('lists an empty register while keeping all-slots attachment hidden', async () => {
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(wireCatalog)
    const list = vi.spyOn(api, 'listTags').mockResolvedValue({ success: true, entries: [] })
    const wrapper = mountPanel({
      projectData: {
        ...projectData,
        net: {
          ...projectData.net,
          nodes: [{ id: 'node-empty', name: 'Empty', data: { slots: [] } }]
        }
      }
    })
    await flushPromises()

    expect(list).toHaveBeenCalledWith(
      'Explorer Test',
      { kind: 'register', node_id: 'node-empty' },
      expect.any(Object)
    )
    const tagsPanel = wrapper.get('#tag-explorer-tags-panel')
    expect(tagsPanel.get('[aria-label="Target slot"]').findAll('option')).toHaveLength(1)
    expect(tagsPanel.find('#tag-add-heading').exists()).toBe(false)
    expect(tagsPanel.get('.tag-refresh-button').attributes()).not.toHaveProperty('disabled')
  })

  it('queries all slots or one slot non-consumingly and resets target scope with lifecycle changes', async () => {
    vi.spyOn(api, 'fetchTagTypes').mockResolvedValue(wireCatalog)
    const list = vi.spyOn(api, 'listTags').mockResolvedValue({ success: true, entries: [] })
    const query = vi.spyOn(api, 'queryTags').mockResolvedValue({
      success: true,
      entries: [{
        tag_id: 'query-result',
        kind: 'named',
        type_id: 'QuantumSavory.PriorityTag',
        display_name: 'PriorityTag',
        fields: [{ name: 'priority', type: 'Int64', value: 3, position: 1 }],
        rendered: 'Tag(PriorityTag(3))'
      }]
    })
    const wrapper = mountPanel()
    await flushPromises()

    const tagsTab = wrapper.get('#tag-explorer-tags-tab')
    await tagsTab.trigger('keydown', { key: 'ArrowRight' })
    const queriesTab = wrapper.get('#tag-explorer-queries-tab')
    expect(queriesTab.attributes('aria-selected')).toBe('true')
    expect(wrapper.get('#tag-explorer-queries-panel').isVisible()).toBe(true)
    const queryPanel = wrapper.get('#tag-explorer-queries-panel')
    const querySections = queryPanel.findAll('.tag-explorer-columns > section')
    expect(querySections[0].classes()).toContain('tag-constructor-column')
    expect(querySections[1].classes()).toContain('tag-results-column')

    await queryPanel.get('[data-testid="query-constructor-submit"]').trigger('click')
    await flushPromises()
    expect(query).toHaveBeenCalledWith(
      'Explorer Test',
      { kind: 'register', node_id: 'node-external' },
      expect.objectContaining({ fields: { priority: { kind: 'wildcard' } } }),
      expect.any(Object)
    )
    expect(wrapper.text()).toContain('Queries return all matches without consuming them')
    expect(wrapper.text()).toContain('PriorityTag')

    await queryPanel.get('[aria-label="Target slot"]').setValue('slot-external')
    await flushPromises()
    expect(wrapper.text()).not.toContain('PriorityTag')
    expect(queryPanel.get('.tag-refresh-button').attributes()).toHaveProperty('disabled')

    await queryPanel.get('[data-testid="query-constructor-submit"]').trigger('click')
    await flushPromises()
    expect(query).toHaveBeenLastCalledWith(
      'Explorer Test',
      { kind: 'slot', node_id: 'node-external', slot_id: 'slot-external' },
      expect.objectContaining({ fields: { priority: { kind: 'wildcard' } } }),
      expect.any(Object)
    )
    const queryCallsBeforeRefresh = query.mock.calls.length
    await queryPanel.get('.tag-refresh-button').trigger('click')
    await flushPromises()
    expect(query.mock.calls).toHaveLength(queryCallsBeforeRefresh + 1)
    expect(query.mock.calls.at(-1)[1]).toEqual({
      kind: 'slot',
      node_id: 'node-external',
      slot_id: 'slot-external'
    })

    await wrapper.setProps({ enabled: false })
    await flushPromises()
    expect(wrapper.get('[role="note"]').text()).toContain('live simulator tags')
    expect(wrapper.get('[role="status"]').text()).toContain('Parse a network')

    await wrapper.setProps({ enabled: true, projectName: 'New Project' })
    await flushPromises()
    expect(wrapper.get('#tag-explorer-tags-tab').attributes('aria-selected')).toBe('true')
    const resetTagsPanel = wrapper.get('#tag-explorer-tags-panel')
    expect(resetTagsPanel.get('[aria-label="Tag target kind"]').element.value).toBe('register')
    expect(resetTagsPanel.get('[aria-label="Target slot"]').element.value).toBe('')
    expect(list).toHaveBeenCalledWith(
      'New Project',
      { kind: 'register', node_id: 'node-external' },
      expect.any(Object)
    )
  })
})
