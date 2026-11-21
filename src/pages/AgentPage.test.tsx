import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  AdminThemeProvider,
  I18nProvider,
  initI18n,
  type AppCatalogUpdate,
  type Presentation,
  type WorkbenchHost,
  type WorkbenchPort,
} from '@stellar-enclosure/stellar-enclosure-web-shared'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalSession } from '../auth/portalAuth'
import { PortalRouter } from '../app/router'
import localManifest from '../../public/portal-manifest/local.json'

const mockState = vi.hoisted(() => ({
  read: vi.fn<() => PortalSession>(),
  subscriptions: new Set<() => void>(),
  mountCount: new Map<string, number>(),
  presentations: [] as Array<{ readonly platformKey: string; readonly presentation: Presentation }>,
  hosts: new Map<string, WorkbenchHost>(),
}))

vi.mock('../auth/portalAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/portalAuth')>()
  const { useSyncExternalStore } = await import('react')
  const subscribe = (listener: () => void) => {
    mockState.subscriptions.add(listener)
    return () => {
      mockState.subscriptions.delete(listener)
    }
  }
  return {
    ...actual,
    portalAuth: { login: vi.fn(), logout: vi.fn(), completeRedirect: vi.fn() },
    usePortalSession: () => useSyncExternalStore(subscribe, mockState.read),
  }
})

vi.mock('../lifecycle/WujieChild', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react')
  return {
    WujieChild: ({
      manifest,
      context,
      active,
      activeTabKey,
      onCatalogUpdate,
      onNavigationRequest,
      onPortReady,
    }: {
      readonly manifest: { readonly key: string; readonly contractVersion: string }
      readonly context: { readonly routeIntent?: string }
      readonly active?: boolean
      readonly activeTabKey?: string
      readonly onCatalogUpdate?: (update: AppCatalogUpdate) => void
      readonly onNavigationRequest?: (request: {
        readonly appKey: string
        readonly mode: 'push' | 'replace'
        readonly target: { readonly path: string; readonly search: string }
      }) => void
      readonly onPortReady?: (port: WorkbenchPort | undefined) => void
    }) => {
      useEffect(() => {
      mockState.mountCount.set(manifest.key, (mockState.mountCount.get(manifest.key) ?? 0) + 1)
      const port: WorkbenchPort = {
        version: 'workbench-1',
        present: async (presentation: Presentation) => {
          mockState.presentations.push({ platformKey: manifest.key, presentation })
          return { ok: true }
        },
        checkLeave: () => ({ ok: true, dirty: false, pendingMutation: false, guardRevision: 1 }),
      }
      onPortReady?.(port)
      if (manifest.key === 'yaoguang') {
        onCatalogUpdate?.({
          catalogRevision: 1,
          status: 'ready',
          pages: [
            {
              pageId: 'yaoguang.page.knowledge',
              pattern: '/knowledge',
              label: '企业知识',
              groupKey: 'knowledge',
              groupLabel: '企业知识',
              identityParams: [],
              queryKeys: [],
            },
            {
              pageId: 'yaoguang.page.knowledge.kbId.wiki.pageId',
              pattern: '/knowledge/:kbId/wiki/:pageId',
              label: 'Wiki 页面',
              groupKey: 'knowledge',
              groupLabel: '企业知识',
              identityParams: ['kbId', 'pageId'],
              queryKeys: ['revision'],
            },
          ],
        })
      } else if (manifest.key === 'tianshu') {
        onCatalogUpdate?.({
          catalogRevision: 1,
          status: 'ready',
          pages: [
            {
              pageId: 'tianshu.page.publishTasks',
              pattern: '/publish-tasks',
              label: '配置发布',
              groupKey: 'runtime',
              groupLabel: '运行态',
              identityParams: [],
              queryKeys: ['changeId'],
            },
          ],
        })
      } else if (manifest.key === 'yuheng') {
        onCatalogUpdate?.({
          catalogRevision: 1,
          status: 'ready',
          pages: [
            {
              pageId: 'yuheng.page.interface.catalog',
              pattern: '/interface-catalog',
              label: 'API 接口',
              groupKey: 'yuheng.menu.group1',
              groupLabel: '网关治理',
              identityParams: [],
              queryKeys: ['bizCode', 'namespace', 'env', 'appCode'],
            },
          ],
        })
      }
      mockState.hosts.set(manifest.key, {
        attach: () => ({ ok: true }),
        reportCatalog: () => ({ ok: true }),
        requestNavigation: (req) => {
          onNavigationRequest?.({
            appKey: manifest.key,
            mode: req.mode,
            target: { path: req.target.path, search: req.target.search ?? '' },
          })
          return { ok: true }
        },
      })
      return () => {
        onPortReady?.(undefined)
      }
      // Mount once per WujieChild lifecycle to verify zero remounts during Agent <-> Wiki round trips
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      if (!active) return
      const targetPath = context.routeIntent?.replace(`/xingyuan/${manifest.key}`, '') || '/workbench'
      mockState.presentations.push({
        platformKey: manifest.key,
        presentation: {
          mode: 'show',
          navigationId: mockState.presentations.length + 1,
          target: { path: targetPath, search: '' },
          tabKey: activeTabKey ?? 'default',
          signal: new AbortController().signal,
        },
      })
    }, [active, activeTabKey, context.routeIntent, manifest.key])

    return (
      <div data-testid={`wujie-host-${manifest.key}`}>
        <span>{`mounted:${manifest.key}:${context.routeIntent ?? ''}`}</span>
        {manifest.key === 'yaoguang' && active && (
          <button
            type="button"
            onClick={() =>
              mockState.hosts.get('yaoguang')?.requestNavigation({
                requestId: 1,
                mode: 'push',
                target: { path: '/knowledge/kb-1/wiki/wiki-1', search: '' },
              })
            }
          >
            打开 Wiki 引用
          </button>
        )}
      </div>
    )
  },
  }
})

const issuer = 'https://issuer.example/tenants/101'
const identity = {
  issuer,
  tenantId: '101',
  subject: 'person',
  resource: 'https://api.example/portal',
  clientId: 'portal-101',
  accessExpiresAt: 42,
}
const signedSession: PortalSession = {
  tenants: ['101'],
  tenantId: '101',
  epoch: 1,
  pending: false,
  identity,
}
const anonymousSession: PortalSession = {
  tenants: ['101'],
  tenantId: '101',
  epoch: 0,
  pending: false,
}

const makeManifestResponse = () => {
  const body = Object.fromEntries(
    Object.entries(localManifest).map(([key, entry]) => [
      key,
      {
        ...entry,
        contractVersion: 'workbench-1',
      },
    ]),
  )
  return new Response(JSON.stringify(body), { status: 200 })
}

const renderPortalAt = (route = '/') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AdminThemeProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={[route]}>
            <PortalRouter />
          </MemoryRouter>
        </I18nProvider>
      </AdminThemeProvider>
    </QueryClientProvider>,
  )

describe('AgentPage (Step 23)', () => {
  beforeAll(async () => {
    await initI18n({ lng: 'zh-CN', resources: { 'zh-CN': {} } })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockState.mountCount.clear()
    mockState.presentations.length = 0
    mockState.hosts.clear()
    window.sessionStorage.clear()
    mockState.read.mockReturnValue(signedSession)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(makeManifestResponse())))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
  })

  it('navigates between two business tabs, fixed /agent with Yaoguang assistant, Wiki citation, and back to /agent without remounting Yaoguang', async () => {
    renderPortalAt('/xingyuan/tianshu/publish-tasks')

    expect(await screen.findByTestId('wujie-host-tianshu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Agent 助手' }))

    expect(await screen.findByTestId('agent-page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agent 助手' })).toHaveAttribute('aria-current', 'page')

    // Fixed /agent must not occupy a closable tab in the tablist
    const tablist = screen.getByRole('tablist', { name: '已打开工作区页签' })
    expect(within(tablist).queryByText('Agent 助手')).not.toBeInTheDocument()

    // Spec §12.3 verified deep-link cards are present inside AgentPage
    const agentContainer = screen.getByTestId('agent-page')
    expect(within(agentContainer).getByRole('button', { name: /进入配置发布/ })).toBeInTheDocument()
    expect(within(agentContainer).getByRole('button', { name: /进入API 接口/ })).toBeInTheDocument()
    expect(within(agentContainer).getByRole('button', { name: /进入角色权限/ })).toBeInTheDocument()

    // Same Yaoguang authorized instance mounted at /assistant/knowledge
    expect(await screen.findByTestId('wujie-host-yaoguang')).toBeInTheDocument()
    await waitFor(() =>
      expect(mockState.presentations.some(
        (item) =>
          item.platformKey === 'yaoguang' &&
          item.presentation.mode === 'show' &&
          item.presentation.target.path === '/assistant/knowledge',
      )).toBe(true),
    )

    // Jump from Yaoguang assistant Wiki citation -> opens Yaoguang Wiki business tab
    fireEvent.click(screen.getByRole('button', { name: '打开 Wiki 引用' }))
    await waitFor(() =>
      expect(mockState.presentations.some(
        (item) =>
          item.platformKey === 'yaoguang' &&
          item.presentation.mode === 'show' &&
          item.presentation.target.path === '/knowledge/kb-1/wiki/wiki-1',
      )).toBe(true),
    )

    // Switch back to fixed Agent -> same Yaoguang instance retained (mountCount === 1)
    fireEvent.click(screen.getByRole('button', { name: 'Agent 助手' }))
    expect(await screen.findByTestId('agent-page')).toBeInTheDocument()
    expect(mockState.mountCount.get('yaoguang')).toBe(1)

    // Deep-link click opens canonical business route
    fireEvent.click(within(screen.getByTestId('agent-page')).getByRole('button', { name: /进入API 接口/ }))
    expect(await screen.findByTestId('wujie-host-yuheng')).toBeInTheDocument()
  })

  it('degrades unauthorized/denied routes while keeping configured deep links accessible and prompting on anonymous session', async () => {
    mockState.read.mockReturnValue(anonymousSession)
    renderPortalAt('/agent')

    expect(await screen.findByTestId('agent-page')).toBeInTheDocument()
    expect(screen.getByText(/登录后可使用/)).toBeInTheDocument()
    expect(screen.queryByTestId('wujie-host-yaoguang')).not.toBeInTheDocument()
  })
})
