import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import SystemInformationDialog from '../../src/components/SystemInformationDialog.vue'
import { frontendBuildInfo } from '../../src/utils/frontendBuildInfo.js'
import { backendPlatformInfo } from '../platformInfoFixtures.js'

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
  emits: ['click'],
  template: '<button @click="$emit(\'click\', $event)"><slot /></button>',
}

function mountDialog(platformInfo = null, extraProps = {}) {
  return mount(SystemInformationDialog, {
    props: { show: true, platformInfo, ...extraProps },
    global: {
      stubs: {
        AppDialog: AppDialogStub,
        AppButton: AppButtonStub,
      },
    },
  })
}

describe('SystemInformationDialog', () => {
  it('shows runtime, tracked source, tree hash, and exact frontend dependency data', () => {
    const wrapper = mountDialog(backendPlatformInfo({
      app: '1.8.0',
      quantumsavory: '0.7.0',
      trackedRevision: 'master',
    }))

    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('System Information')
    expect(wrapper.get('[data-testid="system-webquantumsavory-version"]').text()).toBe('1.8.0')
    expect(wrapper.get('[data-testid="system-julia-version"]').text()).toBe('1.12.1')
    expect(wrapper.get('[data-testid="system-genie-version"]').text()).toBe('5.33.8')
    expect(wrapper.get('[data-testid="system-quantumsavory-revision"]').text()).toBe('master')
    expect(wrapper.get('[data-testid="system-quantumsavory-tree-hash"]').text())
      .toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(wrapper.find('[data-testid="system-quantumsavory-commit"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="system-runtime-dependencies"]').text()).toContain('vue')
    expect(wrapper.get('[data-testid="system-development-dependencies"]').text()).toContain('vitest')

    const changelog = wrapper.get('[data-testid="system-changelog"]')
    expect(changelog.get('h1').text()).toBe('Changelog')
    expect(changelog.findAll('h2').map(heading => heading.text()))
      .toEqual(expect.arrayContaining([frontendBuildInfo.appVersion, '1.9.1']))
    expect(changelog.text()).toContain('project-persisted template-node slots')
  })

  it('retains frontend diagnostics when backend metadata is unavailable', () => {
    const wrapper = mountDialog()
    expect(wrapper.get('[data-testid="system-webquantumsavory-version"]').text()).not.toBe('Unknown')
    expect(wrapper.get('[data-testid="system-julia-version"]').text()).toBe('Unknown')
    expect(wrapper.get('[data-testid="system-runtime-dependencies"]').findAll('.system-dependency-row').length)
      .toBeGreaterThan(0)
  })

  it('emits close from the dialog action', async () => {
    const wrapper = mountDialog()
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('close')).toEqual([[]])
  })

  it('renders changelog content through the shared safe Markdown pipeline', () => {
    const wrapper = mountDialog(null, {
      changelogMarkdown: '# Changelog\n\n<script>alert(1)</script>',
    })
    const changelog = wrapper.get('[data-testid="system-changelog"]')

    expect(changelog.get('h1').text()).toBe('Changelog')
    expect(changelog.find('script').exists()).toBe(false)
    expect(changelog.text()).toContain('<script>alert(1)</script>')
  })
})
