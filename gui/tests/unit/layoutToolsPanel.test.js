import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import LayoutToolsPanel from '../../src/components/panels/LayoutToolsPanel.vue'
import { api } from '../../src/utils/ApiConnector'

function mountPanel(options = {}) {
  return mount(LayoutToolsPanel, {
    ...options,
    props: {
      projectData: {
        variables: [],
        net: { nodes: [], edges: [] },
      },
      ...options.props,
    },
    global: {
      ...options.global,
      directives: {
        tooltip: () => {},
        ...options.global?.directives,
      },
    },
  })
}

describe('layout tools physical settings', () => {
  beforeEach(() => {
    api.updateConfig({
      slotTypes: [
        { type: 'Qubit', doc: 'Qubit register.' },
        { type: 'Qumode', doc: 'Qumode register.' },
      ],
      bgNoiseOptions: [
        api.getDefaultBgNoise(),
        {
          type: 'ThermalNoise',
          doc: 'Thermal background',
          parameters: [{
            field: 'rate',
            type: 'Float64',
            doc: 'Noise rate',
            required: false,
          }],
        },
      ],
    })
  })

  it('places full-width help before three focused tool cards', () => {
    const wrapper = mountPanel()
    const cards = wrapper.findAll('.layout-tools-card')

    expect(cards).toHaveLength(4)
    expect(cards.map(card => card.get('h3').text())).toEqual([
      'Help',
      'Physical Defaults',
      'Drawing Tools',
      'Helpers',
    ])
    expect(cards[0].classes()).toContain('help-card')
    expect(cards.slice(1).map(card => card.classes()[1])).toEqual([
      'defaults-card',
      'drawing-card',
      'helpers-card',
    ])
  })

  it('keeps the session badge toggle available while simulation editing is locked', async () => {
    const wrapper = mountPanel({
      props: {
        disabled: true,
        physicalConfig: { refractiveIndex: 1.468, lossDbPerKm: 0.2 },
        curveEditingEnabled: false,
        showPhysicalBadges: true,
      },
    })

    expect(wrapper.get('#default-refractive-index').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('#default-loss-db-per-km').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('.template-node .add-slot-btn').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('#curve-editing-enabled').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('#physical-badges-visible').attributes()).not.toHaveProperty('disabled')
    expect(wrapper.get('.annotation-button').attributes()).not.toHaveProperty('disabled')
    expect(wrapper.get('.annotation-button .lucide-message-square-plus').exists()).toBe(true)
    await wrapper.get('#physical-badges-visible').setValue(false)
    expect(wrapper.emitted('update:show-physical-badges')).toEqual([[false]])

    await wrapper.get('.annotation-button').trigger('click')
    expect(wrapper.emitted('add-annotation')).toEqual([[]])
    expect(wrapper.get('#layout-tools-disabled-help').text()).toContain('Annotations remain available')
  })

  it('renders descriptor units and emits validated partial physical-default changes', async () => {
    const wrapper = mountPanel({
      props: {
        physicalConfig: { refractiveIndex: 1.468, lossDbPerKm: 0.2 },
        curveEditingEnabled: false,
      },
    })
    const refractiveIndex = wrapper.get('#default-refractive-index')

    await refractiveIndex.setValue('-1')
    expect(wrapper.emitted('design-operations')).toBeUndefined()
    expect(refractiveIndex.element.value).toBe('1.468')

    await refractiveIndex.setValue('1.6')
    expect(wrapper.emitted('design-operations')[0][0]).toEqual([{
      kind: 'design.update',
      value: { physicalConfig: { refractiveIndex: 1.6 } },
    }])
    expect(wrapper.get('[data-quantity="lossDbPerKm"] .quantity-field__unit').text())
      .toBe('dB/km')
    await wrapper.get('#default-loss-db-per-km').setValue('0.18')
    expect(wrapper.emitted('design-operations')[1][0]).toEqual([{
      kind: 'design.update',
      value: { physicalConfig: { lossDbPerKm: 0.18 } },
    }])
    await wrapper.get('#curve-editing-enabled').setValue(true)
    expect(wrapper.emitted('update:curve-editing-enabled')).toEqual([[true]])
  })

  it('offers a slot-only template node through the shared slot editor', async () => {
    const wrapper = mountPanel({
      props: {
        physicalConfig: {
          refractiveIndex: 1.468,
          lossDbPerKm: 0.2,
          nodeTemplate: {
            slots: [{
              id: 'template_slot',
              type: 'Qubit',
              backgroundNoise: { type: 'default', parameters: [] },
            }],
          },
        },
      },
    })
    const template = wrapper.get('.template-node')

    expect(template.get('h4').text()).toBe('Template node')
    expect(template.find('[aria-label="Show results"]').exists()).toBe(false)
    expect(template.find('input[type="text"]').exists()).toBe(false)
    expect(template.text()).not.toContain('Protocols')

    await template.get('.add-slot-btn').trigger('click')
    expect(wrapper.emitted('design-operations')[0][0]).toEqual([{
      kind: 'slots.create',
      template: true,
      value: {
        type: 'Qubit',
        backgroundNoise: {
          type: 'default',
          parameters: [],
        },
      },
    }])

    await template.get('.slot-icon').trigger('click')
    expect(wrapper.emitted('design-operations')[1][0]).toEqual([{
      kind: 'slots.update',
      template: true,
      slot_id: 'template_slot',
      value: { type: 'Qumode' },
    }])

    await template.get('.bg-noise-select').setValue('ThermalNoise')
    expect(wrapper.emitted('design-operations')[2][0]).toEqual([{
      kind: 'slots.update',
      template: true,
      slot_id: 'template_slot',
      value: {
        backgroundNoise: {
          type: 'ThermalNoise',
          doc: 'Thermal background',
          parameters: [{
            field: 'rate',
            type: 'Float64',
            selectedType: 'default',
            value: null,
          }],
        },
      },
    }])

    await template.get('[aria-label="Delete slot"]').trigger('click')
    expect(wrapper.emitted('design-operations')[3][0]).toEqual([{
      kind: 'slots.remove',
      template: true,
      slot_id: 'template_slot',
    }])
  })

  it('shows drawing-control help on pointer hover and keyboard focus', async () => {
    const wrapper = mountPanel({
      props: { annotationCreationEnabled: true },
    })
    const helpTitle = () => wrapper.get('#layout-tools-help-title').text()

    const curveField = wrapper.get('label[for="curve-editing-enabled"]')
    await curveField.trigger('mouseenter')
    expect(helpTitle()).toBe('Curve mode')
    await curveField.trigger('mouseleave')
    expect(helpTitle()).toBe('Help')
    await wrapper.get('#curve-editing-enabled').trigger('focusin')
    expect(helpTitle()).toBe('Curve mode')
    await wrapper.get('#curve-editing-enabled').trigger('focusout')
    expect(helpTitle()).toBe('Help')

    const badgesField = wrapper.get('label[for="physical-badges-visible"]')
    await badgesField.trigger('mouseenter')
    expect(helpTitle()).toBe('Distance and delay badges')
    await badgesField.trigger('mouseleave')
    await wrapper.get('#physical-badges-visible').trigger('focusin')
    expect(helpTitle()).toBe('Distance and delay badges')
    await wrapper.get('#physical-badges-visible').trigger('focusout')

    const annotationButton = wrapper.get('.annotation-button')
    expect(annotationButton.attributes('aria-pressed')).toBe('true')
    expect(annotationButton.classes()).toContain('active')
    await annotationButton.trigger('mouseenter')
    expect(helpTitle()).toBe('Add Annotation')
    await annotationButton.trigger('mouseleave')
    await annotationButton.trigger('focus')
    expect(helpTitle()).toBe('Add Annotation')
    await annotationButton.trigger('blur')
    expect(helpTitle()).toBe('Help')
  })

  it.each([
    'Repeater Chain Generator',
    'Star Network Generator',
    'Graph Network Generator',
  ])('shows live help for %s on hover and focus', async label => {
    const wrapper = mountPanel()
    const button = wrapper.findAll('.helpers-card .helper-button')
      .find(candidate => candidate.text().includes(label))

    await button.trigger('mouseenter')
    expect(wrapper.get('#layout-tools-help-title').text()).toBe(label)
    expect(wrapper.get('.helper-description').text().length).toBeGreaterThan(0)
    await button.trigger('mouseleave')
    expect(wrapper.get('#layout-tools-help-title').text()).toBe('Help')

    await button.trigger('focus')
    expect(wrapper.get('#layout-tools-help-title').text()).toBe(label)
    await button.trigger('blur')
    expect(wrapper.get('#layout-tools-help-title').text()).toBe('Help')
  })
})
