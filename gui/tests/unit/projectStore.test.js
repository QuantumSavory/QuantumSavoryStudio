import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ProjectStore from '../../src/models/ProjectStore'

beforeEach(() => localStorage.clear())
afterEach(() => vi.useRealTimers())

function projectData({
  nodes = [],
  edges = [],
  protocols = [],
} = {}) {
  return { net: { nodes, edges, protocols } }
}

describe('ProjectStore recent project ownership', () => {
  it('reads, writes, and clears the existing recent-project storage key', () => {
    expect(ProjectStore.getRecentProjectName()).toBeNull()

    ProjectStore.setRecentProjectName('Project A')
    expect(ProjectStore.getRecentProjectName()).toBe('Project A')
    expect(localStorage.getItem('recentProjectName')).toBe('Project A')

    ProjectStore.clearRecentProjectName()
    expect(ProjectStore.getRecentProjectName()).toBeNull()
    expect(localStorage.getItem('recentProjectName')).toBeNull()
  })

  it('maintains metadata for current save, open, and delete operations', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-07-31T05:00:00.000Z')
    const project = projectData({
      nodes: [{ data: { slots: [{}], protocols: [{}] } }],
      edges: [{ data: { protocols: [{}] } }],
      protocols: [{}],
    })

    ProjectStore.saveProject('Project A', project)
    expect(ProjectStore.listProjects()).toEqual(['Project A'])
    expect(ProjectStore.getMetadataIndex()['Project A']).toEqual({
      createdAt: '2026-07-31T05:00:00.000Z',
      updatedAt: '2026-07-31T05:00:00.000Z',
      nodeCount: 1,
      edgeCount: 1,
      slotCount: 1,
      protocolCount: 3,
    })

    vi.setSystemTime('2026-07-31T05:01:00.000Z')
    ProjectStore.openProject('Project A', project)
    expect(ProjectStore.getRecentProjects()).toEqual([{
      name: 'Project A',
      metadata: {
        createdAt: '2026-07-31T05:00:00.000Z',
        updatedAt: '2026-07-31T05:01:00.000Z',
        openedAt: '2026-07-31T05:01:00.000Z',
        nodeCount: 1,
        edgeCount: 1,
        slotCount: 1,
        protocolCount: 3,
      },
    }])

    ProjectStore.deleteProject('Project A')
    expect(ProjectStore.listProjects()).toEqual([])
    expect(ProjectStore.getMetadataIndex()).toEqual({})
  })

  it('lists an unindexed current document without rebuilding persisted metadata', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-07-31T05:02:00.000Z')
    localStorage.setItem('cqn_project_Unindexed', JSON.stringify(projectData()))

    expect(ProjectStore.getRecentProjects()).toEqual([{
      name: 'Unindexed',
      metadata: {
        createdAt: '2026-07-31T05:02:00.000Z',
        updatedAt: '2026-07-31T05:02:00.000Z',
        openedAt: null,
        nodeCount: 0,
        edgeCount: 0,
        slotCount: 0,
        protocolCount: 0,
      },
    }])
    expect(localStorage.getItem('cqn_projects_metadata_index')).toBeNull()
  })
})
