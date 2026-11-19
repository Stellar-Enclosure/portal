import {createPublicOAuthClient, type PublicOAuthClientOptions, type PublicOAuthIdentity,
  type PublicOAuthRegistration} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {useSyncExternalStore} from 'react'

const callbackRoute = 'auth/oidc/callback/'
export const PORTAL_CALLBACK_ROUTE = '/' + callbackRoute + ':registrationId'

interface PortalAuthConfig {
  readonly registrations: readonly PublicOAuthRegistration[]
  readonly activeResource: string
}

export interface PortalSession {
  readonly identity?: PublicOAuthIdentity
  readonly tenants: readonly string[]
  readonly tenantId?: string
  readonly epoch: number
  readonly pending: boolean
  readonly error?: 'LOGIN_FAILED' | 'CALLBACK_FAILED' | 'LOGOUT_FAILED'
}

function loadConfig(text: string | undefined, origin: string, basePath: string): PortalAuthConfig | undefined {
  if (text === undefined || text === '') return undefined
  try {
    const config = JSON.parse(text) as PortalAuthConfig
    if (!Array.isArray(config.registrations) || !config.registrations.length || !config.registrations.some(r => r.id === config.activeResource)
      || new Set(config.registrations.map(r => r.tenantId)).size !== config.registrations.length
      || config.registrations.some(r => r.redirectUri !== new URL(basePath + callbackRoute + encodeURIComponent(r.id), origin).href)) {
      throw new Error()
    }
    return config
  } catch { throw new Error('PORTAL_OAUTH_CONFIG_INVALID') }
}

export function createPortalAuth(configText: string | undefined, origin: string, basePath: string,
  options: Omit<PublicOAuthClientOptions, 'registrations' | 'activeResource'> = {}) {
  const config = loadConfig(configText, origin, basePath)
  const client = config ? createPublicOAuthClient({ ...options, registrations: config.registrations, activeResource: config.activeResource }) : undefined
  const registrations = config?.registrations ?? []
  const tenants = Object.freeze(registrations.map(r => r.tenantId))
  let selected = registrations.find(r => r.id === config?.activeResource)
  let generation = 0
  let snapshot: PortalSession = { tenants, tenantId: selected?.tenantId, epoch: 0, pending: false }
  const subscribers = new Set<() => void>()
  let completion: { url: string; result: Promise<string> } | undefined
  const publish = (pending: boolean, error?: PortalSession['error']) => {
    snapshot = { identity: selected ? client?.identity(selected.id) : undefined,
      tenants, tenantId: selected?.tenantId, epoch: snapshot.epoch + 1, pending, error }
    subscribers.forEach(listener => listener())
  }
  for (const registration of registrations) {
    client?.authority(registration.id).context.subscribe(() => publish(snapshot.pending, snapshot.error))
  }

  return {
    subscribe: (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener) } },
    getSnapshot: (): PortalSession => snapshot,
    login: async (returnTo: string, tenantId = selected?.tenantId) => {
      const registration = registrations.find(r => r.tenantId === tenantId)
      if (!client || !registration) return
      const attempt = ++generation
      completion = undefined
      selected = registration
      try {
        client.selectResource(registration.id)
        publish(true)
        await client.login(returnTo)
      } catch {
        if (attempt === generation) publish(false, 'LOGIN_FAILED')
      }
    },
    completeRedirect: (url: string): Promise<string> => {
      if (completion?.url === url) return completion.result
      const attempt = ++generation
      const result = (async () => {
        try {
          if (!client) throw new Error('PORTAL_OAUTH_CALLBACK_UNAVAILABLE')
          const {identity, returnTo} = await client.completeRedirect(url)
          if (attempt !== generation) throw new DOMException('Superseded authorization', 'AbortError')
          selected = registrations.find(r => r.tenantId === identity.tenantId && r.issuer === identity.issuer && r.clientId === identity.clientId)
          if (!selected) throw new Error('PORTAL_OAUTH_IDENTITY_INVALID')
          publish(false)
          return returnTo
        } catch (error) {
          if (attempt === generation) publish(false, 'CALLBACK_FAILED')
          throw error
        }
      })()
      completion = { url, result }
      const release = () => { if (completion?.result === result) completion = undefined }
      void result.then(release, release)
      return result
    },
    logout: (sso: boolean) => {
      ++generation
      completion = undefined
      try { client?.logout({sso}); publish(false) }
      catch { publish(false, 'LOGOUT_FAILED') }
    },
  }
}

export const portalAuth = createPortalAuth(import.meta.env.VITE_PORTAL_OAUTH_CONFIG, window.location.origin,
  import.meta.env.BASE_URL, { replaceLocation: url => window.history.replaceState(window.history.state, '', url) })

export const usePortalSession = () => useSyncExternalStore(portalAuth.subscribe, portalAuth.getSnapshot)
