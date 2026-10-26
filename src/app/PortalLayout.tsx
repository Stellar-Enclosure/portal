import {LoginOutlined, LogoutOutlined} from '@ant-design/icons'
import {EnterpriseLayout} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {useMutation, useQuery} from '@tanstack/react-query'
import {Alert} from 'antd'
import type {PropsWithChildren} from 'react'
import {useState} from 'react'
import {portalAuth} from '../auth/portalAuth'
import {navigationFor} from '../pages/PortalHomePage'
import './portal.css'

const REMOTE_LOGOUT_NOTICE_KEY = 'egon.portal.logout.remote-state'

/** Host-owned brand and sign-in controls; each child still owns its authorization. */
export const PortalLayout = ({children}: PropsWithChildren) => {
  const [locallyClosed, setLocallyClosed] = useState(false)
  const [remoteLogoutNotice] = useState(() => {
    const state = window.sessionStorage.getItem(REMOTE_LOGOUT_NOTICE_KEY)
    window.sessionStorage.removeItem(REMOTE_LOGOUT_NOTICE_KEY)
    if (state === 'PENDING') return '本地已退出，远端令牌撤销待恢复。'
    if (state === 'UNKNOWN') return '本地已退出，远端令牌撤销状态未知。'
    return undefined
  })
  const identity = useQuery({
    queryKey: ['portal-identity'],
    queryFn: ({signal}) => portalAuth.identity(signal),
    enabled: !locallyClosed,
    retry: false,
    refetchOnWindowFocus: true,
  })
  const logout = useMutation({
    mutationFn: (sso: boolean) => portalAuth.logout({sso}),
    onMutate: () => { setLocallyClosed(true) },
    onSuccess: (result, sso) => {
      if (result.remoteState !== 'CONFIRMED') {
        window.sessionStorage.setItem(REMOTE_LOGOUT_NOTICE_KEY, result.remoteState)
      }
      // Reloading clears the child application's in-memory authorization state too.
      if (!sso) window.location.reload()
    },
  })
  const user = locallyClosed ? undefined : identity.data

  return (
    <div className="portal-layout">
      <EnterpriseLayout config={{
        platformName: 'Stellar Enclosure',
        logo: <img src="/favicon.png" alt="Stellar Enclosure" width={28} height={28}
          style={{display: 'block', objectFit: 'contain'}} />,
        navigation: navigationFor(),
        hideFooter: true,
        contentStyle: {padding: 0, minHeight: 0, flex: '1 1 0', display: 'flex', overflow: 'hidden'},
        user: user ? {
          name: user.subject,
          description: `租户 ${user.tenantId}`,
          menu: [
            {key: 'logout', label: logout.isPending ? '正在退出…' : '退出当前门户',
              icon: <LogoutOutlined />, disabled: logout.isPending, onClick: () => logout.mutate(false)},
            {key: 'sso-logout', label: '统一退出（SSO）', icon: <LogoutOutlined />,
              disabled: logout.isPending, onClick: () => logout.mutate(true)},
          ],
        } : {
          name: identity.isPending ? '检查登录…' : '登录',
          avatar: <LoginOutlined />,
          menu: [{key: 'login', label: '登录', icon: <LoginOutlined />,
            onClick: () => portalAuth.login()}],
        },
      }}>
        <div className="portal-content">
          {remoteLogoutNotice && <Alert type="warning" showIcon title={remoteLogoutNotice} />}
          {logout.error && <Alert type="error" showIcon title="退出登录失败，请重试" />}
          {locallyClosed ? <Alert type="info" showIcon title="当前门户已退出" /> : children}
        </div>
      </EnterpriseLayout>
    </div>
  )
}
