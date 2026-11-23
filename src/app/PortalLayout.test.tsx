import {webcrypto} from 'node:crypto'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {AdminThemeProvider, I18nProvider, initI18n, type PublicOAuthRegistration} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {createPortalAuth, type PortalSession} from '../auth/portalAuth'
import {PortalLayout} from './PortalLayout'
import {PortalRouter} from './router'
import {useOptionalWorkbenchNavigation} from './workbench/WorkbenchTabs'

const mock = vi.hoisted(() => ({
  portalAuth: {login: vi.fn(), logout: vi.fn(), completeRedirect: vi.fn()},
  read: vi.fn<() => PortalSession>(),
  subscriptions: new Set<() => void>(),
}))
vi.mock('../auth/portalAuth', async importOriginal => {
  const actual = await importOriginal<typeof import('../auth/portalAuth')>()
  const {useSyncExternalStore} = await import('react')
  const subscribe = (listener: () => void) => {
    mock.subscriptions.add(listener)
    return () => { mock.subscriptions.delete(listener) }
  }
  return {...actual, portalAuth: mock.portalAuth, usePortalSession: () => useSyncExternalStore(subscribe, mock.read)}
})

const issuer = 'https://issuer.example/tenants/101'
const identity = {issuer, tenantId: '101', subject: 'person', resource: 'https://api.example/portal', clientId: 'portal-101', accessExpiresAt: 42}
const anonymous: PortalSession = {tenants: ['101', '102'], tenantId: '101', epoch: 0, pending: false}
const signed = {...anonymous, identity, epoch: 1}
const change = (next: PortalSession) => act(() => { mock.read.mockReturnValue(next); mock.subscriptions.forEach(listener => listener()) })

beforeAll(async () => { await initI18n({lng: 'zh-CN', resources: {'zh-CN': {}}}) })
beforeEach(() => { vi.clearAllMocks(); window.sessionStorage.clear(); mock.read.mockReturnValue(anonymous) })
afterEach(() => { window.sessionStorage.clear(); vi.unstubAllGlobals() })

const renderPortal = (router = false, route = '/') => render(
  <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
    <AdminThemeProvider><I18nProvider><MemoryRouter initialEntries={[route]}>
      {router ? <PortalRouter /> : <PortalLayout><div>平台内容</div></PortalLayout>}
    </MemoryRouter></I18nProvider></AdminThemeProvider>
  </QueryClientProvider>,
)
const openMenu = () => fireEvent.click(screen.getByRole('button', {name: /用户菜单|User Menu/}))
const child = {key: 'tianquan-shoubing', displayName: '身份与安全', url: '/children/tianquan-shoubing/', standaloneUrl: '/tianquan-shoubing/overview',
  resource: 'https://resources.example.invalid/tianquan-shoubing', version: '0.0.1', contractVersion: 'xingyuan-1',
  compatibleHostRange: '>=0.0.1 <0.1.0', requiredCapabilities: []}

const manifest = () => new Response(JSON.stringify(child), {status: 200})

describe('Portal shell', () => {
  it('keeps parameterized child routes out of the APP menu while resolving object tabs', async () => {
    mock.read.mockReturnValue(signed)
    const ChildCatalog = () => {
      const workbench = useOptionalWorkbenchNavigation()!
      return <>
        <button onClick={() => workbench.reportCatalog('tianquan-jianshen', {
          status: 'ready', catalogRevision: 1, pages: [
            {pageId: 'roles', label: '角色', pattern: '/iam/roles', identityParams: [], queryKeys: []},
            {pageId: 'role-permissions', label: '角色权限', pattern: '/iam/roles/:roleId/permissions', identityParams: ['roleId'], queryKeys: []},
            {pageId: 'assignments', label: '用户任职', pattern: '/iam/users/:userId/role-assignments', identityParams: ['userId'], queryKeys: []},
          ],
        })}>发布已授权目录</button>
        <button onClick={() => workbench.openUrl('/xingyuan/tianquan-jianshen/iam/roles/17/permissions')}>打开角色 17</button>
        <button onClick={() => workbench.openUrl('/xingyuan/tianquan-jianshen/iam/roles/18/permissions')}>打开角色 18</button>
      </>
    }

    render(<AdminThemeProvider><I18nProvider>
      <MemoryRouter initialEntries={['/xingyuan/tianquan-jianshen/workbench']}>
        <PortalLayout><ChildCatalog /></PortalLayout>
      </MemoryRouter>
    </I18nProvider></AdminThemeProvider>)
    fireEvent.click(screen.getByRole('button', {name: '发布已授权目录'}))
    expect(await screen.findByRole('menuitem', {name: '角色'})).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', {name: '角色权限'})).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', {name: '用户任职'})).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: '打开角色 17'}))
    expect(await screen.findByRole('tab', {name: /角色权限/})).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', {name: '打开角色 18'}))
    await waitFor(() => expect(screen.getAllByRole('tab', {name: /角色权限/})).toHaveLength(2))
    expect(screen.queryByTestId('portal-app-sider')).not.toBeInTheDocument()
  })

  it('offers OIDC login in the header and preserves the route without forwarding query material', async () => {
    renderPortal(false, '/xingyuan/tianshu/registry?tenant=ignored')
    await screen.findByText('登录')
    expect(screen.getByRole('img', {name: 'Stellar Enclosure'})).toHaveAttribute('src', '/favicon.png')
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(screen.getByText('平台内容').closest('.ant-layout-content')).toHaveStyle({padding: '0px'})
    openMenu()
    fireEvent.click(await screen.findByRole('menuitem', {name: /登录/}))
    expect(mock.portalAuth.login).toHaveBeenCalledWith('/xingyuan/tianshu/registry', undefined)
    expect(screen.queryByLabelText('密码')).not.toBeInTheDocument()
  })

  it('routes a verified callback back to the application with replacement', async () => {
    mock.portalAuth.completeRedirect.mockResolvedValueOnce('/standalone/tianquan-shoubing')
    renderPortal(true, '/auth/oidc/callback/portal-101')
    await screen.findByRole('heading', {name: '独立访问平台'}).catch(() => screen.findByText('独立访问平台'))
    expect(await screen.findByRole('link', {name: '独立打开 身份与安全'})).toHaveAttribute('href', '/tianquan-shoubing/overview')
    expect(mock.portalAuth.completeRedirect).toHaveBeenCalledTimes(1)
  })

  it('removes the mounted application on logout and discards a late manifest after tenant change', async () => {
    let resolve: (value: Response) => void = () => undefined
    const delayed = new Promise<Response>(done => { resolve = done })
    const fetch = vi.fn().mockResolvedValueOnce(manifest()).mockReturnValueOnce(delayed).mockResolvedValueOnce(manifest())
    vi.stubGlobal('fetch', fetch)
    mock.read.mockReturnValue(signed)
    renderPortal(true, '/xingyuan/tianquan-shoubing/overview')
    expect(await screen.findByTestId('wujie-host-tianquan-shoubing')).toBeInTheDocument()
    openMenu()
    fireEvent.click(await screen.findByRole('menuitem', {name: /切换到租户 102/}))
    expect(mock.portalAuth.login).toHaveBeenCalledWith('/xingyuan/tianquan-shoubing/overview', '102')
    change({...signed, epoch: 2})
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const staleSignal = fetch.mock.calls[1][1].signal as AbortSignal
    change({...anonymous, tenantId: '102', epoch: 3, pending: true})
    expect(staleSignal.aborted).toBe(true)
    resolve(manifest())
    expect(screen.queryByTestId('wujie-host-tianquan-shoubing')).not.toBeInTheDocument()
    change({...signed, identity: {...identity, tenantId: '102', issuer: 'https://issuer.example/tenants/102'}, epoch: 4})
    expect(await screen.findByTestId('wujie-host-tianquan-shoubing')).toBeInTheDocument()
    openMenu()
    fireEvent.click(await screen.findByRole('menuitem', {name: /退出当前门户/}))
    expect(mock.portalAuth.logout).toHaveBeenCalledWith(false)
    change({...anonymous, epoch: 5})
    expect(screen.queryByTestId('wujie-host-tianquan-shoubing')).not.toBeInTheDocument()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('renders home overview at /, fixed Agent/Home entries, domain-only launcher drawer with Esc focus restore, and workbench vs full-width layouts', async () => {
    mock.read.mockReturnValue(signed)
    renderPortal(true, '/')

    // Root '/' renders PortalHomePage overview instead of redirecting into the first APP
    expect(await screen.findByRole('heading', { name: '平台工作台' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agent 助手' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '门户首页' })).toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)

    // Launcher drawer searches domains/APPs only and restores focus on Esc
    const launcherBtn = screen.getByRole('button', { name: '应用目录' })
    fireEvent.click(launcherBtn)
    const searchInput = await screen.findByRole('textbox', { name: '搜索应用或业务域' })
    fireEvent.change(searchInput, { target: { value: '天机' } })
    expect(screen.getByRole('menuitem', { name: /天机|流程编排/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /天枢/ })).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '搜索应用或业务域' })).not.toBeInTheDocument())
    expect(launcherBtn).toHaveFocus()

    // Fixed /agent entry stays outside closable tabs
    fireEvent.click(screen.getByRole('button', { name: 'Agent 助手' }))
    expect(await screen.findByTestId('agent-page')).toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })
})

const registration = (tenantId: string): PublicOAuthRegistration => {
  const issuer = `https://issuer.example/tenants/${tenantId}`
  return {id: `portal-${tenantId}`, clientId: `portal-${tenantId}`, tenantId, issuer,
    resource: `https://api.example/portal/${tenantId}`, apiBaseUrl: 'https://api.example', scopes: ['openid', 'portal:read'],
    redirectUri: `https://portal.example/console/auth/oidc/callback/portal-${tenantId}`,
    authorizationEndpoint: issuer + '/oauth2/authorize', tokenEndpoint: issuer + '/oauth2/token',
    jwksUri: issuer + '/.well-known/jwks.json', browserBound: false}
}
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

it('uses the installed SDK for a tenant switch and reload, and rejects a second Resource token', async () => {
  const a = registration('101'), b = registration('102')
  const config = JSON.stringify({registrations: [a, b], activeResource: a.id})
  const opts = {crypto: webcrypto as unknown as Crypto, sessionStorage: window.sessionStorage,
    fetch: vi.fn<typeof globalThis.fetch>(), navigate: vi.fn<(url: string) => void>(), replaceLocation: vi.fn()}
  const create = () => createPortalAuth(config, 'https://portal.example', '/console/', opts)
  const first = create()
  await first.login('/xingyuan/yuheng/dashboard', '102')
  const target = new URL(opts.navigate.mock.lastCall![0])
  expect(target.origin + target.pathname).toBe(b.authorizationEndpoint)
  expect(target.searchParams.get('resource')).toBe(b.resource)
  const callback = new URL(b.redirectUri)
  callback.search = new URLSearchParams({code: 'allowed-test-code', state: target.searchParams.get('state')!}).toString()
  const alg = 'RSASSA-PKCS1-v1_5'
  const keys = await webcrypto.subtle.generateKey({name: alg, modulusLength: 2048, hash: 'SHA-256',
    publicExponent: new Uint8Array([1, 0, 1])}, true, ['verify', 'sign'])
  const publicKey = {...await webcrypto.subtle.exportKey('jwk', keys.publicKey), kid: 'test-key', alg: 'RS256'}
  const now = Math.floor(Date.now() / 1000)
  const common = {sub: 'verified-person', iss: b.issuer, iat: now, exp: now + 300}
  const token = async (typ: string, claims: object) => {
    const content = encode({alg: 'RS256', typ, kid: 'test-key'}) + '.' + encode({...common, ...claims})
    return content + '.' + Buffer.from(await webcrypto.subtle.sign(alg, keys.privateKey, new TextEncoder().encode(content))).toString('base64url')
  }
  const schedule = async (nonce: string, audience: string) => {
    const id_token = await token('JWT', {aud: [b.clientId], nonce})
    const access_token = await token('at+jwt', {aud: [audience], tenant_id: b.tenantId, principal_type: 'USER',
      scope_context: 'TENANT', client_id: b.clientId, scope: 'openid portal:read'})
    opts.fetch.mockResolvedValueOnce(new Response(JSON.stringify({id_token, access_token, token_type: 'Bearer', expires_in: 300})))
      .mockResolvedValueOnce(new Response(JSON.stringify({keys: [publicKey]})))
  }
  await schedule(target.searchParams.get('nonce')!, b.resource)
  const reloaded = create()
  const completion = reloaded.completeRedirect(callback.href)
  expect(reloaded.completeRedirect(callback.href)).toBe(completion)
  await expect(completion).resolves.toBe('/xingyuan/yuheng/dashboard')
  expect(reloaded.getSnapshot()).toMatchObject({tenantId: '102', identity: {issuer: b.issuer, resource: b.resource, subject: 'verified-person'}})
  expect(opts.replaceLocation).toHaveBeenCalledWith(b.redirectUri)
  expect(opts.fetch.mock.calls.map(([url]) => url)).toEqual([b.tokenEndpoint, b.jwksUri])
  await expect(reloaded.completeRedirect(callback.href)).rejects.toMatchObject({code: 'INVALID_CALLBACK'})
  reloaded.logout(true)
  expect(opts.navigate.mock.lastCall![0]).toBe(b.issuer + '/logout')
  expect(reloaded.getSnapshot().identity).toBeUndefined()
  await reloaded.login('/', '102')
  const second = new URL(opts.navigate.mock.lastCall![0])
  callback.searchParams.set('state', second.searchParams.get('state')!)
  await schedule(second.searchParams.get('nonce')!, a.resource)
  await expect(reloaded.completeRedirect(callback.href)).rejects.toMatchObject({code: 'INVALID_TOKEN'})
  expect(reloaded.getSnapshot().identity).toBeUndefined()
  expect(window.sessionStorage.length).toBe(0)
  expect(() => createPortalAuth(config, 'https://wrong.example', '/console/', opts)).toThrow('PORTAL_OAUTH_CONFIG_INVALID')
})
