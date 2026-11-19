import {LoginOutlined, LogoutOutlined} from '@ant-design/icons'
import {EnterpriseLayout} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {Alert} from 'antd'
import type {PropsWithChildren} from 'react'
import {useLocation} from 'react-router-dom'
import {portalAuth, usePortalSession} from '../auth/portalAuth'
import {navigationFor} from '../pages/PortalHomePage'
import './portal.css'

const errors = {
  LOGIN_FAILED: '无法启动授权，请重新登录',
  CALLBACK_FAILED: '授权回调无效或已过期，请重新登录',
  LOGOUT_FAILED: '无法打开统一退出页面，请重试',
} as const

export const PortalLayout = ({children}: PropsWithChildren) => {
  const session = usePortalSession()
  const user = session.identity
  const location = useLocation()
  const returnTo = location.pathname.startsWith('/auth/oidc/') ? '/' : location.pathname
  const signIn = (tenantId?: string) => { void portalAuth.login(returnTo, tenantId) }
  const tenantChoices = session.tenants.filter(id => id !== session.tenantId).map(id => ({
    key: `tenant-${id}`, label: `切换到租户 ${id}`, disabled: session.pending, onClick: () => signIn(id),
  }))

  return (
    <div className="portal-layout">
      <EnterpriseLayout config={{
        platformName: 'Stellar Enclosure',
        logo: <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="Stellar Enclosure" width={28} height={28}
          style={{display: 'block', objectFit: 'contain'}} />,
        navigation: navigationFor(),
        hideFooter: true,
        contentStyle: {padding: 0, minHeight: 0, flex: '1 1 0', display: 'flex', overflow: 'hidden'},
        user: user ? {
          name: user.subject,
          description: `租户 ${user.tenantId}`,
          menu: [
            ...tenantChoices,
            {key: 'logout', label: '退出当前门户', icon: <LogoutOutlined />, onClick: () => portalAuth.logout(false)},
            {key: 'sso-logout', label: '统一退出（SSO）', icon: <LogoutOutlined />, onClick: () => portalAuth.logout(true)},
          ],
        } : {
          name: session.pending ? '正在授权…' : '登录',
          avatar: <LoginOutlined />,
          menu: [{key: 'login', label: '登录', icon: <LoginOutlined />,
            disabled: session.pending || !session.tenantId, onClick: () => signIn()}, ...tenantChoices],
        },
      }}>
        <div className="portal-content">
          {session.error && <Alert type="error" showIcon title={errors[session.error]} />}
          {children}
        </div>
      </EnterpriseLayout>
    </div>
  )
}
