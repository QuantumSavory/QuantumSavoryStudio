import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import ProjectStore from '../../src/models/ProjectStore'
import { createEmptyProject } from '../../src/utils/projectDocument'

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

  it('moves a renamed project and preserves its identity metadata', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const project = createEmptyProject('Old Name')
      project.net.nodes.push({ data: { slots: [{}, {}], protocols: [{}] } })
      ProjectStore.openProject('Old Name', project)
      ProjectStore.setRecentProjectName('Old Name')

      vi.setSystemTime(new Date('2026-01-02T00:00:00Z'))
      const renamed = { ...project, name: 'New Name' }
      renamed.net.edges.push({ data: { protocols: [{}] } })
      ProjectStore.renameProject('Old Name', 'New Name', renamed)

      expect(ProjectStore.loadProject('Old Name')).toBeNull()
      expect(ProjectStore.loadProject('New Name')).toEqual(renamed)
      expect(ProjectStore.getRecentProjectName()).toBe('New Name')
      expect(ProjectStore.getMetadataIndex()).toEqual({
        'New Name': {
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          openedAt: '2026-01-01T00:00:00.000Z',
          nodeCount: 1,
          edgeCount: 1,
          slotCount: 2,
          protocolCount: 2,
        },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('rolls back the rename when browser storage rejects part of the move', () => {
    const project = createEmptyProject('Old Name')
    ProjectStore.openProject('Old Name', project)
    ProjectStore.setRecentProjectName('Old Name')
    const previousMetadata = localStorage.getItem('cqn_v2_projects_metadata_index')
    const setItem = localStorage.setItem.bind(localStorage)
    let rejected = false
    const storageSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'cqn_v2_recent_project_name' && !rejected) {
        rejected = true
        throw new DOMException('Storage full', 'QuotaExceededError')
      }
      setItem(key, value)
    })

    try {
      expect(() => ProjectStore.renameProject(
        'Old Name',
        'New Name',
        { ...project, name: 'New Name' }
      )).toThrow('Storage full')
    } finally {
      storageSpy.mockRestore()
    }

    expect(ProjectStore.loadProject('Old Name')).toEqual(project)
    expect(ProjectStore.loadProject('New Name')).toBeNull()
    expect(ProjectStore.getRecentProjectName()).toBe('Old Name')
    expect(localStorage.getItem('cqn_v2_projects_metadata_index')).toBe(previousMetadata)
  })

  it('stores metadata for project names inherited by ordinary objects', () => {
    const project = createEmptyProject('__proto__')

    ProjectStore.renameProject(null, '__proto__', project)

    const index = ProjectStore.getMetadataIndex()
    expect(Object.hasOwn(index, '__proto__')).toBe(true)
    expect(index['__proto__'].nodeCount).toBe(0)
  })
})
