import {
  normalizeRouteTarget,
  validateRelativeRoutePath,
  type AppPageDescriptor,
  type RouteTarget,
} from '@stellar-enclosure/stellar-enclosure-web-shared'
import { isPlatformKey, type PlatformKey } from '../../manifest/types'

export type ResolvedWorkbenchLocation =
  | { readonly kind: 'home'; readonly canonicalUrl: '/' }
  | { readonly kind: 'agent'; readonly canonicalUrl: '/agent' }
  | { readonly kind: 'standalone'; readonly platformKey: PlatformKey; readonly canonicalUrl: string }
  | { readonly kind: 'auth-callback'; readonly canonicalUrl: string }
  | {
      readonly kind: 'app-workbench'
      readonly platformKey: PlatformKey
      readonly tabKey: string
      readonly target: RouteTarget
      readonly canonicalUrl: string
    }
  | {
      readonly kind: 'app-page'
      readonly platformKey: PlatformKey
      readonly pageId: string
      readonly tabKey: string
      readonly target: RouteTarget
      readonly descriptor?: AppPageDescriptor
      readonly canonicalUrl: string
      readonly matched: boolean
    }
  | {
      readonly kind: 'not-found'
      readonly canonicalUrl: string
      readonly reason: 'INVALID_URL' | 'UNKNOWN_APP' | 'UNKNOWN_ROUTE'
    }

const FORBIDDEN_BUSINESS_QUERY_KEYS = new Set([
  'code',
  'state',
  'iss',
  'access_token',
  'id_token',
  'refresh_token',
  'token',
  'client_secret',
  'session_state',
])

const APP_DEFAULT_TITLES: Record<PlatformKey, string> = {
  'tianquan-shoubing': '身份与安全',
  'tianquan-jianshen': '权限治理',
  yuheng: 'API 网关',
  tianshu: '配置中心',
  yaoguang: '知识库与 Wiki',
  tianji: '流程编排',
}

export function defaultAppTitle(platformKey: PlatformKey): string {
  return APP_DEFAULT_TITLES[platformKey]
}

export function encodeTabKey(appId: PlatformKey, pageId: string, identityValues: readonly string[] = []): string {
  return JSON.stringify([appId, pageId, ...identityValues])
}

export interface DescriptorMatch {
  readonly descriptor: AppPageDescriptor
  readonly identityValues: readonly string[]
  readonly params: Readonly<Record<string, string>>
}

const splitSegments = (path: string): readonly string[] => path.slice(1).split('/').filter(Boolean)

export function matchAppDescriptor(
  path: string,
  descriptors: readonly AppPageDescriptor[],
): DescriptorMatch | undefined {
  const normalizedPath = validateRelativeRoutePath(path)
  if (!normalizedPath) return undefined

  const pathSegments = splitSegments(normalizedPath)
  const matches: Array<{
    readonly match: DescriptorMatch
    readonly staticCount: number
    readonly paramCount: number
    readonly index: number
  }> = []

  descriptors.forEach((descriptor, index) => {
    const patternSegments = splitSegments(descriptor.pattern)
    if (patternSegments.length !== pathSegments.length) return

    let staticCount = 0
    let paramCount = 0
    const params: Record<string, string> = {}

    for (let i = 0; i < patternSegments.length; i += 1) {
      const patternSeg = patternSegments[i]
      const actualSeg = pathSegments[i]
      if (patternSeg.startsWith(':')) {
        const paramName = patternSeg.slice(1)
        let decoded: string
        try {
          decoded = decodeURIComponent(actualSeg)
        } catch {
          return
        }
        if (!decoded) return
        params[paramName] = decoded
        paramCount += 1
      } else {
        if (patternSeg !== actualSeg) return
        staticCount += 1
      }
    }

    const identityValues = descriptor.identityParams.map((key) => params[key] ?? '')
    matches.push({
      match: { descriptor, identityValues, params },
      staticCount,
      paramCount,
      index,
    })
  })

  if (matches.length === 0) return undefined
  matches.sort(
    (left, right) =>
      right.staticCount - left.staticCount ||
      left.paramCount - right.paramCount ||
      left.index - right.index,
  )
  return matches[0].match
}

const filterSearch = (rawSearch: string, allowedKeys?: readonly string[]): { readonly search: string; readonly hasForbidden: boolean } => {
  if (!rawSearch || rawSearch === '?') {
    return { search: '', hasForbidden: false }
  }
  const params = new URLSearchParams(rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch)
  const out = new URLSearchParams()
  const allowSet = allowedKeys ? new Set(allowedKeys) : undefined
  for (const [key, value] of params.entries()) {
    if (FORBIDDEN_BUSINESS_QUERY_KEYS.has(key.toLowerCase())) {
      return { search: '', hasForbidden: true }
    }
    if (!allowSet || allowSet.has(key)) {
      out.append(key, value)
    }
  }
  const serialized = out.toString()
  return { search: serialized ? `?${serialized}` : '', hasForbidden: false }
}

export function resolveWorkbenchUrl(
  input: string,
  catalogByApp?: Partial<Record<PlatformKey, readonly AppPageDescriptor[]>>,
): ResolvedWorkbenchLocation {
  if (typeof input !== 'string' || !input) {
    return { kind: 'not-found', canonicalUrl: '/', reason: 'INVALID_URL' }
  }

  const hashStripped = input.split('#', 1)[0]
  const qIndex = hashStripped.indexOf('?')
  const rawPath = qIndex >= 0 ? hashStripped.slice(0, qIndex) : hashStripped
  const rawSearch = qIndex >= 0 ? hashStripped.slice(qIndex) : ''

  const normalizedTarget = normalizeRouteTarget({ path: rawPath, search: rawSearch })
  if (!normalizedTarget) {
    return { kind: 'not-found', canonicalUrl: rawPath || '/', reason: 'INVALID_URL' }
  }

  const { path, search } = normalizedTarget
  if (path === '/') {
    return { kind: 'home', canonicalUrl: '/' }
  }
  if (path === '/agent') {
    return { kind: 'agent', canonicalUrl: '/agent' }
  }
  if (path.startsWith('/auth/oidc/callback/')) {
    return { kind: 'auth-callback', canonicalUrl: `${path}${search}` }
  }

  const standaloneMatch = /^\/standalone\/([^/]+)$/.exec(path)
  if (standaloneMatch) {
    const key = standaloneMatch[1]
    if (!isPlatformKey(key)) {
      return { kind: 'not-found', canonicalUrl: path, reason: 'UNKNOWN_APP' }
    }
    return { kind: 'standalone', platformKey: key, canonicalUrl: `/standalone/${key}` }
  }

  const xingyuanPrefix = '/xingyuan/'
  if (path.startsWith(xingyuanPrefix)) {
    const rest = path.slice(xingyuanPrefix.length)
    const slashIndex = rest.indexOf('/')
    const appSegment = slashIndex >= 0 ? rest.slice(0, slashIndex) : rest
    if (!isPlatformKey(appSegment)) {
      return { kind: 'not-found', canonicalUrl: path, reason: 'UNKNOWN_APP' }
    }
    const subPath = slashIndex >= 0 ? rest.slice(slashIndex) : '/workbench'
    if (subPath === '/' || subPath === '/workbench') {
      return {
        kind: 'app-workbench',
        platformKey: appSegment,
        tabKey: encodeTabKey(appSegment, 'workbench'),
        target: { path: '/workbench', search: '' },
        canonicalUrl: `/xingyuan/${appSegment}/workbench`,
      }
    }

    const appCatalog = catalogByApp?.[appSegment]
    if (appCatalog !== undefined) {
      const matched = matchAppDescriptor(subPath, appCatalog)
      if (!matched) {
        return { kind: 'not-found', canonicalUrl: `${path}${search}`, reason: 'UNKNOWN_ROUTE' }
      }
      const filtered = filterSearch(search, matched.descriptor.queryKeys)
      if (filtered.hasForbidden) {
        return { kind: 'not-found', canonicalUrl: path, reason: 'INVALID_URL' }
      }
      return {
        kind: 'app-page',
        platformKey: appSegment,
        pageId: matched.descriptor.pageId,
        tabKey: encodeTabKey(appSegment, matched.descriptor.pageId, matched.identityValues),
        target: { path: subPath, search: filtered.search },
        descriptor: matched.descriptor,
        canonicalUrl: `/xingyuan/${appSegment}${subPath}${filtered.search}`,
        matched: true,
      }
    }

    const sanitizedQuery = filterSearch(search)
    if (sanitizedQuery.hasForbidden) {
      return { kind: 'not-found', canonicalUrl: path, reason: 'INVALID_URL' }
    }
    return {
      kind: 'app-page',
      platformKey: appSegment,
      pageId: `pending:${subPath}`,
      tabKey: encodeTabKey(appSegment, `pending:${subPath}`),
      target: { path: subPath, search: sanitizedQuery.search },
      canonicalUrl: `/xingyuan/${appSegment}${subPath}${sanitizedQuery.search}`,
      matched: false,
    }
  }

  return { kind: 'not-found', canonicalUrl: `${path}${search}`, reason: 'UNKNOWN_ROUTE' }
}

export function sanitizeReturnTo(rawReturnTo: string | null | undefined): string {
  if (!rawReturnTo) return '/'
  const resolved = resolveWorkbenchUrl(rawReturnTo)
  if (
    resolved.kind === 'home' ||
    resolved.kind === 'agent' ||
    resolved.kind === 'standalone' ||
    resolved.kind === 'app-workbench' ||
    resolved.kind === 'app-page'
  ) {
    return resolved.canonicalUrl
  }
  return '/'
}
