import {createGatewayAuthClient, type GatewayIdentityResult} from '@stellar-enclosure/stellar-enclosure-web-shared'

// Authentication stays on Yuheng; the Portal never reads or passes tokens to children.
export const portalAuth = createGatewayAuthClient({
  appAlias: import.meta.env.VITE_OAUTH_APP_ALIAS ?? 'edge-ui',
  baseUrl: import.meta.env.VITE_YUHENG_ORIGIN ?? '',
  fetch: (...args) => globalThis.fetch(...args),
})

export type PortalIdentity = GatewayIdentityResult
