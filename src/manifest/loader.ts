import { isChildContractVersion, type ManifestErrorCode, type PlatformKey, type PlatformManifest } from './types'

export const PORTAL_HOST_VERSION = '0.0.2'

export class ManifestLoadError extends Error {
  readonly code: ManifestErrorCode
  readonly status?: number

  constructor(code: ManifestErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'ManifestLoadError'
    this.code = code
    this.status = status
  }
}

type Semver = [number, number, number]

const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const parseSemver = (value: string): Semver | undefined => {
  const match = semverPattern.exec(value.trim())
  if (!match) {
    return undefined
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

const compareSemver = (left: Semver, right: Semver): number => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index]
    }
  }
  return 0
}

const satisfiesRange = (version: string, range: string): boolean => {
  const parsedVersion = parseSemver(version)
  if (!parsedVersion || !range.trim()) {
    return false
  }

  return range.split('||').some((alternative) => alternative.trim().split(/\s+/).every((expression) => {
    const match = /^(>=|<=|>|<|=)?\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(expression)
    if (!match) {
      return false
    }
    const expected = parseSemver(match[2])
    if (!expected) {
      return false
    }
    const comparison = compareSemver(parsedVersion, expected)
    switch (match[1] ?? '=') {
      case '>':
        return comparison > 0
      case '>=':
        return comparison >= 0
      case '<':
        return comparison < 0
      case '<=':
        return comparison <= 0
      default:
        return comparison === 0
    }
  }))
}

interface ChildBinding {
  readonly resource: string
  readonly url: string
  readonly standaloneUrl: string
  readonly summaryUrl?: string
}

const manifestUrl = (environment: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(environment)) throw invalid('Manifest environment is invalid')
  return `${import.meta.env.BASE_URL}portal-manifest/${environment}.json`
}

const checkedUrl = (value: unknown): URL | undefined => {
  if (typeof value !== 'string' || !value || value.length > 2048 || value.includes('%') || value.startsWith('//')
    || !/^[A-Za-z0-9:/._~-]+$/.test(value) || /(?:^|\/)\.{1,2}(?=\/|$)/.test(value)) return undefined
  try {
    if (!value.startsWith('/') && !value.startsWith('https://') && !value.startsWith('http://')) return undefined
    const url = new URL(value, window.location.origin)
    const local = !import.meta.env.PROD && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash || /^\/apps(?:\/|$)/.test(url.pathname)
      || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) return undefined
    return url
  } catch { return undefined }
}

const getChildBinding = (key: PlatformKey): ChildBinding | undefined => {
  const configured: string | undefined = import.meta.env.VITE_PORTAL_CHILD_BINDINGS
  if (!configured) return undefined
  try {
    const values: unknown = JSON.parse(configured)
    if (!values || typeof values !== 'object' || !Object.hasOwn(values, key)) return undefined
    const value = (values as Partial<Record<PlatformKey, ChildBinding>>)[key]
    const entry = checkedUrl(value?.url)
    if (!value || !value.resource?.startsWith('https://') || !checkedUrl(value.resource)
      || !entry || !(entry.pathname.endsWith('/') || entry.pathname.endsWith('/index.html')) || !checkedUrl(value.standaloneUrl)
      || (value.summaryUrl !== undefined && !checkedUrl(value.summaryUrl))) return undefined
    return value
  } catch { return undefined }
}

export const standaloneEntry = (key: PlatformKey): string | undefined => getChildBinding(key)?.standaloneUrl

export const validateChildResource = (key: PlatformKey, resource: unknown): string => {
  const registered = getChildBinding(key)?.resource
  if (!registered || resource !== registered) {
    throw new ManifestLoadError('MANIFEST_RESOURCE_NOT_ALLOWED', 'Manifest Resource does not match its deployment binding')
  }
  return registered
}

export const validateChildUrl = (value: string, platformKey: PlatformKey, standalone = false): URL => {
  const parsed = checkedUrl(value)
  const binding = getChildBinding(platformKey)
  const expected = checkedUrl(standalone ? binding?.standaloneUrl : binding?.url)
  if (!parsed || !expected || parsed.href !== expected.href) {
    throw new ManifestLoadError('MANIFEST_URL_NOT_ALLOWED', 'Manifest URL does not match the approved child entry')
  }
  return parsed
}

const invalid = (message: string): ManifestLoadError => new ManifestLoadError('MANIFEST_INVALID', message)

const readManifest = (value: unknown, platformKey: PlatformKey): PlatformManifest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid('Manifest must be a JSON object')
  }

  const root = value as Record<string, unknown>
  const candidate = typeof root.key === 'string'
    ? root
    : root[platformKey] as Record<string, unknown> | undefined
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw invalid('Manifest does not contain the requested xingyuan')
  }
  const requiredStrings = [
    'key',
    'displayName',
    'resource',
    'url',
    'standaloneUrl',
    'version',
    'contractVersion',
    'compatibleHostRange',
  ] as const

  if (requiredStrings.some((field) => typeof candidate[field] !== 'string' || !candidate[field])) {
    throw invalid('Manifest is missing a required string field')
  }
  if (candidate.key !== platformKey) {
    throw invalid('Manifest key does not match the requested xingyuan')
  }
  if (!isChildContractVersion(candidate.contractVersion)) {
    throw new ManifestLoadError(
      'MANIFEST_VERSION_UNSUPPORTED',
      `Unsupported child contract version ${String(candidate.contractVersion)}`,
    )
  }
  if (!Array.isArray(candidate.requiredCapabilities)
    || candidate.requiredCapabilities.some((capability) => typeof capability !== 'string' || !capability)) {
    throw invalid('Manifest requiredCapabilities must be a string array')
  }
  if (!parseSemver(candidate.version as string)) {
    throw invalid('Manifest version must be a semantic version')
  }
  const resource = validateChildResource(platformKey, candidate.resource)
  const binding = getChildBinding(platformKey)
  validateChildUrl(candidate.url as string, platformKey)
  validateChildUrl(candidate.standaloneUrl as string, platformKey, true)
  if (candidate.summaryUrl !== undefined && (typeof candidate.summaryUrl !== 'string'
    || !binding?.summaryUrl || checkedUrl(candidate.summaryUrl)?.href !== checkedUrl(binding.summaryUrl)?.href)) {
    throw new ManifestLoadError('MANIFEST_URL_NOT_ALLOWED', 'Manifest summary URL does not match its deployment binding')
  }

  return {
    key: candidate.key as PlatformKey,
    displayName: candidate.displayName as string,
    resource,
    url: candidate.url as string,
    standaloneUrl: candidate.standaloneUrl as string,
    version: candidate.version as string,
    contractVersion: candidate.contractVersion,
    compatibleHostRange: candidate.compatibleHostRange as string,
    requiredCapabilities: [...candidate.requiredCapabilities as string[]],
    ...(typeof candidate.summaryUrl === 'string' ? { summaryUrl: candidate.summaryUrl } : {}),
  }
}

const isAbortError = (error: unknown): boolean => (
  (error instanceof DOMException && error.name === 'AbortError')
  || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
)

export const loadManifest = async (
  platformKey: PlatformKey,
  environment: string,
  signal: AbortSignal,
  hostVersion = PORTAL_HOST_VERSION,
): Promise<PlatformManifest> => {
  const url = manifestUrl(environment)
  let response: Response
  try {
    response = await fetch(url, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal })
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new ManifestLoadError('MANIFEST_FETCH_FAILED', 'Unable to load xingyuan manifest')
  }

  if (!response.ok) {
    throw new ManifestLoadError('MANIFEST_FETCH_FAILED', `Manifest request failed with status ${response.status}`, response.status)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw invalid('Manifest response is not valid JSON')
  }

  signal.throwIfAborted()
  const parsed = readManifest(payload, platformKey)
  if (!satisfiesRange(hostVersion, parsed.compatibleHostRange)) {
    throw new ManifestLoadError(
      'MANIFEST_VERSION_UNSUPPORTED',
      `Platform ${parsed.version} is not compatible with Portal ${hostVersion}`,
    )
  }
  return parsed
}
