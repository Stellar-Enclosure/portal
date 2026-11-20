import { CloseOutlined, HomeOutlined, RobotOutlined } from '@ant-design/icons'
import { Button, Modal, Tooltip } from 'antd'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import type {
  AppCatalogUpdate,
  AppPageDescriptor,
  RouteRequest,
  WorkbenchPort,
} from '@stellar-enclosure/stellar-enclosure-web-shared'
import { usePortalSession } from '../../auth/portalAuth'
import type { PlatformKey } from '../../manifest/types'
import {
  initialWorkbenchNavigationState,
  workbenchNavigationReducer,
  type WorkbenchNavigationState,
  type WorkbenchTab,
} from './workbenchNavigation'
import { resolveWorkbenchUrl, type ResolvedWorkbenchLocation } from './workbenchRoutes'

export interface AppCatalogEntry {
  readonly status: AppCatalogUpdate['status']
  readonly revision: number
  readonly pages: readonly AppPageDescriptor[]
}

export interface WorkbenchNavigationContextValue {
  readonly state: WorkbenchNavigationState
  readonly resolvedLocation: ResolvedWorkbenchLocation
  readonly catalogs: Partial<Record<PlatformKey, AppCatalogEntry>>
  readonly openUrl: (url: string, mode?: 'push' | 'replace') => void
  readonly closeTab: (tabKey: string) => void
  readonly requestTenantOrLogoutReset: (proceed: () => void) => void
  readonly reportCatalog: (platformKey: PlatformKey, update: AppCatalogUpdate) => void
  readonly registerPort: (platformKey: PlatformKey, port: WorkbenchPort | undefined) => void
  readonly handleChildNavRequest: (platformKey: PlatformKey, request: RouteRequest) => void
  readonly markWorkbenchCommitted: (platformKey: PlatformKey, navigationId: number, tabKey: string) => void
  readonly mountedApps: readonly PlatformKey[]
}

const WorkbenchNavigationContext = createContext<WorkbenchNavigationContextValue | undefined>(undefined)

export const useOptionalWorkbenchNavigation = (): WorkbenchNavigationContextValue | undefined =>
  useContext(WorkbenchNavigationContext)

export function WorkbenchNavigationProvider({ children }: { readonly children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const session = usePortalSession()

  const [state, dispatch] = useReducer(workbenchNavigationReducer, undefined, initialWorkbenchNavigationState)
  const [catalogs, setCatalogs] = useState<Partial<Record<PlatformKey, AppCatalogEntry>>>({})
  const portsRef = useRef<Partial<Record<PlatformKey, WorkbenchPort>>>({})
  const lastLocationKeyRef = useRef<string>('')
  const lastSessionKeyRef = useRef<string | undefined>(session.sessionKey)
  const pendingUrlNavRef = useRef<string | undefined>(undefined)

  const catalogPagesByApp = useMemo(() => {
    const mapped: Partial<Record<PlatformKey, readonly AppPageDescriptor[]>> = {}
    for (const [key, entry] of Object.entries(catalogs)) {
      if (entry && entry.status === 'ready') {
        mapped[key as PlatformKey] = entry.pages
      }
    }
    return mapped
  }, [catalogs])

  const currentUrl = `${location.pathname}${location.search}`
  const resolvedLocation = useMemo(
    () => resolveWorkbenchUrl(currentUrl, catalogPagesByApp),
    [currentUrl, catalogPagesByApp],
  )

  useEffect(() => {
    if (lastSessionKeyRef.current !== session.sessionKey) {
      lastSessionKeyRef.current = session.sessionKey
      portsRef.current = {}
      setCatalogs({})
      dispatch({ type: 'RESET_FOR_AUTH_CHANGE' })
    }
  }, [session.sessionKey])

  useEffect(() => {
    const syncKey = `${location.key}:${currentUrl}`
    if (lastLocationKeyRef.current === syncKey) {
      return
    }
    lastLocationKeyRef.current = syncKey
    if (pendingUrlNavRef.current === currentUrl) {
      pendingUrlNavRef.current = undefined
      return
    }
    const resolved = resolveWorkbenchUrl(currentUrl, catalogPagesByApp)
    if (navigationType === 'POP') {
      dispatch({ type: 'POP_LOCATION', location: resolved })
    } else {
      dispatch({ type: 'OPEN', location: resolved, mode: 'replace' })
    }
  }, [location.key, currentUrl, navigationType, catalogPagesByApp])

  const openUrl = useCallback(
    (url: string, mode: 'push' | 'replace' = 'push') => {
      const resolved = resolveWorkbenchUrl(url, catalogPagesByApp)
      dispatch({ type: 'OPEN', location: resolved, mode })
      if (resolved.canonicalUrl !== currentUrl) {
        pendingUrlNavRef.current = resolved.canonicalUrl
        void navigate(resolved.canonicalUrl, { replace: mode === 'replace' })
      }
    },
    [catalogPagesByApp, currentUrl, navigate],
  )

  const executeTabClose = useCallback(
    (tabKey: string) => {
      const targetTab = state.tabs.find((tab) => tab.tabKey === tabKey)
      const next = workbenchNavigationReducer(state, { type: 'CLOSE_TAB', tabKey })
      dispatch({ type: 'CLOSE_TAB', tabKey })
      if (targetTab) {
        const remainingForApp = next.tabs.some((tab) => tab.appId === targetTab.appId)
        if (!remainingForApp) {
          portsRef.current[targetTab.appId] = undefined
        }
      }
      if (next.historyEffect && next.historyEffect.mode !== 'none' && next.historyEffect.url) {
        pendingUrlNavRef.current = next.historyEffect.url
        void navigate(next.historyEffect.url, { replace: next.historyEffect.mode === 'replace' })
      }
    },
    [state, navigate],
  )

  const closeTab = useCallback(
    (tabKey: string) => {
      const targetTab = state.tabs.find((tab) => tab.tabKey === tabKey)
      if (!targetTab) return
      const port = portsRef.current[targetTab.appId]
      if (port && !targetTab.isWorkbench) {
        const check = port.checkLeave({ reason: 'close', tabKey })
        if (check.ok && (check.dirty || check.pendingMutation)) {
          Modal.confirm({
            title: '确认关闭当前页面',
            content: check.pendingMutation
              ? '当前页面存在进行中的提交操作，关闭后服务端仍可能继续完成该请求，是否确认关闭？'
              : '当前页面存在未保存修改，关闭后草稿将被丢弃，是否确认关闭？',
            okText: '确认关闭',
            cancelText: '继续保留',
            onOk: async () => {
              const closeResult = await port.present({
                mode: 'close',
                navigationId: state.navigationId + 1,
                tabKey,
                guardRevision: check.guardRevision,
                signal: new AbortController().signal,
              })
              if (closeResult.ok) {
                executeTabClose(tabKey)
              }
            },
          })
          return
        }
        if (check.ok) {
          void port.present({
            mode: 'close',
            navigationId: state.navigationId + 1,
            tabKey,
            guardRevision: check.guardRevision,
            signal: new AbortController().signal,
          })
        }
      }
      executeTabClose(tabKey)
    },
    [state.tabs, state.navigationId, executeTabClose],
  )

  const requestTenantOrLogoutReset = useCallback(
    (proceed: () => void) => {
      const dirtyApps: Array<{ readonly appId: PlatformKey; readonly pendingMutation: boolean }> = []
      for (const [appKey, port] of Object.entries(portsRef.current)) {
        if (!port) continue
        const res = port.checkLeave({ reason: 'tenant-change' })
        if (res.ok && (res.dirty || res.pendingMutation)) {
          dirtyApps.push({ appId: appKey as PlatformKey, pendingMutation: res.pendingMutation })
        }
      }
      if (dirtyApps.length === 0) {
        proceed()
        return
      }
      Modal.confirm({
        title: '存在未保存修改',
        content: dirtyApps.some((item) => item.pendingMutation)
          ? `共有 ${dirtyApps.length} 个应用存在未保存修改或进行中的提交，切换后草稿将被丢弃，是否继续？`
          : `共有 ${dirtyApps.length} 个应用存在未保存修改，切换后草稿将被丢弃，是否继续？`,
        okText: '继续切换',
        cancelText: '取消',
        onOk: () => proceed(),
      })
    },
    [],
  )

  const reportCatalog = useCallback((platformKey: PlatformKey, update: AppCatalogUpdate) => {
    setCatalogs((current) => ({
      ...current,
      [platformKey]: {
        status: update.status,
        revision: update.catalogRevision,
        pages: update.status === 'ready' ? update.pages : [],
      },
    }))
    if (update.status === 'ready') {
      dispatch({ type: 'SYNC_CATALOG', appId: platformKey, catalog: update.pages })
    }
  }, [])

  const registerPort = useCallback((platformKey: PlatformKey, port: WorkbenchPort | undefined) => {
    portsRef.current[platformKey] = port
  }, [])

  const handleChildNavRequest = useCallback(
    (platformKey: PlatformKey, request: RouteRequest) => {
      const targetUrl = `/xingyuan/${platformKey}${request.target.path}${request.target.search}`
      openUrl(targetUrl, request.mode)
    },
    [openUrl],
  )

  const markWorkbenchCommitted = useCallback((_platformKey: PlatformKey, navigationId: number, tabKey: string) => {
    dispatch({ type: 'COMMIT_PRESENTATION', navigationId, tabKey })
  }, [])

  const mountedApps = useMemo(() => {
    const keys = new Set<PlatformKey>()
    for (const tab of state.tabs) {
      keys.add(tab.appId)
    }
    if (resolvedLocation.kind === 'app-workbench' || resolvedLocation.kind === 'app-page') {
      keys.add(resolvedLocation.platformKey)
    }
    return [...keys]
  }, [state.tabs, resolvedLocation])

  const value = useMemo<WorkbenchNavigationContextValue>(
    () => ({
      state,
      resolvedLocation,
      catalogs,
      openUrl,
      closeTab,
      requestTenantOrLogoutReset,
      reportCatalog,
      registerPort,
      handleChildNavRequest,
      markWorkbenchCommitted,
      mountedApps,
    }),
    [
      state,
      resolvedLocation,
      catalogs,
      openUrl,
      closeTab,
      requestTenantOrLogoutReset,
      reportCatalog,
      registerPort,
      handleChildNavRequest,
      markWorkbenchCommitted,
      mountedApps,
    ],
  )

  return (
    <WorkbenchNavigationContext.Provider value={value}>
      {children}
    </WorkbenchNavigationContext.Provider>
  )
}

export interface WorkbenchTabsProps {
  readonly tabs: readonly WorkbenchTab[]
  readonly activeTabKey?: string
  readonly activeFixedEntry?: 'home' | 'agent'
  readonly onSelectFixed: (entry: 'home' | 'agent') => void
  readonly onSelectTab: (tab: WorkbenchTab) => void
  readonly onCloseTab: (tabKey: string) => void
}

export function WorkbenchTabs({
  tabs,
  activeTabKey,
  activeFixedEntry,
  onSelectFixed,
  onSelectTab,
  onCloseTab,
}: WorkbenchTabsProps) {
  const homeRef = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const pendingFocusKeyRef = useRef<string | 'home' | undefined>(undefined)

  useEffect(() => {
    const focusTarget = pendingFocusKeyRef.current
    if (!focusTarget) return
    pendingFocusKeyRef.current = undefined
    if (focusTarget === 'home') {
      homeRef.current?.focus()
    } else {
      tabRefs.current[focusTarget]?.focus()
    }
  }, [tabs, activeTabKey, activeFixedEntry])

  const handleCloseClick = (tabKey: string) => {
    const index = tabs.findIndex((item) => item.tabKey === tabKey)
    if (index >= 0) {
      const nextFocus = tabs[index + 1]?.tabKey ?? tabs[index - 1]?.tabKey ?? 'home'
      pendingFocusKeyRef.current = nextFocus
    }
    onCloseTab(tabKey)
  }

  return (
    <div className="workbench-tabbar" data-testid="workbench-tabbar">
      <div className="workbench-tabbar-fixed">
        <Tooltip title="Agent 助手">
          <Button
            type={activeFixedEntry === 'agent' ? 'primary' : 'text'}
            size="small"
            icon={<RobotOutlined />}
            aria-label="Agent 助手"
            aria-current={activeFixedEntry === 'agent' ? 'page' : undefined}
            onClick={() => onSelectFixed('agent')}
          />
        </Tooltip>
        <Tooltip title="门户首页">
          <Button
            ref={homeRef}
            type={activeFixedEntry === 'home' ? 'primary' : 'text'}
            size="small"
            icon={<HomeOutlined />}
            aria-label="门户首页"
            aria-current={activeFixedEntry === 'home' ? 'page' : undefined}
            onClick={() => onSelectFixed('home')}
          />
        </Tooltip>
      </div>
      <div className="workbench-tabbar-scroll" role="tablist" aria-label="已打开工作区页签">
        {tabs.map((tab) => {
          const isActive = tab.tabKey === activeTabKey
          return (
            <div
              key={tab.tabKey}
              className={`workbench-tab-chip${isActive ? ' workbench-tab-chip-active' : ''}`}
            >
              <button
                ref={(el) => {
                  tabRefs.current[tab.tabKey] = el
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                className="workbench-tab-trigger"
                onClick={() => onSelectTab(tab)}
              >
                {tab.title}
              </button>
              <button
                type="button"
                aria-label={`关闭 ${tab.title}`}
                className="workbench-tab-close"
                onClick={() => handleCloseClick(tab.tabKey)}
              >
                <CloseOutlined />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
