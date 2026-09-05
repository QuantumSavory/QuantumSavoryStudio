import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import GraphNetworkDialog from '../../src/components/GraphNetworkDialog.vue'
import ProjectNameDialog from '../../src/components/ProjectNameDialog.vue'
import RepeaterChainDialog from '../../src/components/RepeaterChainDialog.vue'
import StarNetworkDialog from '../../src/components/StarNetworkDialog.vue'
import LayoutGeneratorDialog from '../../src/components/ui/LayoutGeneratorDialog.vue'
import LayoutGeneratorHelp from '../../src/components/ui/LayoutGeneratorHelp.vue'

vi.mock('maplibre-gl', () => {
  class MercatorCoordinate {
    constructor(x, y) {
      this.x = x
      this.y = y
    }

    static fromLngLat({ lng, lat }) {
      return new MercatorCoordinate((lng + 180) / 360, (90 - lat) / 180)
    }

    toLngLat() {
      return {
        lng: (this.x * 360) - 180,
        lat: 90 - (this.y * 180)
      }
    }
  }

  return { MercatorCoordinate }
})

const AppDialogStub = {
  template: '<section><slot /><footer><slot name="footer" /></footer></section>'
}

const AppButtonStub = {
  props: {
    type: { type: String, default: 'button' },
    disabled: { type: Boolean, default: false }
  },
  template: '<button :type="type" :disabled="disabled"><slot /></button>'
}

const mountDialog = (component, props) => mount(component, {
  props: { show: true, ...props },
  attachTo: document.body,
  global: {
    directives: {
      tooltip: {
        beforeMount(element, binding) {
          element.dataset.tooltip = binding.value
        }
      }
    },
    stubs: {
      AppDialog: AppDialogStub,
      AppButton: AppButtonStub
    }
  }
})

const nodes = [
  { id: 'start', name: 'Start', position: [-72, 42] },
  { id: 'end', name: 'End', position: [-71, 42] },
  { id: 'template', name: 'Template', position: [-71.5, 42.5] },
  { id: 'anchor', name: 'Anchor', position: [-71.4, 42.4] }
]

const templateEdge = {
  id: 'template-edge',
  source: nodes[2],
  target: nodes[0]
}

let wrappers = []

beforeAll(() => {
  const values = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: key => values.has(key) ? values.get(key) : null,
      removeItem: key => values.delete(key),
      setItem: (key, value) => values.set(key, String(value))
    }
  })
})

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  wrappers = []
})

async function clickSubmit(wrapper) {
  wrapper.get('button[type="submit"]').element.click()
  await nextTick()
}

function expectSharedGeneratorFrame(wrapper, {
  formId,
  title,
  description,
  submitLabel,
  helpText
}) {
  const dialog = wrapper.getComponent(LayoutGeneratorDialog)
  expect(dialog.props()).toMatchObject({
    formId,
    title,
    description,
    submitLabel,
    width: 'min(640px, calc(100vw - 32px))'
  })

  const form = wrapper.get(`#${formId}`)
  const sections = Array.from(form.element.children)
    .map(element => element.dataset.layoutSection)
    .filter(Boolean)
  expect(sections).toEqual(['description', 'fields', 'validation', 'help'])

  const help = wrapper.getComponent(LayoutGeneratorHelp)
  const note = help.get('[role="note"]')
  const headingId = note.attributes('aria-labelledby')
  expect(headingId).toBeTruthy()
  expect(document.getElementById(headingId)?.textContent).toBe('Template behavior')
  expect(note.text()).toContain(helpText)

  const buttons = wrapper.findAll('footer button')
  expect(buttons).toHaveLength(2)
  expect(buttons[0].text()).toBe('Cancel')
  expect(buttons[0].attributes('type')).toBe('button')
  expect(buttons[1].text()).toBe(submitLabel)
  expect(buttons[1].attributes()).toMatchObject({ type: 'submit', form: formId })
}

describe('dialog form submission', () => {
  it('emits one project-name confirmation while it remains mounted', async () => {
    const wrapper = mountDialog(ProjectNameDialog)
    wrappers.push(wrapper)

    await wrapper.get('input').setValue('  New project  ')
    await clickSubmit(wrapper)

    expect(wrapper.emitted('confirm')).toEqual([['New project']])
    expect(wrapper.exists()).toBe(true)
  })

  it('emits one repeater-chain confirmation while it remains mounted', async () => {
    const wrapper = mountDialog(RepeaterChainDialog, {
      nodes,
      edges: [templateEdge]
    })
    wrappers.push(wrapper)

    await wrapper.get('#chain-start-node').setValue('start')
    await wrapper.get('#chain-end-node').setValue('end')
    await wrapper.get('#chain-template-node').setValue('template')
    await clickSubmit(wrapper)

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.exists()).toBe(true)
  })

  it('emits one star-network confirmation while it remains mounted', async () => {
    const starNodes = nodes.slice(0, 2)
    const starEdge = { id: 'star-edge', source: starNodes[0], target: starNodes[1] }
    const wrapper = mountDialog(StarNetworkDialog, {
      nodes: starNodes,
      edges: [starEdge]
    })
    wrappers.push(wrapper)

    await wrapper.get('#star-center-node').setValue('start')
    await wrapper.get('#star-peripheral-node').setValue('end')
    await wrapper.get('#star-template-edge').setValue('star-edge')
    await clickSubmit(wrapper)

    expect(wrapper.emitted('confirm')).toEqual([[
      {
        centerNodeId: 'start',
        peripheralNodeId: 'end',
        templateEdgeId: 'star-edge',
        peripheralCount: 4
      }
    ]])
    expect(wrapper.exists()).toBe(true)
  })

  it('emits one graph-network confirmation while it remains mounted', async () => {
    const graphNodes = nodes.slice(0, 2)
    const graphEdge = { id: 'graph-edge', source: graphNodes[0], target: graphNodes[1] }
    const wrapper = mountDialog(GraphNetworkDialog, {
      nodes: graphNodes,
      edges: [graphEdge]
    })
    wrappers.push(wrapper)

    await wrapper.get('#graph-template-node').setValue('start')
    await wrapper.get('#graph-template-edge').setValue('graph-edge')
    await clickSubmit(wrapper)

    expect(wrapper.emitted('confirm')).toEqual([[
      {
        templateNodeId: 'start',
        templateEdgeId: 'graph-edge',
        topology: 'grid',
        xCount: 3,
        yCount: 2,
        nodeCount: 4
      }
    ]])
    expect(wrapper.exists()).toBe(true)
  })

  it('uses the shared accessible frame for the star generator', async () => {
    const starNodes = nodes.slice(0, 2)
    const starEdge = { id: 'star-edge', source: starNodes[0], target: starNodes[1] }
    const wrapper = mountDialog(StarNetworkDialog, {
      nodes: starNodes,
      edges: [starEdge]
    })
    wrappers.push(wrapper)

    await wrapper.get('#star-center-node').setValue('start')

    expectSharedGeneratorFrame(wrapper, {
      formId: 'star-network-form',
      title: 'Star Network Generator',
      description: 'Replace one peripheral template with evenly spaced copies around a center node.',
      submitLabel: 'Generate Star',
      helpText: 'remaining nodes rotate counterclockwise around the center'
    })
    expect(wrapper.get('[role="alert"]').text()).toContain('peripheral template node')
  })

  it('uses the shared accessible frame for the graph generator', async () => {
    const graphNodes = nodes.slice(0, 2)
    const graphEdge = { id: 'graph-edge', source: graphNodes[0], target: graphNodes[1] }
    const wrapper = mountDialog(GraphNetworkDialog, {
      nodes: graphNodes,
      edges: [graphEdge]
    })
    wrappers.push(wrapper)

    await wrapper.get('#graph-template-node').setValue('start')

    expectSharedGeneratorFrame(wrapper, {
      formId: 'graph-network-form',
      title: 'Graph Network Generator',
      description: 'Replace an isolated template edge and its endpoints with a grid or all-to-all network.',
      submitLabel: 'Generate Graph',
      helpText: 'edge endpoints define the first two positions'
    })
    expect(wrapper.get('[role="alert"]').text()).toContain('edge template')
  })
})
