import { AppstoreOutlined, LoginOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Button, Drawer, Dropdown, Grid, Input, Layout, Menu, Space, Tooltip, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { useLocation } from 'react-router-dom'
import type { AppPageDescriptor } from '@stellar-enclosure/stellar-enclosure-web-shared'
import { portalAuth, usePortalSession } from '../auth/portalAuth'
import { standaloneEntry } from '../manifest/loader'
import type { PlatformKey } from '../manifest/types'
import { PORTAL_PLATFORM_ITEMS, type PortalPlatformItem } from '../pages/PortalHomePage'
import { resources } from '../permissions/resources'
import {
  WorkbenchNavigationProvider,
  WorkbenchTabs,
  useOptionalWorkbenchNavigation,
  type AppCatalogEntry,
} from './workbench/WorkbenchTabs'
import { defaultAppTitle } from './workbench/workbenchRoutes'
import './portal.css'

const errors = {
  LOGIN_FAILED: '无法启动授权，请重新登录',
  CALLBACK_FAILED: '授权回调无效或已过期，请重新登录',
  LOGOUT_FAILED: '无法打开统一退出页面，请重试',
} as const

const DOMAINS: readonly PortalPlatformItem['domain'][] = ['平台治理', '身份与权限', '知识与协作']

const buildAppSidebarItems = (
  platformKey: PlatformKey,
  catalog: AppCatalogEntry | undefined,
): NonNullable<MenuProps['items']> => {
  if (!catalog || catalog.status !== 'ready') return []
  const groups = new Map<string, { label: string; children: AppPageDescriptor[] }>()
  const ungrouped: AppPageDescriptor[] = []
  for (const page of catalog.pages) {
    if (page.groupKey) {
      const existing = groups.get(page.groupKey)
      if (existing) {
        existing.children.push(page)
      } else {
        groups.set(page.groupKey, { label: page.groupLabel ?? page.groupKey, children: [page] })
      }
    } else {
      ungrouped.push(page)
    }
  }
  const items: NonNullable<MenuProps['items']> = []
  for (const [groupKey, group] of groups.entries()) {
    items.push({
      key: `group:${groupKey}`,
      label: group.label,
      children: group.children.map((page) => ({
        key: `/xingyuan/${platformKey}${page.pattern}`,
        label: page.label,
      })),
    })
  }
  for (const page of ungrouped) {
    items.push({
      key: `/xingyuan/${platformKey}${page.pattern}`,
      label: page.label,
    })
  }
  return items
}

function PortalShellInner({ children }: PropsWithChildren) {
  const session = usePortalSession()
  const user = session.identity
  const location = useLocation()
  const screens = Grid.useBreakpoint()
  const workbench = useOptionalWorkbenchNavigation()!

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerSearch, setDrawerSearch] = useState('')
  const [siderCollapsed, setSiderCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const launcherButtonRef = useRef<HTMLButtonElement>(null)
  const wasDrawerOpenRef = useRef(false)

  useEffect(() => {
    if (wasDrawerOpenRef.current && !drawerOpen) {
      launcherButtonRef.current?.focus()
    }
    wasDrawerOpenRef.current = drawerOpen
  }, [drawerOpen])

  useEffect(() => {
    if (!drawerOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen])

  const returnTo = location.pathname.startsWith('/auth/oidc/') ? '/' : location.pathname
  const signIn = (tenantId?: string) => {
    workbench.requestTenantOrLogoutReset(() => {
      void portalAuth.login(returnTo, tenantId)
    })
  }
  const signOut = (sso: boolean) => {
    workbench.requestTenantOrLogoutReset(() => {
      portalAuth.logout(sso)
    })
  }

  const tenantChoices = session.tenants
    .filter((id) => id !== session.tenantId)
    .map((id) => ({
      key: `tenant-${id}`,
      label: `切换到租户 ${id}`,
      disabled: session.pending,
      onClick: () => signIn(id),
    }))

  const userMenuItems: MenuProps['items'] = user
    ? [
        ...tenantChoices,
        { key: 'logout', label: '退出当前门户', icon: <LogoutOutlined />, onClick: () => signOut(false) },
        { key: 'sso-logout', label: '统一退出（SSO）', icon: <LogoutOutlined />, onClick: () => signOut(true) },
      ]
    : [
        {
          key: 'login',
          label: '登录',
          icon: <LoginOutlined />,
          disabled: session.pending || !session.tenantId,
          onClick: () => signIn(),
        },
        ...tenantChoices,
      ]

  const approvedPlatforms = useMemo(
    () =>
      PORTAL_PLATFORM_ITEMS.filter(
        (item) =>
          resources.some((resource) => resource.key === item.resourceKey && resource.access === 'PUBLIC') &&
          Boolean(standaloneEntry(item.key)),
      ),
    [],
  )

  const filteredByDomain = useMemo(() => {
    const keyword = drawerSearch.trim().toLowerCase()
    return DOMAINS.map((domain) => {
      const items = approvedPlatforms.filter((item) => {
        if (item.domain !== domain) return false
        if (!keyword) return true
        return (
          item.domain.toLowerCase().includes(keyword) ||
          item.appName.toLowerCase().includes(keyword) ||
          item.label.toLowerCase().includes(keyword) ||
          item.key.toLowerCase().includes(keyword)
        )
      })
      return { domain, items }
    }).filter((entry) => entry.items.length > 0)
  }, [approvedPlatforms, drawerSearch])

  const resolvedKind = workbench.resolvedLocation.kind
  const isNarrow = screens.md === false
  const showHomeRail = resolvedKind === 'home'
  const activeWorkbenchKey =
    resolvedKind === 'app-workbench' ? workbench.resolvedLocation.platformKey : undefined
  const showAppSidebar = resolvedKind === 'app-workbench' && activeWorkbenchKey !== undefined
  const isChildBusinessPage = resolvedKind === 'app-page' || location.pathname.startsWith('/xingyuan/') && !activeWorkbenchKey

  const activeCatalog = activeWorkbenchKey ? workbench.catalogs[activeWorkbenchKey] : undefined
  const appSidebarItems = useMemo(
    () => (activeWorkbenchKey ? buildAppSidebarItems(activeWorkbenchKey, activeCatalog) : []),
    [activeWorkbenchKey, activeCatalog],
  )

  const handleOpenAppWorkbench = (platformKey: PlatformKey) => {
    setDrawerOpen(false)
    setDrawerSearch('')
    workbench.openUrl(`/xingyuan/${platformKey}/workbench`)
  }

  return (
    <div className="portal-layout">
      <Layout className="portal-shell">
        <header className="portal-brandbar">
          <div className="portal-brandbar-left">
            <Button
              ref={launcherButtonRef}
              type="text"
              icon={<AppstoreOutlined />}
              aria-label="应用目录"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((prev) => !prev)}
            />
            <img
              src={`${import.meta.env.BASE_URL}favicon.png`}
              alt="Stellar Enclosure"
              width={28}
              height={28}
              style={{ display: 'block', objectFit: 'contain' }}
            />
            <Typography.Text strong className="portal-brand-title">
              星垣工作台
            </Typography.Text>
          </div>
          <div className="portal-brandbar-right">
            <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
              <Button type="text" aria-label="用户菜单" icon={user ? <UserOutlined /> : <LoginOutlined />}>
                {user ? `${user.subject} · 租户 ${user.tenantId}` : session.pending ? '正在授权…' : '登录'}
              </Button>
            </Dropdown>
          </div>
        </header>

        <WorkbenchTabs
          tabs={workbench.state.tabs}
          activeTabKey={workbench.state.activeTabKey}
          activeFixedEntry={workbench.state.activeFixedEntry}
          onSelectFixed={(entry) => workbench.openUrl(entry === 'agent' ? '/agent' : '/')}
          onSelectTab={(tab) => workbench.openUrl(tab.canonicalUrl)}
          onCloseTab={workbench.closeTab}
        />

        <Layout className="portal-stage-layout" hasSider={showHomeRail || showAppSidebar}>
          {showHomeRail && (
            <Layout.Sider
              width={isNarrow ? 44 : 54}
              collapsedWidth={isNarrow ? 44 : 54}
              theme="light"
              className="portal-home-rail"
              data-testid="portal-home-rail"
            >
              <Space direction="vertical" size={8} style={{ width: '100%', alignItems: 'center', paddingTop: 12 }}>
                {approvedPlatforms.map((item) => (
                  <Tooltip key={item.key} title={`${item.appName} · ${item.label}`} placement="right">
                    <Button
                      type="text"
                      size="small"
                      aria-label={`${item.appName} 工作台`}
                      onClick={() => workbench.openUrl(item.workbenchPath)}
                    >
                      {item.appName.slice(0, 1)}
                    </Button>
                  </Tooltip>
                ))}
              </Space>
            </Layout.Sider>
          )}

          {showAppSidebar && activeWorkbenchKey && (
            <Layout.Sider
              width={233}
              collapsedWidth={isNarrow ? 44 : 54}
              collapsed={isNarrow || siderCollapsed}
              theme="light"
              className="portal-app-sider"
              data-testid="portal-app-sider"
            >
              <div className="portal-app-sider-header">
                {!(isNarrow || siderCollapsed) && (
                  <Typography.Text strong>{defaultAppTitle(activeWorkbenchKey)}</Typography.Text>
                )}
                {!isNarrow && (
                  <Button
                    type="text"
                    size="small"
                    aria-label={siderCollapsed ? '展开菜单' : '收起菜单'}
                    icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                    onClick={() => setSiderCollapsed((prev) => !prev)}
                  />
                )}
              </div>
              {activeCatalog?.status === 'ready' && appSidebarItems.length > 0 ? (
                <Menu
                  mode="inline"
                  aria-label={`${defaultAppTitle(activeWorkbenchKey)} 导航`}
                  items={appSidebarItems}
                  openKeys={openGroups}
                  onOpenChange={(keys) => setOpenGroups(keys as string[])}
                  onClick={({ key }) => {
                    if (key.startsWith('/xingyuan/')) {
                      workbench.openUrl(key)
                    }
                  }}
                />
              ) : (
                <div style={{ padding: 12 }}>
                  <Typography.Text type="secondary">
                    {activeCatalog?.status === 'denied'
                      ? '暂无该应用菜单权限'
                      : activeCatalog?.status === 'failed'
                        ? '应用目录加载失败'
                        : '正在初始化应用授权与菜单…'}
                  </Typography.Text>
                </div>
              )}
            </Layout.Sider>
          )}

          <Layout.Content
            className={`portal-stage-content${isChildBusinessPage ? ' portal-stage-content-full' : ''}`}
            style={{ padding: isChildBusinessPage ? 0 : undefined }}
          >
            <div className="portal-content">
              {session.error && <Alert type="error" showIcon title={errors[session.error]} />}
              {children}
            </div>
          </Layout.Content>
        </Layout>
      </Layout>

      <Drawer
        open={drawerOpen}
        placement="left"
        title="应用目录"
        width={340}
        onClose={() => setDrawerOpen(false)}
      >
        <Input
          aria-label="搜索应用或业务域"
          placeholder="搜索业务域或应用（如：平台治理、天枢）"
          value={drawerSearch}
          onChange={(event) => setDrawerSearch(event.target.value)}
          allowClear
          style={{ marginBottom: 16 }}
        />
        {filteredByDomain.length === 0 ? (
          <Typography.Text type="secondary">没有匹配的应用或业务域</Typography.Text>
        ) : (
          <div role="menu" aria-label="应用业务域列表" className="portal-launcher-domains">
            {filteredByDomain.map((group) => (
              <div key={group.domain} className="portal-launcher-domain-group">
                <Typography.Text type="secondary" strong className="portal-launcher-domain-title">
                  {group.domain}
                </Typography.Text>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {group.items.map((item) => (
                    <Button
                      key={item.key}
                      role="menuitem"
                      block
                      style={{ textAlign: 'left', justifyContent: 'space-between', display: 'flex' }}
                      onClick={() => handleOpenAppWorkbench(item.key)}
                    >
                      <span>{item.appName} · {item.label}</span>
                      <Typography.Text type="secondary">{item.domain}</Typography.Text>
                    </Button>
                  ))}
                </Space>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  )
}

export const PortalLayout = ({ children }: PropsWithChildren) => {
  const existing = useOptionalWorkbenchNavigation()
  if (existing) {
    return <PortalShellInner>{children}</PortalShellInner>
  }
  return (
    <WorkbenchNavigationProvider>
      <PortalShellInner>{children}</PortalShellInner>
    </WorkbenchNavigationProvider>
  )
}
