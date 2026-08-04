import { afterEach, describe, expect, it, vi } from 'vitest'

import { useImportExport } from '../../src/composables/useImportExport'
import ProjectStore from '../../src/models/ProjectStore'
import {
  createEmptyProject,
  decodeProject,
  encodeProject,
} from '../../src/utils/projectDocument.js'

function importProject(overrides = {}) {
  return { ...encodeProject(createEmptyProject('Imported Project')), ...overrides }
}

function createHarness() {
  const importIntoSession = vi.fn(async () => true)
  const showAlert = vi.fn()
  const composable = useImportExport({
    currentProjectName: { value: 'Current' },
    importedProjectData: { value: null },
    conflictProjectName: { value: '' },
    showImportConflictDialog: { value: false },
    addLog: vi.fn(),
    importIntoSession,
    serializeProjectData: vi.fn(),
    deserializeProjectData: document => decodeProject(document).project,
    showAlert,
  })
  return { composable, importIntoSession, showAlert }
}

afterEach(() => vi.restoreAllMocks())

describe('project-v2 import admission', () => {
  it('validates and clones a canonical document without mutating imported input', async () => {
    vi.spyOn(ProjectStore, 'listProjects').mockReturnValue([])
    const harness = createHarness()
    const raw = importProject({
      annotations: [{
        id: 'annotation_imported',
        markdown: 'Imported $x$',
        bounds: { west: -3, south: -2, east: 3, north: 2 },
        backgroundColor: '#ffffff',
        borderColor: '#123abc',
        area: { freeCorner: [4, 3] },
      }],
    })
    const original = structuredClone(raw)

    expect(await harness.composable.validateAndProcessImport(raw)).toBe(true)

    expect(raw).toEqual(original)
    const imported = harness.importIntoSession.mock.calls[0][0]
    expect(imported.name).toBe('Imported Project')
    expect(imported.annotations).toEqual([{
      id: 'annotation_imported',
      markdown: 'Imported $x$',
      bounds: { west: -3, south: -2, east: 3, north: 2 },
      backgroundColor: '#ffffff',
      borderColor: '#123abc',
      area: { freeCorner: [4, 3] },
    }])
    expect(imported.annotations).not.toBe(raw.annotations)
  })

  it('rejects v1 before storage lookup or session work', async () => {
    const listProjects = vi.spyOn(ProjectStore, 'listProjects').mockReturnValue([])
    const harness = createHarness()
    const raw = { ...importProject(), schemaVersion: 1 }

    expect(await harness.composable.validateAndProcessImport(raw)).toBeUndefined()
    expect(listProjects).not.toHaveBeenCalled()
    expect(harness.importIntoSession).not.toHaveBeenCalled()
    expect(harness.showAlert).toHaveBeenCalledWith(
      'Import failed',
      expect.stringMatching(/unsupported project contract version/i),
    )
  })

  it('rejects noncanonical fields before changing the session', async () => {
    const listProjects = vi.spyOn(ProjectStore, 'listProjects').mockReturnValue([])
    const harness = createHarness()
    const raw = { ...importProject(), runtimeState: {} }

    await harness.composable.validateAndProcessImport(raw)

    expect(listProjects).not.toHaveBeenCalled()
    expect(harness.importIntoSession).not.toHaveBeenCalled()
    expect(harness.showAlert).toHaveBeenCalledWith(
      'Import failed',
      expect.stringMatching(/\/runtimeState/),
    )
  })
})
