import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import ProtocolsManager from '../../src/components/panels/ProtocolsManager.vue'
import { UI_SERVICES_KEY } from '../../src/composables/uiServices.js'
import { api } from '../../src/utils/ApiConnector.js'

const originalConfig = api._config.value

const MenuStub = {
  props: ['model'],
  methods: { toggle() {} },
  template: `
    <div class="menu-stub">
      <button
        v-for="item in model"
        :key="item.value"
        class="menu-item"
        @click="item.command()"
      >{{ item.label }}</button>
    </div>
  `,
}

const ProtocolConstructorFormStub = {
  props: ['protocol'],
  emits: ['commit'],
  methods: {
    complete() {
      this.protocol.parameters[0].value = [2]
      this.protocol.parameters[1].value = [0.5]
      this.$emit('commit')
    },
    link() {
      this.protocol.parameters[0].value = { kind: 'variable', id: 'clients' }
      this.protocol.parameters[1].value = [0.5]
      this.$emit('commit')
    },
  },
  template: `
    <button
      class="complete-required"
      @click="complete"
    >Complete required inputs</button>
    <button class="link-required" @click="link">Link required input</button>
  `,
}

function mountManager({ protocols = [], variables = [] } = {}) {
  return mount(ProtocolsManager, {
    props: {
      protocols,
      protocolGroupName: 'node',
      protocolClass: class TestProtocol {},
      ownerId: 'switch',
      variables,
    },
    global: {
      provide: {
        [UI_SERVICES_KEY]: { showAlert: vi.fn() },
      },
      stubs: {
        Menu: MenuStub,
        ProtocolEditor: true,
        ProtocolConstructorForm: ProtocolConstructorFormStub,
      },
    },
  })
}

beforeEach(() => {
  api._config.value = {
    protocolTypes: {
      node: [{
        type: 'SimpleSwitchDiscreteProt',
        doc: 'Switch.',
        group: 'node',
        virtual: null,
        parameters: [{
          field: 'clientnodes',
          type: 'Vector{Int64}',
          doc: 'Clients.',
          required: true,
          min: null,
          max: null,
        }, {
          field: 'success_probs',
          type: 'Vector{Float64}',
          doc: 'Probabilities.',
          required: true,
          min: null,
          max: null,
        }],
      }],
      edge: [],
      floating: [],
    },
  }
})

afterAll(() => {
  api._config.value = originalConfig
})

describe('ProtocolsManager required constructor drafts', () => {
  it('does not emit create until the transient required draft is complete', async () => {
    const wrapper = mountManager()

    await wrapper.get('.menu-item').trigger('click')
    expect(wrapper.get('[data-testid="add-protocol-draft"]').exists()).toBe(true)
    expect(wrapper.emitted('designOperations')).toBeUndefined()
    expect(wrapper.get('.add-pending-protocol').attributes('disabled')).toBeDefined()

    await wrapper.get('.complete-required').trigger('click')
    await nextTick()
    expect(wrapper.get('.add-pending-protocol').attributes('disabled')).toBeUndefined()
    await wrapper.get('.add-pending-protocol').trigger('click')

    const [operations, committed] = wrapper.emitted('designOperations')[0]
    expect(operations).toEqual([expect.objectContaining({
      kind: 'protocols.create',
      placement: 'node',
      owner_id: 'switch',
      value: {
        type: 'SimpleSwitchDiscreteProt',
        parameters: [{
          name: 'clientnodes',
          type: 'Vector{Int64}',
          selectedType: 'Vector{Int64}',
          value: [2],
        }, {
          name: 'success_probs',
          type: 'Vector{Float64}',
          selectedType: 'Vector{Float64}',
          value: [0.5],
        }],
      },
    })])
    expect(wrapper.props('protocols')).toEqual([])

    committed()
    await nextTick()
    expect(wrapper.find('[data-testid="add-protocol-draft"]').exists()).toBe(false)
  })

  it('disables create when a linked required Variable becomes Default', async () => {
    const wrapper = mountManager({
      variables: [{
        id: 'clients',
        type: 'Vector{Int64}',
        selectedType: 'Vector{Int64}',
        value: [2],
      }],
    })

    await wrapper.get('.menu-item').trigger('click')
    await wrapper.get('.link-required').trigger('click')
    await nextTick()
    expect(wrapper.get('.add-pending-protocol').attributes('disabled')).toBeUndefined()

    await wrapper.setProps({
      variables: [{
        id: 'clients',
        type: 'default',
        selectedType: 'default',
        value: null,
      }],
    })
    expect(wrapper.get('.add-pending-protocol').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('designOperations')).toBeUndefined()
  })
})
