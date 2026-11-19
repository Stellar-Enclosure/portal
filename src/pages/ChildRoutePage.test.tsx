import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { AdminThemeProvider, I18nProvider, initI18n } from '@stellar-enclosure/stellar-enclosure-web-shared'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { startApp } from 'wujie'
import { ChildRoutePage } from './ChildRoutePage'

const state = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../auth/portalAuth', () => ({portalAuth: {}, usePortalSession: () => state.get()}))
const signedIdentity = {issuer: 'https://identity.example/tenants/101', tenantId: '101', subject: 'person',
  resource: 'https://resources.example.invalid/portal', clientId: 'portal-user', accessExpiresAt: 42}

const manifest = (overrides: Record<string, unknown> = {}) => ({
  key: 'yuheng',
  displayName: 'API 网关',
  resource: 'https://resources.example.invalid/yuheng',
  url: '/children/yuheng/',
  standaloneUrl: '/yuheng/dashboard',
  version: '0.0.1',
  contractVersion: 'xingyuan-1',
  compatibleHostRange: '>=0.0.1 <0.1.0',
  requiredCapabilities: ['yuheng:read'],
  ...overrides,
})
const response = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } },
)

const renderRoute = (initialPath = '/xingyuan/yuheng/dashboard') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminThemeProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/xingyuan/:platformKey/*" element={<ChildRoutePage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </AdminThemeProvider>
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  await initI18n({ lng: 'zh-CN', resources: { 'zh-CN': {} } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  state.get.mockReturnValue({identity: signedIdentity, tenants: ['101'], tenantId: '101', epoch: 1, pending: false})
  vi.clearAllMocks()
  const testWindow = window as unknown as Record<string, unknown>
  delete testWindow.__WUJIE_TEST_EVENTS
  delete testWindow.__WUJIE_TEST_TRIGGER_LOAD_ERROR
})

describe('ChildRoutePage', () => {
  it('passes the Portal deep-link suffix to the selected child', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(manifest({
      url: '/children/yuheng/',
    }))))

    renderRoute('/xingyuan/yuheng/dashboard')

    await screen.findByTestId('wujie-host-yuheng')
    expect(screen.queryByText('子应用运行区；业务权限和数据仍由对应平台负责')).not.toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(screen.getByTestId('wujie-host-yuheng').closest('.portal-child-stage')).not.toBeNull()
    expect(vi.mocked(startApp)).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringMatching(/\/dashboard$/),
      props: expect.objectContaining({resourceContext: {issuer: signedIdentity.issuer, tenantId: '101', resource: manifest().resource}}),
    }))
  })

  it('keeps the independent entry available before host login, with no embedded runtime or manifest request', async () => {
    state.get.mockReturnValue({tenants: ['101'], tenantId: '101', epoch: 0, pending: false})
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    renderRoute()
    expect(await screen.findByRole('link', {name: '独立打开'})).toHaveAttribute('href', '/yuheng/dashboard')
    expect(startApp).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a forged Resource before mounting a trusted HTML entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(manifest({resource: signedIdentity.resource}))))
    renderRoute()
    expect(await screen.findByText(/子应用资源未获部署批准/)).toBeInTheDocument()
    expect(startApp).not.toHaveBeenCalled()
  })

  it('does not mount an incompatible child and offers its standalone entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(manifest({ compatibleHostRange: '>=9.0.0' }))))

    renderRoute()

    expect(await screen.findByText(/版本不兼容/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /独立打开/ })).toHaveAttribute('href', '/yuheng/dashboard')
    expect(screen.queryByTestId('wujie-child')).not.toBeInTheDocument()
  })

  it('cleans up the child before a failed mount is retried', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(manifest())))

    renderRoute()

    expect(await screen.findByText('子应用已加载')).toBeInTheDocument()
    const testWindow = window as unknown as {
      __WUJIE_TEST_EVENTS?: string[]
      __WUJIE_TEST_TRIGGER_LOAD_ERROR?: () => void
    }
    testWindow.__WUJIE_TEST_TRIGGER_LOAD_ERROR?.()

    expect(await screen.findByText(/子应用加载失败/)).toBeInTheDocument()
    await screen.findByRole('button', { name: '重新挂载' }).then((button) => button.click())
    expect(await screen.findByText('子应用已加载')).toBeInTheDocument()
    expect(testWindow.__WUJIE_TEST_EVENTS).toEqual([
      'beforeLoad',
      'afterMount',
      'loadError',
      'beforeUnmount',
      'afterUnmount',
      'beforeLoad',
      'afterMount',
    ])
  })
})
