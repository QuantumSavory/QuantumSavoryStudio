import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import NodePanel from '../../src/components/panels/NodePanel.vue'
import Node from '../../src/models/Node'
import { UI_SERVICES_KEY } from '../../src/composables/uiServices'
import { api } from '../../src/utils/ApiConnector'
import { createEmptyProject } from '../../src/utils/projectCodec'

const MenuStub = {
  props: ['model'],
  methods: {
    show() {},
    hide() {},
  },
  template: `
    <div class="menu-stub">
      <button
        v-for="item in model"
        :key="item.label"
        type="button"
        @click="item.command()"
      >
        {{ item.label }}
      </button>
    </div>
  `,
}

function mountPanel() {
  const project = createEmptyProject('Node background drafts')
  const node = new Node({
    id: 'node_a',
    name: 'Node A',
    position: [-72, 42],
    data: {
      protocols: [],
      slots: [{
        id: 'slot_1',
        type: 'Qubit',
        backgroundNoise: api.getDefaultBgNoise(),
      }, {
        id: 'slot_2',
        type: 'Qubit',
        backgroundNoise: api.getDefaultBgNoise(),
      }],
    },
  })
  project.net.nodes.push(node)

  return mount(NodePanel, {
    props: {
      node,
      nodeIndex: 1,
      projectData: project,
      variables: [],
    },
    global: {
      provide: {
        [UI_SERVICES_KEY]: {
          showAlert: vi.fn(),
        },
      },
      directives: {
        tooltip: () => {},
      },
      stubs: {
        Menu: MenuStub,
        ProtocolsManager: true,
        SlotEditor: {
          emits: ['delete-slot', 'toggle-details'],
          template: `
            <button
              type="button"
              aria-label="Toggle details"
              @click="$emit('toggle-details')"
            />
          `,
        },
      },
    },
  })
}

async function configureBackgroundExpression(container, source) {
  await container.get('.bg-noise-select').setValue('T1Decay')
  const parameter = container.get('.param-item')
  await parameter.get('[data-testid="parameter-option-selector"]')
    .setValue('expression:Float64')
  await parameter.get('[data-testid="numeric-expression-source"]').setValue(source)
  await parameter.get('[aria-label="Validate t1 expression"]').trigger('click')
  await flushPromises()
}

function buttonNamed(container, name) {
  return container.findAll('button').find(button => button.text() === name)
}

describe('NodePanel background constructor drafts', () => {
  beforeEach(() => {
    api.updateConfig({
      slotTypes: ['Qubit', 'Qumode'],
      bgNoiseOptions: [
        api.getDefaultBgNoise(),
        {
          type: 'T1Decay',
          doc: 'Node-local T1 decay.',
          parameters: [{
            field: 't1',
            type: 'Float64',
            min: 0,
            doc: 'Decay time.',
          }],
        },
      ],
    })
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    vi.spyOn(api, 'validateNumericExpression').mockResolvedValue({
      success: true,
      results: {
        deferred: false,
        target_type: 'Float64',
        value: '2.0',
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('offers no slot or background fallback before simulator catalogs load', async () => {
    api.updateConfig({
      slotTypes: [],
      bgNoiseOptions: [],
    })
    const wrapper = mountPanel()

    const addSlot = wrapper.get('.add-slot-btn')
    expect(addSlot.attributes('disabled')).toBeDefined()
    await addSlot.trigger('click')
    expect(wrapper.emitted('design-operations')).toBeUndefined()

    await wrapper.get('.menu-stub button:nth-child(2)').trigger('click')
    const form = wrapper.get('.add-n-slots-form')
    expect(form.get('.bg-noise-select').attributes('disabled')).toBeDefined()
    expect(form.findAll('.bg-noise-select option')).toHaveLength(0)
    const addMany = buttonNamed(form, 'Add 1 Slot')
    expect(addMany.attributes('disabled')).toBeDefined()
    await addMany.trigger('click')
    expect(wrapper.emitted('design-operations')).toBeUndefined()
  })

  it('fails closed when the slot catalog is malformed', async () => {
    api.updateConfig({
      slotTypes: { type: 'Qubit' },
    })
    const wrapper = mountPanel()

    const addSlot = wrapper.get('.add-slot-btn')
    expect(addSlot.attributes('disabled')).toBeDefined()
    await addSlot.trigger('click')
    expect(wrapper.emitted('design-operations')).toBeUndefined()
  })

  it('uses concrete node context and clones validated add-many backgrounds', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.menu-stub button:nth-child(2)').trigger('click')
    const form = wrapper.get('.add-n-slots-form')
    await form.get('.number-input').setValue('2')
    await configureBackgroundExpression(form, 'self + nodeid("Node A")')

    expect(api.validateNumericExpression).toHaveBeenLastCalledWith(
      'self + nodeid("Node A")',
      'Float64',
      'node',
      expect.objectContaining({
        context: {
          node_names: ['Node A'],
          self: 1,
        },
      }),
    )

    await buttonNamed(form, 'Add 2 Slots').trigger('click')
    const operations = wrapper.emitted('design-operations').at(-1)[0]
    expect(operations).toHaveLength(2)
    expect(operations.map(operation => operation.value.backgroundNoise.parameters[0]))
      .toEqual(Array(2).fill({
        field: 't1',
        type: 'Float64',
        doc: 'Decay time.',
        selectedType: 'expression:Float64',
        value: {
          kind: 'numeric_expression',
          source: 'self + nodeid("Node A")',
        },
      }))
    expect(operations[0].value.backgroundNoise)
      .not.toBe(operations[1].value.backgroundNoise)
  })

  it('marks background edits and applies independent batch drafts', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.menu-stub button:nth-child(3)').trigger('click')
    const form = wrapper.get('.batch-edit-form')
    const checkboxes = wrapper.findAll('.slot-checkbox')
    await checkboxes[0].setValue(true)
    await checkboxes[1].setValue(true)
    await configureBackgroundExpression(form, '2 * self')

    expect(form.text()).toContain('Properties to change: backgroundNoise')
    await buttonNamed(form, 'Apply to 2 Slots').trigger('click')

    const operations = wrapper.emitted('design-operations').at(-1)[0]
    expect(operations.map(operation => operation.slot_id)).toEqual(['slot_1', 'slot_2'])
    expect(operations.every(operation => (
      operation.value.backgroundNoise.parameters[0].value.source === '2 * self'
    ))).toBe(true)
    expect(operations[0].value.backgroundNoise)
      .not.toBe(operations[1].value.backgroundNoise)
  })

  it('refreshes an expanded draft after an authoritative background update', async () => {
    const wrapper = mountPanel()
    const node = wrapper.props('node')
    node.data.slots[0].backgroundNoise = {
      type: 'T1Decay',
      parameters: [{
        field: 't1',
        type: 'Float64',
        selectedType: 'Float64',
        value: 0.25,
      }],
    }
    await flushPromises()

    await wrapper.findAll('[aria-label="Toggle details"]')[0].trigger('click')
    const expanded = wrapper.get('.slot-row-expanded')
    expect(expanded.get('input[type="number"]').element.value).toBe('0.25')

    node.data.slots[0].backgroundNoise.parameters[0].value = 0.75
    await flushPromises()
    expect(expanded.get('input[type="number"]').element.value).toBe('0.75')

    await expanded.get('input[type="number"]').setValue('0.5')
    const operation = wrapper.emitted('design-operations').at(-1)[0][0]
    expect(operation).toMatchObject({
      kind: 'slots.update',
      node_id: 'node_a',
      slot_id: 'slot_1',
      value: {
        backgroundNoise: {
          type: 'T1Decay',
          parameters: [{
            field: 't1',
            selectedType: 'Float64',
            value: 0.5,
          }],
        },
      },
    })
  })
})
