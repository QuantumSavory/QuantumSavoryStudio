import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import HelpCallout from '../../src/components/ui/HelpCallout.vue'

describe('HelpCallout', () => {
  it('labels detailed guidance uniquely and leaves brief guidance unlabelled', () => {
    const wrapper = mount({
      components: { HelpCallout },
      template: `
        <div>
          <HelpCallout title="First guide" variant="detailed">
            <p>First guidance.</p>
          </HelpCallout>
          <HelpCallout title="Second guide" variant="detailed">
            <ul><li>Second guidance.</li></ul>
          </HelpCallout>
          <HelpCallout>Brief guidance with <code>context</code>.</HelpCallout>
        </div>
      `,
    })

    const notes = wrapper.findAll('[role="note"]')
    const headings = wrapper.findAll('h3')
    const headingIds = headings.map(heading => heading.attributes('id'))

    expect(notes).toHaveLength(3)
    expect(new Set(headingIds).size).toBe(2)
    expect(notes.slice(0, 2).map(note => note.attributes('aria-labelledby')))
      .toEqual(headingIds)
    expect(headings.map(heading => heading.text())).toEqual(['First guide', 'Second guide'])
    expect(notes[1].get('li').text()).toBe('Second guidance.')
    expect(notes[2].attributes()).not.toHaveProperty('aria-labelledby')
    expect(notes[2].get('code').text()).toBe('context')
  })
})
