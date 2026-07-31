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
  const composable = useImportExport({
    currentProjectName: { value: 'Current' },
    importedProjectData: { value: null },
    conflictProjectName: { value: '' },
    showImportConflictDialog: { value: false },
    addLog: vi.fn(),
    importIntoSession,
    serializeProjectData: vi.fn(),
    showAlert,
  })
  return { composable, importIntoSession, showAlert }
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
