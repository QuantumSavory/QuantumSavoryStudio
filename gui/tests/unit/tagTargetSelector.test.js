import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TagTargetSelector from '../../src/components/tags/TagTargetSelector.vue'

const nodes = [
  {
    id: 'node-alice',
    name: 'Alice',
    data: {
      slots: [
        { id: 'slot-a1', type: 'Qubit' },
        { id: 'slot-a2', type: 'Qubit' }
      ]
    }
  },
  {
    id: 'node-bob',
    name: 'Bob',
    data: { slots: [{ id: 'slot-b1', type: 'Qubit' }] }
  }
]

function lastTarget(wrapper) {
  return wrapper.emitted('update:modelValue').at(-1)[0]
}

describe('TagTargetSelector', () => {
  it('defaults Register to All slots and maps a selected slot to the slot wire target', async () => {
    const wrapper = mount(TagTargetSelector, {
      props: {
        modelValue: {
          kind: 'register',
          node_id: ''
        },
        nodes,
        allowMessages: true
      }
    })
    await flushPromises()

    expect(lastTarget(wrapper)).toEqual({ kind: 'register', node_id: 'node-alice' })
    await wrapper.setProps({ modelValue: lastTarget(wrapper) })

    expect(wrapper.get('[aria-label="Tag target kind"]').findAll('option').map(option => option.text()))
      .toEqual(['Register', 'Message Buffer'])
    expect(wrapper.get('[aria-label="Target slot"]').findAll('option').map(option => option.text()))
      .toEqual(['All slots', '1 · Qubit', '2 · Qubit'])
    expect(wrapper.get('[aria-label="Target slot"]').element.value).toBe('')

    await wrapper.get('[aria-label="Target slot"]').setValue('slot-a2')
    expect(lastTarget(wrapper)).toEqual({
      kind: 'slot',
      node_id: 'node-alice',
      slot_id: 'slot-a2'
    })
    await wrapper.setProps({ modelValue: lastTarget(wrapper) })

    expect(wrapper.get('[aria-label="Tag target kind"]').element.value).toBe('register')
    expect(wrapper.get('[aria-label="Target slot"]').element.value).toBe('slot-a2')

    await wrapper.get('[aria-label="Target slot"]').setValue('')
    expect(lastTarget(wrapper)).toEqual({ kind: 'register', node_id: 'node-alice' })
  })

  it('resets Register to All slots on node changes and gives Message Buffer no slot selector', async () => {
    const wrapper = mount(TagTargetSelector, {
      props: {
        modelValue: { kind: 'slot', node_id: 'node-alice', slot_id: 'slot-a1' },
        nodes,
        allowMessages: true
      }
    })

    await wrapper.get('[aria-label="Target node"]').setValue('node-bob')
    expect(lastTarget(wrapper)).toEqual({ kind: 'register', node_id: 'node-bob' })
    await wrapper.setProps({ modelValue: lastTarget(wrapper) })
    expect(wrapper.get('[aria-label="Target slot"]').element.value).toBe('')

    await wrapper.get('[aria-label="Tag target kind"]').setValue('message_buffer')
    expect(lastTarget(wrapper)).toEqual({ kind: 'message_buffer', node_id: 'node-bob' })
    await wrapper.setProps({ modelValue: lastTarget(wrapper) })
    expect(wrapper.find('[aria-label="Target slot"]').exists()).toBe(false)

    await wrapper.get('[aria-label="Tag target kind"]').setValue('register')
    expect(lastTarget(wrapper)).toEqual({ kind: 'register', node_id: 'node-bob' })
  })

  it('normalizes an unsupported Message Buffer target to Register and All slots', async () => {
    const wrapper = mount(TagTargetSelector, {
      props: {
        modelValue: { kind: 'message_buffer', node_id: 'node-alice' },
        nodes,
        allowMessages: false
      }
    })
    await flushPromises()

    expect(lastTarget(wrapper)).toEqual({ kind: 'register', node_id: 'node-alice' })
    expect(wrapper.get('[aria-label="Tag target kind"]').findAll('option').map(option => option.text()))
      .toEqual(['Register'])
    expect(wrapper.get('[aria-label="Target slot"]').findAll('option')[0].text()).toBe('All slots')
  })

  it('does not coerce numeric target IDs into schema-v2 string identities', async () => {
    const numericLookalikeNodes = [
      nodes[0],
      {
        id: '1',
        name: 'String One',
        data: { slots: [{ id: '2', type: 'Qubit' }] }
      }
    ]
    const wrapper = mount(TagTargetSelector, {
      props: {
        modelValue: { kind: 'slot', node_id: 1, slot_id: 2 },
        nodes: numericLookalikeNodes,
        allowMessages: true
      }
    })
    await flushPromises()

    expect(lastTarget(wrapper)).toEqual({
      kind: 'register',
      node_id: 'node-alice'
    })
    expect(wrapper.get('[aria-label="Target node"]').element.value).toBe('node-alice')
    expect(wrapper.get('[aria-label="Target slot"]').element.value).toBe('')
  })
})
