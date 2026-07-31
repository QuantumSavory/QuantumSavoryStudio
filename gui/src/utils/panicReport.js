import {
  normalizeSystemInformation,
  unavailableSystemInformation,
} from './systemInformation.js'

export const PANIC_ISSUE_URL = 'https://github.com/QuantumSavory/WebQuantumSavory/issues/new'

const UNKNOWN_VALUE = 'Unknown'
const PROJECT_FALLBACK_NAME = 'webquantumsavory-project'

function firstString(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || ''
}

function firstText(...values) {
  return values.find(value => typeof value === 'string' && value.trim()) || ''
}

function oneLine(value, fallback = UNKNOWN_VALUE) {
  const normalized = firstString(value).replace(/\s+/g, ' ')
  return normalized || fallback
}

function markdownText(value, fallback = UNKNOWN_VALUE) {
  return oneLine(value, fallback).replace(/([\\`*_\[\]<>|])/g, '\\$1')
}

function fencedText(value) {
  const text = firstText(value) || '(not provided)'
  const longestFence = Math.max(
    0,
    ...Array.from(text.matchAll(/`+/g), match => match[0].length),
  )
  const fence = '`'.repeat(Math.max(3, longestFence + 1))
  return `${fence}text\n${text}\n${fence}`
}

/**
 * Normalize the primitive panic object supplied by the simulator status/log APIs.
 * Snake-case backend fields are canonical; aliases keep the reporting boundary
 * useful for callers which have already adapted the object for JavaScript.
 */
export function normalizePanic(panic = {}) {
  const source = panic && typeof panic === 'object' ? panic : {}
  const message = firstText(source.message, source.full_message, source.fullMessage)
  const summary = firstString(source.summary, message.split('\n')[0]) || 'Simulator panic'

  return {
    id: firstString(source.id, source.panic_id, source.panicId),
    timestamp: firstString(source.timestamp, source.time),
    source: firstString(source.source) || 'Simulator',
    summary,
    exceptionType: firstString(source.exception_type, source.exceptionType, source.type),
    message: message || summary,
    stacktrace: firstText(source.stacktrace, source.stack_trace, source.stackTrace),
  }
}

function dependencyReportSection(title, dependencies) {
  return [
    `### ${title}`,
    '',
    ...(dependencies.length
      ? dependencies.map(({ name, version }) => `- ${markdownText(name)}: ${markdownText(version)}`)
      : ['- Not available']),
    '',
  ]
}

export function buildPanicReport(panic, platformInfo = null) {
  const details = normalizePanic(panic)
  const system = platformInfo == null
    ? unavailableSystemInformation()
    : normalizeSystemInformation(platformInfo)
  const quantumSavoryDetails = [
    system.quantumSavory.trackedSource
      ? `- QuantumSavory tracked source: ${markdownText(system.quantumSavory.trackedSource)}`
      : null,
    system.quantumSavory.trackedRevision
      ? `- QuantumSavory tracked revision: ${markdownText(system.quantumSavory.trackedRevision)}`
      : null,
    system.quantumSavory.treeHash
      ? `- QuantumSavory Pkg tree hash: ${markdownText(system.quantumSavory.treeHash)}`
      : null,
    system.quantumSavory.commit
      ? `- QuantumSavory commit: ${markdownText(system.quantumSavory.commit)}`
      : null,
  ].filter(Boolean)

  return [
    '# WebQuantumSavory simulator panic report',
    '',
    '## Panic details',
    '',
    `- Panic ID: ${markdownText(details.id)}`,
    `- Timestamp: ${markdownText(details.timestamp)}`,
    `- Source: ${markdownText(details.source)}`,
    `- Summary: ${markdownText(details.summary)}`,
    `- Exception type: ${markdownText(details.exceptionType)}`,
    '',
    '### Complete exception message',
    '',
    fencedText(details.message),
    '',
    '### Complete stacktrace',
    '',
    fencedText(details.stacktrace),
    '',
    '## Environment',
    '',
    `- WebQuantumSavory: ${markdownText(system.webQuantumSavory)}`,
    `- QuantumSavory: ${markdownText(system.quantumSavory.version)}`,
    `- Julia: ${markdownText(system.julia)}`,
    `- Genie: ${markdownText(system.genie)}`,
    ...quantumSavoryDetails,
    '',
    ...dependencyReportSection('Frontend runtime dependencies', system.frontend.runtime),
    ...dependencyReportSection('Frontend development dependencies', system.frontend.development),
    '## Reproduction',
    '',
    '1. Attach the downloaded panic project JSON to this issue.',
    '2. Describe the actions taken immediately before starting the failed simulation.',
    '3. Note whether the panic happens every time with the attached project.',
    '4. Include any extra setup, environment, or protocol details needed to reproduce it.',
    '',
    '> The project JSON is downloaded locally and is not uploaded automatically. Review it before attaching it to the issue.',
    '',
  ].join('\n')
}

export function safeProjectName(projectName) {
  let safe = firstString(projectName)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100)
    .replace(/[.-]+$/g, '')

  if (!safe) safe = PROJECT_FALLBACK_NAME
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) safe = `project-${safe}`
  return safe
}

export function panicProjectFilename(projectName) {
  return `${safeProjectName(projectName)}-panic.json`
}

/**
 * Invoke the application's canonical project serializer and prepare the exact
 * JSON text used for the local diagnostic download.
 */
export function createPanicProjectDownload(serializeProject, projectName = '') {
  if (typeof serializeProject !== 'function') {
    throw new Error('A canonical project serializer is required')
  }

  const serialized = serializeProject()
  if (serialized && typeof serialized.then === 'function') {
    throw new Error('The canonical project serializer must be synchronous')
  }

  let content
  let serializedName = ''
  if (typeof serialized === 'string') {
    const parsed = JSON.parse(serialized)
    serializedName = firstString(parsed?.name)
    content = serialized
  } else if (serialized && typeof serialized === 'object') {
    serializedName = firstString(serialized.name)
    content = JSON.stringify(serialized, null, 2)
  } else {
    throw new Error('The canonical project serializer returned no project data')
  }

  return {
    content,
    filename: panicProjectFilename(firstString(projectName, serializedName)),
    mimeType: 'application/json;charset=utf-8',
  }
}

export function buildPanicIssueUrl(panic, projectName = '') {
  const details = normalizePanic(panic)
  const filename = panicProjectFilename(projectName)
  const exceptionType = oneLine(details.exceptionType, '')
  const summary = oneLine(details.summary, 'Simulator panic')
  const titleDetail = exceptionType ? `${exceptionType}: ${summary}` : summary
  const title = `[Simulator panic] ${titleDetail}`.slice(0, 180)
  const body = [
    'A WebQuantumSavory simulator panic occurred.',
    '',
    'Please paste the panic report that was copied to your clipboard below this line,',
    `then attach the downloaded \`${filename}\` project JSON file.`,
    '',
    `Panic ID: ${oneLine(details.id)}`,
    '',
    '---',
    'Paste the copied panic report here:',
    '',
  ].join('\n')
  const query = new URLSearchParams({ title, body })
  return `${PANIC_ISSUE_URL}?${query.toString()}`
}

export function writeReportToClipboard(report, clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    return Promise.reject(new Error('Clipboard access is unavailable'))
  }
  return Promise.resolve(clipboard.writeText(report))
}

export function downloadTextFile(
  content,
  filename,
  mimeType = 'text/plain;charset=utf-8',
  {
    documentRef = globalThis.document,
    urlApi = globalThis.URL,
    BlobClass = globalThis.Blob,
    deferRevoke = callback => globalThis.setTimeout(callback, 0),
  } = {},
) {
  if (!documentRef?.body || typeof documentRef.createElement !== 'function') {
    throw new Error('File downloads are unavailable')
  }
  if (typeof urlApi?.createObjectURL !== 'function' || typeof BlobClass !== 'function') {
    throw new Error('File downloads are unavailable')
  }

  const url = urlApi.createObjectURL(new BlobClass([content], { type: mimeType }))
  const link = documentRef.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  documentRef.body.appendChild(link)
  try {
    link.click()
  } finally {
    link.remove()
    deferRevoke(() => urlApi.revokeObjectURL(url))
  }
}

export function openPanicIssue(issueUrl, openWindow = globalThis.window?.open?.bind(globalThis.window)) {
  if (typeof openWindow !== 'function') throw new Error('Opening a GitHub issue is unavailable')
  const issueWindow = openWindow(issueUrl, '_blank')
  if (issueWindow === null) throw new Error('The GitHub issue window was blocked')
  if (issueWindow && typeof issueWindow === 'object') issueWindow.opener = null
  return issueWindow
}
