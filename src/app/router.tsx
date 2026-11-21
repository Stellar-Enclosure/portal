import { Button, Card, Result, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { PORTAL_CALLBACK_ROUTE, portalAuth, usePortalSession } from '../auth/portalAuth'
import { standaloneEntry } from '../manifest/loader'
import { isPlatformKey, type PlatformKey } from '../manifest/types'
import { AgentPage } from '../pages/AgentPage'
import { AuthorizedChild } from '../pages/ChildRoutePage'
import { PORTAL_PLATFORM_ITEMS, PortalHomePage } from '../pages/PortalHomePage'
import { PortalLayout } from './PortalLayout'
import { WorkbenchNavigationProvider, useOptionalWorkbenchNavigation } from './workbench/WorkbenchTabs'
import { defaultAppTitle } from './workbench/workbenchRoutes'

const StandaloneRedirectPage = () => {
  const { platformKey } = useParams()
  const item = PORTAL_PLATFORM_ITEMS.find((candidate) => candidate.key === platformKey)
  const url = item && standaloneEntry(item.key)
  if (!item || !url) {
    return <PortalLayout><Result status="404" title="独立入口未配置" /></PortalLayout>
  }
  return (
    <PortalLayout>
      <Result status="info" title="独立访问平台" extra={<a href={url}>独立打开 {item.label}</a>} />
    </PortalLayout>
  )
}

const OAuthCallbackPage = () => {
  const navigate = useNavigate()
  const [callback] = useState(() => window.location.href)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let current = true
    void portalAuth.completeRedirect(callback).then(
      (returnTo) => {
        if (current) void navigate(returnTo, { replace: true })
      },
      () => {
        if (current) setFailed(true)
      },
    )
    return () => {
      current = false
    }
  }, [callback, navigate])
  return (
    <PortalLayout>
      <Result status={failed ? 'error' : 'info'} title={failed ? '无法完成登录' : '正在验证登录'} />
    </PortalLayout>
  )
}

const AppWorkbenchOverview = ({ platformKey }: { readonly platformKey: PlatformKey }) => {
  const workbench = useOptionalWorkbenchNavigation()
  const item = PORTAL_PLATFORM_ITEMS.find((entry) => entry.key === platformKey)
  const catalog = workbench?.catalogs[platformKey]
  const standaloneUrl = standaloneEntry(platformKey)

  return (
    <div data-testid={`app-workbench-${platformKey}`} style={{ padding: 16 }}>
      <Card
        title={`${item?.appName ?? platformKey} · ${defaultAppTitle(platformKey)}工作台`}
        extra={standaloneUrl ? <a href={standaloneUrl}>独立打开</a> : undefined}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            请从左侧一级分组选择业务页面；点击分组仅展开收起，点击二级页面将全宽打开或复用页签。
          </Typography.Text>
          {catalog?.status === 'ready' && catalog.pages.length > 0 ? (
            <Space wrap>
              {catalog.pages.slice(0, 6).map((page) => (
                <Button
                  key={page.pageId}
                  onClick={() => workbench?.openUrl(`/xingyuan/${platformKey}${page.pattern}`)}
                >
                  {page.label}
                </Button>
              ))}
            </Space>
          ) : (
            item && (
              <Button type="primary" onClick={() => workbench?.openUrl(item.path)}>
                进入默认业务页
              </Button>
            )
          )}
        </Space>
      </Card>
    </div>
  )
}

const WorkbenchStageRouter = () => {
  const session = usePortalSession()
  const workbench = useOptionalWorkbenchNavigation()!
  const resolved = workbench.resolvedLocation

  const activePlatformKey =
    resolved.kind === 'app-workbench' || resolved.kind === 'app-page' ? resolved.platformKey : undefined
  const activeRouteIntent =
    resolved.kind === 'app-workbench' || resolved.kind === 'app-page' ? resolved.canonicalUrl : '/'

  const mountedApps = workbench.mountedApps
  const isAgentView = resolved.kind === 'agent'
  const effectiveMountedApps =
    isAgentView && !mountedApps.includes('yaoguang')
      ? [...mountedApps, 'yaoguang' as const]
      : mountedApps
  const hasSession = Boolean(session.identity && !session.pending)

  return (
    <PortalLayout>
      {resolved.kind === 'home' && <PortalHomePage />}
      {isAgentView && <AgentPage hasSession={hasSession} />}
      {resolved.kind === 'app-workbench' && <AppWorkbenchOverview platformKey={resolved.platformKey} />}
      {resolved.kind === 'not-found' && (
        <Result status="404" title="页面不存在" subTitle="请从左侧平台菜单进入页面。" />
      )}
      {activePlatformKey && !hasSession && (
        <Result
          status="info"
          title="登录后可在门户中打开平台"
          extra={standaloneEntry(activePlatformKey) && <a href={standaloneEntry(activePlatformKey)}>独立打开</a>}
        />
      )}
      {hasSession && effectiveMountedApps.map((appKey) => {
        if (!isPlatformKey(appKey)) return null
        const isCurrentAppPage = resolved.kind === 'app-page' && resolved.platformKey === appKey
        const isCurrentWorkbench = resolved.kind === 'app-workbench' && resolved.platformKey === appKey
        const isAgentYaoguang = isAgentView && appKey === 'yaoguang'
        const isVisible = isCurrentAppPage || isAgentYaoguang
        const activeTabForApp =
          workbench.state.tabs.find((tab) => tab.appId === appKey && tab.tabKey === workbench.state.activeTabKey) ??
          workbench.state.tabs.find((tab) => tab.appId === appKey && !tab.isWorkbench)
        const targetPath = isAgentYaoguang
          ? '/xingyuan/yaoguang/assistant/knowledge'
          : isCurrentAppPage
            ? activeRouteIntent
            : activeTabForApp?.canonicalUrl ?? `/xingyuan/${appKey}/workbench`
        const childTabKey = isAgentYaoguang
          ? 'agent:knowledge'
          : isCurrentAppPage
            ? workbench.state.activeTabKey
            : undefined

        return (
          <div
            key={`${session.epoch}:${appKey}`}
            className={isAgentYaoguang ? 'portal-child-slot portal-child-slot-agent' : 'portal-child-slot'}
            style={isVisible ? { display: 'flex', flex: '1 1 0', minHeight: 0 } : { display: 'none' }}
            data-workbench-mounted-app={appKey}
            data-workbench-init-only={isCurrentWorkbench ? 'true' : undefined}
          >
            <AuthorizedChild
              platformKey={appKey}
              pathname={targetPath}
              identity={session.identity!}
              epoch={session.epoch}
              active={isVisible}
              activeTabKey={childTabKey}
              onCatalogUpdate={workbench.reportCatalog}
              onNavigationRequest={workbench.handleChildNavRequest}
              onPortReady={workbench.registerPort}
            />
          </div>
        )
      })}
    </PortalLayout>
  )
}

export const PortalRouter = () => {
  const existing = useOptionalWorkbenchNavigation()
  const routes = (
    <Routes>
      <Route path={PORTAL_CALLBACK_ROUTE} element={<OAuthCallbackPage />} />
      <Route path="/standalone/:platformKey" element={<StandaloneRedirectPage />} />
      <Route path="*" element={<WorkbenchStageRouter />} />
    </Routes>
  )
  if (existing) {
    return routes
  }
  return <WorkbenchNavigationProvider>{routes}</WorkbenchNavigationProvider>
}
