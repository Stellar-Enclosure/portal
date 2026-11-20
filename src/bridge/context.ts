import { isPlatformKey, type PlatformKey } from '../manifest/types'

export type SafeValue =
  | string
  | number
  | boolean
  | null
  | SafeValue[]
  | { readonly [key: string]: SafeValue }

export interface ChildResourceContext {
  readonly issuer: string
  readonly tenantId: string
  readonly resource: string
}

export interface ChildContext {
  readonly platformKey: PlatformKey
  readonly routeIntent?: string
  readonly scopeDisplay?: string
  readonly capabilitySummary?: { readonly [key: string]: SafeValue }
  readonly hostVersion?: string
  readonly resourceContext?: ChildResourceContext
}

const sensitiveKey = /token|secret|cookie|authorization|password|raw.?body|header/i

const sanitizeValue = (value: unknown, key?: string): SafeValue | undefined => {
  if (key && sensitiveKey.test(key)) {
    return undefined
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item))
      .filter((item): item is SafeValue => item !== undefined)
  }
  if (typeof value === 'object') {
    const sanitized: Record<string, SafeValue> = {}
    Object.entries(value).forEach(([entryKey, entryValue]) => {
      const safeValue = sanitizeValue(entryValue, entryKey)
      if (safeValue !== undefined) {
        sanitized[entryKey] = safeValue
      }
    })
    return sanitized
  }
  return undefined
}

const isCanonicalHttps = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.startsWith('https://') || value.length > 2048) return false
  try {
    const url = new URL(value)
    return !url.username && !url.password && !url.hash && !url.search && (url.href === value || url.origin === value)
  } catch { return false }
}

export const sanitizeChildContext = (source: Record<string, unknown>): ChildContext => {
  if (!isPlatformKey(source.platformKey)) {
    throw new Error('Invalid child xingyuan key')
  }

  const result: ChildContext = { platformKey: source.platformKey }
  const mutable = result as { -readonly [K in keyof ChildContext]?: ChildContext[K] }
  ;(['routeIntent', 'scopeDisplay', 'hostVersion'] as const).forEach((key) => {
    if (typeof source[key] === 'string') {
      mutable[key] = source[key]
    }
  })

  if (source.resourceContext && typeof source.resourceContext === 'object') {
    const {issuer, tenantId, resource} = source.resourceContext as Record<string, unknown>
    if (isCanonicalHttps(issuer) && isCanonicalHttps(resource) && typeof tenantId === 'string' && /^[1-9][0-9]{0,18}$/.test(tenantId)) {
      mutable.resourceContext = {issuer, tenantId, resource}
    }
  }
  const capabilitySummary = sanitizeValue(source.capabilitySummary)
  if (capabilitySummary && typeof capabilitySummary === 'object' && !Array.isArray(capabilitySummary)) {
    mutable.capabilitySummary = capabilitySummary as { readonly [key: string]: SafeValue }
  }
  return result
}

export const buildChildProps = (source: Record<string, unknown>): ChildContext => sanitizeChildContext(source)

export const buildRouteEvent = (source: Record<string, unknown>): ChildContext => sanitizeChildContext(source)
