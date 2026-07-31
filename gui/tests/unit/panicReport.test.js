import { describe, expect, it, vi } from 'vitest'

import {
  PANIC_ISSUE_URL,
  buildPanicIssueUrl,
  buildPanicReport,
  createPanicProjectDownload,
  downloadTextFile,
  normalizePanic,
  openPanicIssue,
  panicProjectFilename,
  safeProjectName,
  writeReportToClipboard,
} from '../../src/utils/panicReport'
import { createEmptyProject, encodeStoredProject } from '../../src/utils/projectCodec'

const panic = {
  id: 'panic-123',
  timestamp: '2026-07-13T16:17:18.000Z',
  source: 'Simulator',
  summary: 'A mock protocol failed',
  exception_type: 'BoundsError',
  message: 'BoundsError: attempt to access 3-element Vector at index [100]',
  stacktrace: 'BoundsError: attempt to access\n [1] getindex\n [2] mock_process',
}

describe('panic report data', () => {
  it('normalizes the backend schema without truncating the message or stacktrace', () => {
    expect(normalizePanic(panic)).toEqual({
      id: 'panic-123',
      timestamp: '2026-07-13T16:17:18.000Z',
      source: 'Simulator',
      summary: 'A mock protocol failed',
      exceptionType: 'BoundsError',
      message: panic.message,
      stacktrace: panic.stacktrace,
    })
  })

  it('builds complete Markdown with panic, version, and reproduction details', () => {
    const report = buildPanicReport(panic, {
      versions: {
        app: '1.6.0',
        quantumSavory: '0.7.2',
        julia: '1.12.1',
        genie: '5.33.8',
      },
      quantumsavory: {
        tracked_source: 'https://github.com/QuantumSavory/QuantumSavory.jl.git',
        tracked_revision: 'master',
        tree_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    })

    expect(report).toContain('# WebQuantumSavory simulator panic report')
    expect(report).toContain('- Panic ID: panic-123')
    expect(report).toContain('- Exception type: BoundsError')
    expect(report).toContain(panic.message)
    expect(report).toContain(panic.stacktrace)
    expect(report).toContain('- WebQuantumSavory: 1.6.0')
    expect(report).toContain('- QuantumSavory: 0.7.2')
    expect(report).toContain('- Julia: 1.12.1')
    expect(report).toContain('- Genie: 5.33.8')
    expect(report).toContain('- QuantumSavory tracked source: https://github.com/QuantumSavory/QuantumSavory.jl.git')
    expect(report).toContain('- QuantumSavory tracked revision: master')
    expect(report).toContain('- QuantumSavory Pkg tree hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(report).not.toContain('- QuantumSavory commit:')
    expect(report).toContain('### Frontend runtime dependencies')
    expect(report).toContain('- vue: 3.5.21')
    expect(report).toContain('### Frontend development dependencies')
    expect(report).toContain('- vite: 6.4.3')
    expect(report).toContain('## Reproduction')
    expect(report).toContain('not uploaded automatically')
  })

  it('accepts backend-style platform version keys', () => {
    const report = buildPanicReport(panic, {
      versions: { app: '2.0', quantumsavory: '1.0', julia: '1.13' },
    })

    expect(report).toContain('- WebQuantumSavory: 2.0')
    expect(report).toContain('- QuantumSavory: 1.0')
  })

  it('includes a commit only when the backend provides a full commit SHA', () => {
    const commit = '0123456789abcdef0123456789abcdef01234567'
    const report = buildPanicReport(panic, {
      quantumsavory: {
        tree_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        commit,
      },
    })

    expect(report).toContain(`- QuantumSavory commit: ${commit}`)
    expect(report).not.toContain('- QuantumSavory commit: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  })
})

describe('panic project download', () => {
  it('makes a portable panic filename and handles empty or reserved names', () => {
    expect(safeProjectName('  Démo / network: one  ')).toBe('Demo-network-one')
    expect(panicProjectFilename('  Démo / network: one  ')).toBe('Demo-network-one-panic.json')
    expect(panicProjectFilename('...')).toBe('webquantumsavory-project-panic.json')
    expect(panicProjectFilename('CON')).toBe('project-CON-panic.json')
  })

  it('uses the canonical object serializer and falls back to its project name', () => {
    const project = encodeStoredProject(createEmptyProject('Canonical Project'))
    project.description = 'complete project'
    const prepared = createPanicProjectDownload(() => project)

    expect(prepared.filename).toBe('Canonical-Project-panic.json')
    expect(prepared.mimeType).toBe('application/json;charset=utf-8')
    expect(JSON.parse(prepared.content)).toEqual(project)
  })

  it('preserves valid JSON returned directly by the canonical serializer', () => {
    const serialized = '{"name":"String Project","schemaVersion":2}'
    expect(createPanicProjectDownload(() => serialized)).toEqual({
      content: serialized,
      filename: 'String-Project-panic.json',
      mimeType: 'application/json;charset=utf-8',
    })
  })

  it('creates and revokes a local object URL without uploading anything', () => {
    const click = vi.fn()
    const remove = vi.fn()
    const link = { style: {}, click, remove }
    const documentRef = {
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => link),
    }
    const urlApi = {
      createObjectURL: vi.fn(() => 'blob:panic-project'),
      revokeObjectURL: vi.fn(),
    }
    const BlobClass = vi.fn(function Blob(parts, options) {
      this.parts = parts
      this.options = options
    })
    const deferRevoke = vi.fn()

    downloadTextFile('project json', 'project-panic.json', 'application/json', {
      documentRef,
      urlApi,
      BlobClass,
      deferRevoke,
    })

    expect(BlobClass).toHaveBeenCalledWith(['project json'], { type: 'application/json' })
    expect(link.download).toBe('project-panic.json')
    expect(link.href).toBe('blob:panic-project')
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(deferRevoke).toHaveBeenCalledOnce()
    expect(deferRevoke).toHaveBeenCalledWith(expect.any(Function))
    expect(urlApi.revokeObjectURL).not.toHaveBeenCalled()

    deferRevoke.mock.calls[0][0]()
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:panic-project')
  })
})

describe('panic report browser workflow', () => {
  it('prepares an official GitHub issue title and attachment instructions', () => {
    const issueUrl = new URL(buildPanicIssueUrl(panic, 'My Network'))

    expect(`${issueUrl.origin}${issueUrl.pathname}`).toBe(PANIC_ISSUE_URL)
    expect(issueUrl.searchParams.get('title')).toBe(
      '[Simulator panic] BoundsError: A mock protocol failed',
    )
    expect(issueUrl.searchParams.get('body')).toContain('paste the panic report')
    expect(issueUrl.searchParams.get('body')).toContain('My-Network-panic.json')
    expect(issueUrl.searchParams.get('body')).toContain('attach the downloaded')
  })

  it('uses the supplied clipboard API and rejects when one is unavailable', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    await expect(writeReportToClipboard('report', clipboard)).resolves.toBeUndefined()
    expect(clipboard.writeText).toHaveBeenCalledWith('report')
    await expect(writeReportToClipboard('report', null)).rejects.toThrow('unavailable')
  })

  it('opens an issue without noopener features and clears the returned window opener', () => {
    const popup = { opener: {} }
    const openWindow = vi.fn(() => popup)
    const issueUrl = buildPanicIssueUrl(panic, 'My Network')

    expect(openPanicIssue(issueUrl, openWindow)).toBe(popup)
    expect(openWindow.mock.calls[0]).toEqual([issueUrl, '_blank'])
    expect(popup.opener).toBeNull()
  })

  it('reports a genuinely blocked issue popup', () => {
    expect(() => openPanicIssue('https://example.test', vi.fn(() => null)))
      .toThrow('The GitHub issue window was blocked')
  })
})
