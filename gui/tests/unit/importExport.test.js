import { afterEach, describe, expect, it, vi } from 'vitest'

import { useImportExport } from '../../src/composables/useImportExport'
import ProjectStore from '../../src/models/ProjectStore'
import {
  PROJECT_SCHEMA_VERSION,
  createEmptyProject,
  encodeStoredProject,
} from '../../src/utils/projectCodec'

function importProject(overrides = {}) {
  const document = encodeStoredProject(createEmptyProject('Imported Project'))
  return {
    ...document,
    name: ' Imported Project ',
    ...overrides,
  }
}

function createHarness() {
  const importIntoSession = vi.fn(async () => true)
  const showAlert = vi.fn()
  const importedProjectData = { value: null }
  const conflictProjectName = { value: '' }
  const showImportConflictDialog = { value: false }
  const composable = useImportExport({
    currentProjectName: { value: 'Current' },
    importedProjectData,
    conflictProjectName,
    showImportConflictDialog,
    addLog: vi.fn(),
    importIntoSession,
    serializeProjectData: vi.fn(),
    showAlert,
  })
  return {
    composable,
    importIntoSession,
    showAlert,
    importedProjectData,
    conflictProjectName,
    showImportConflictDialog,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('project import admission', () => {
  it('validates and clones a current document without mutating imported input', async () => {
    vi.spyOn(ProjectStore, 'listProjects').mockReturnValue([])
    const harness = createHarness()
    const raw = importProject({
      annotations: [{
        id: 'annotation_imported',
        markdown: 'Imported $x$',
        bounds: { west: -3, south: -2, east: 3, north: 2 },
        backgroundColor: '#FFFFFF',
        borderColor: '#123ABC',
        area: { freeCorner: [4, 3] },
      }],
    })
    const original = structuredClone(raw)

    expect(await harness.composable.validateAndProcessImport(raw)).toBe(true)

    expect(raw).toEqual(original)
    const [imported, finalName] = harness.importIntoSession.mock.calls[0]
    expect(finalName).toBe('Imported Project')
    expect(imported.name).toBe(' Imported Project ')
    expect(imported.annotations).toEqual([{
      id: 'annotation_imported',
      markdown: 'Imported $x$',
      bounds: { west: -3, south: -2, east: 3, north: 2 },
      backgroundColor: '#FFFFFF',
      borderColor: '#123ABC',
      area: { freeCorner: [4, 3] },
    }])
    expect(imported.annotations).not.toBe(raw.annotations)
  })

  it('admits a current document with an empty annotation collection', async () => {
    vi.spyOn(ProjectStore, 'listProjects').mockReturnValue([])
    const harness = createHarness()

    expect(await harness.composable.validateAndProcessImport(importProject())).toBe(true)
    expect(harness.importIntoSession.mock.calls[0][0].annotations).toEqual([])
  })

  it.each([
    ['cancel', async harness => harness.composable.cancelImportConflict(), null],
    ['overwrite', harness => harness.composable.handleImportConflictOverwrite(), 'Imported Project'],
    ['rename', harness => harness.composable.handleImportConflictNewName(), 'Imported Project 2'],
  ])('releases an admitted conflict candidate on %s', async (_action, resolveConflict, finalName) => {
    vi.spyOn(ProjectStore, 'listProjects').mockReturnValue(['Imported Project'])
    const harness = createHarness()
    const raw = importProject()

    await harness.composable.validateAndProcessImport(raw)
    expect(harness.showImportConflictDialog.value).toBe(true)
    expect(harness.importedProjectData.value).not.toBe(raw)
    expect(harness.conflictProjectName.value).toBe('Imported Project')

    await resolveConflict(harness)

    expect(harness.showImportConflictDialog.value).toBe(false)
    expect(harness.importedProjectData.value).toBeNull()
    expect(harness.conflictProjectName.value).toBe('')
    if (finalName) {
      expect(harness.importIntoSession).toHaveBeenCalledWith(expect.any(Object), finalName)
    } else {
      expect(harness.importIntoSession).not.toHaveBeenCalled()
    }
  })

  it('rejects invalid annotation data before reading storage or changing the session', async () => {
    const listProjects = vi.spyOn(ProjectStore, 'listProjects').mockReturnValue([])
    const harness = createHarness()
    const raw = importProject({
      annotations: [{
        id: 'annotation_invalid',
        markdown: '',
        bounds: { west: -3, south: -2, east: 3, north: 2 },
        backgroundColor: 'white',
        borderColor: '#000000',
        area: null,
      }],
    })
    const original = structuredClone(raw)

    expect(await harness.composable.validateAndProcessImport(raw)).toBe(false)
    expect(raw).toEqual(original)
    expect(listProjects).not.toHaveBeenCalled()
    expect(harness.importIntoSession).not.toHaveBeenCalled()
    expect(harness.showAlert).toHaveBeenCalledWith(
      'Import failed',
      expect.stringMatching(/schema validation.*backgroundColor/i),
    )
  })

  it.each([
    ['older', document => { document.schemaVersion = PROJECT_SCHEMA_VERSION - 1 }],
    ['newer', document => { document.schemaVersion = PROJECT_SCHEMA_VERSION + 1 }],
    ['negative', document => { document.schemaVersion = -1 }],
    ['noninteger', document => { document.schemaVersion = PROJECT_SCHEMA_VERSION + 0.5 }],
    ['string', document => { document.schemaVersion = String(PROJECT_SCHEMA_VERSION) }],
    ['missing', document => { delete document.schemaVersion }],
    ['unknown field', document => { document.net.unexpected = true }],
    ['malformed root', () => []],
  ])('rejects a %s document without storage or session effects', async (_label, mutate) => {
    const listProjects = vi.spyOn(ProjectStore, 'listProjects').mockReturnValue([])
    const harness = createHarness()
    const document = importProject()
    const raw = mutate(document) || document
    const original = structuredClone(raw)

    expect(await harness.composable.validateAndProcessImport(raw)).toBe(false)
    expect(raw).toEqual(original)
    expect(listProjects).not.toHaveBeenCalled()
    expect(harness.importIntoSession).not.toHaveBeenCalled()
    expect(harness.showAlert).toHaveBeenCalledWith(
      'Import failed',
      expect.stringMatching(/project schema validation failed/i),
    )
  })
})
