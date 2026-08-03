import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import ProjectStore from '../../src/models/ProjectStore'

beforeAll(() => {
  const values = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear() {
        for (const key of values.keys()) delete this[key]
        values.clear()
      },
      getItem: key => values.has(key) ? values.get(key) : null,
      removeItem(key) {
        values.delete(key)
        delete this[key]
      },
      setItem(key, value) {
        const stored = String(value)
        values.set(key, stored)
        Object.defineProperty(this, key, {
          configurable: true,
          enumerable: true,
          value: stored,
        })
      }
    }
  })
})

beforeEach(() => localStorage.clear())

describe('ProjectStore v2 namespace', () => {
  it('reads, writes, and clears only the v2 recent-project storage key', () => {
    localStorage.setItem('recentProjectName', 'Legacy Project')
    expect(ProjectStore.getRecentProjectName()).toBeNull()

    ProjectStore.setRecentProjectName('Project A')
    expect(ProjectStore.getRecentProjectName()).toBe('Project A')
    expect(localStorage.getItem('cqn_v2_recent_project_name')).toBe('Project A')
    expect(localStorage.getItem('recentProjectName')).toBe('Legacy Project')

    ProjectStore.clearRecentProjectName()
    expect(ProjectStore.getRecentProjectName()).toBeNull()
    expect(localStorage.getItem('cqn_v2_recent_project_name')).toBeNull()
    expect(localStorage.getItem('recentProjectName')).toBe('Legacy Project')
  })

  it('keeps legacy projects invisible and untouched', () => {
    localStorage.setItem('cqn_project_Old', '{"schemaVersion":1}')
    localStorage.setItem('cqn_projects_metadata_index', '{"Old":{}}')

    expect(ProjectStore.listProjects()).toEqual([])
    ProjectStore.saveProject('New', { schemaVersion: 2, net: {} })

    expect(ProjectStore.listProjects()).toEqual(['New'])
    expect(localStorage.getItem('cqn_project_Old')).toBe('{"schemaVersion":1}')
    expect(localStorage.getItem('cqn_projects_metadata_index')).toBe('{"Old":{}}')
  })
})
