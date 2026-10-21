import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {AdminThemeProvider, I18nProvider, initI18n} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {PortalLayout} from './PortalLayout'
import {PortalRouter} from './router'

const auth = vi.hoisted(() => ({userInfo: vi.fn(), login: vi.fn(), logout: vi.fn()}))
vi.mock('../auth/portalAuth', () => ({portalAuth: auth}))

beforeAll(async () => {await initI18n({lng: 'zh-CN', resources: {'zh-CN': {}}})})
beforeEach(() => {
  window.sessionStorage.clear()
  auth.userInfo.mockReset().mockResolvedValue({authenticated: false})
  auth.login.mockReset()
  auth.logout.mockReset().mockResolvedValue({remoteState: 'CONFIRMED'})
})
afterEach(() => window.sessionStorage.clear())

const renderPortal = (router = false) => render(
  <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
    <AdminThemeProvider><I18nProvider><MemoryRouter>
      {router ? <PortalRouter /> : <PortalLayout><div>平台内容</div></PortalLayout>}
    </MemoryRouter></I18nProvider></AdminThemeProvider>
  </QueryClientProvider>,
)

describe('Portal shell', () => {
  it('offers passwordless OIDC login in the host header and keeps content frameless', async () => {
    renderPortal()
    await screen.findByText('登录')
    expect(screen.getByRole('img', {name: 'Stellar Enclosure'})).toHaveAttribute('src', '/favicon.png')
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(screen.getByText('平台内容').closest('.ant-layout-content')).toHaveStyle({padding: '0px'})
    fireEvent.click(screen.getByRole('button', {name: /用户菜单|User Menu/}))
    fireEvent.click(await screen.findByRole('menuitem', {name: /登录/}))
    expect(auth.login).toHaveBeenCalledWith()
    expect(screen.queryByRole('dialog', {name: '登录 Stellar Enclosure'})).not.toBeInTheDocument()
    expect(screen.queryByLabelText('租户 ID')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('用户名')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('密码')).not.toBeInTheDocument()
  })

  it('shows the verified BFF identity and persists only the logout outcome across reload', async () => {
    auth.userInfo.mockResolvedValue({
      authenticated: true,
      tenantId: '123',
      subject: '42',
      displayName: 'Alice',
    })
    auth.logout.mockResolvedValue({remoteState: 'PENDING'})
    const first = renderPortal()
    await screen.findByText('42')
    fireEvent.click(screen.getByRole('button', {name: /用户菜单|User Menu/}))
    fireEvent.click(await screen.findByRole('menuitem', {name: /退出登录/}))
    await waitFor(() => expect(auth.logout).toHaveBeenCalledOnce())
    await waitFor(() => expect(window.sessionStorage.getItem('egon.portal.logout.remote-state'))
      .toBe('PENDING'))
    first.unmount()

    auth.userInfo.mockResolvedValue({authenticated: false})
    renderPortal()
    expect(await screen.findByText('本地已退出，远端令牌撤销待恢复。')).toBeInTheDocument()
  })

  it('opens a child xingyuan directly instead of the introduction dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      key: 'tianquan-shoubing', displayName: '身份与安全', url: '/children/tianquan-shoubing/', standaloneUrl: '/tianquan-shoubing/overview',
      version: '0.0.1', contractVersion: 'xingyuan-1', compatibleHostRange: '>=0.0.1 <0.1.0',
      requiredCapabilities: [],
    }), {status: 200})))
    renderPortal(true)
    expect(await screen.findByTestId('wujie-host-tianquan-shoubing')).toBeInTheDocument()
    expect(screen.queryByRole('heading', {name: '平台工作台'})).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})


describe('fixed deployment registration', () => {
  it('passes the configured alias to the installed client without tenant or issuer selectors', async () => {
    const navigate = vi.fn()
    vi.stubEnv('VITE_OAUTH_REGISTRATION_ID', 'edge-deployment-child')
    vi.stubEnv('VITE_YUHENG_ORIGIN', '')
    vi.resetModules()
    vi.doUnmock('../auth/portalAuth')
    vi.doMock('@stellar-enclosure/stellar-enclosure-web-shared', async () => {
      const actual = await vi.importActual<typeof import('@stellar-enclosure/stellar-enclosure-web-shared')>('@stellar-enclosure/stellar-enclosure-web-shared')
      return {...actual, createGatewayAuthClient: (options: Parameters<typeof actual.createGatewayAuthClient>[0]) =>
        actual.createGatewayAuthClient({...options, navigate})}
    })
    try {
      const {portalAuth: configured} = await import('../auth/portalAuth')
      configured.login()
      configured.stepUp()
      expect(navigate.mock.calls[0]?.[0]).toBe('/oauth2/authorization/edge-deployment-child')
      expect(String(navigate.mock.calls[1]?.[0]).split('?')[0]).toBe('/oauth2/authorization/edge-deployment-child')
      expect(String(navigate.mock.calls[1]?.[0])).not.toMatch(/tenant|issuer|resource/)
    } finally {
      vi.doUnmock('@stellar-enclosure/stellar-enclosure-web-shared')
      vi.unstubAllEnvs()
    }
  })
})
