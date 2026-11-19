import { Result } from 'antd'
import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { PORTAL_CALLBACK_ROUTE, portalAuth } from '../auth/portalAuth'
import {PortalLayout} from './PortalLayout'
import { standaloneEntry } from '../manifest/loader'
import { ChildRoutePage } from '../pages/ChildRoutePage'
import { PORTAL_PLATFORM_ITEMS } from '../pages/PortalHomePage'

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
    void portalAuth.completeRedirect(callback).then(returnTo => {
      if (current) void navigate(returnTo, {replace: true})
    }, () => { if (current) setFailed(true) })
    return () => { current = false }
  }, [callback, navigate])
  return <PortalLayout><Result status={failed ? 'error' : 'info'}
    title={failed ? '无法完成登录' : '正在验证登录'} /></PortalLayout>
}

export const PortalRouter = () => (
  <Routes>
    <Route path="/" element={<Navigate to={PORTAL_PLATFORM_ITEMS[0].path} replace />} />
    <Route path={PORTAL_CALLBACK_ROUTE} element={<OAuthCallbackPage />} />
    <Route path="/xingyuan/:platformKey/*" element={<ChildRoutePage />} />
    <Route path="/standalone/:platformKey" element={<StandaloneRedirectPage />} />
    <Route path="*" element={<Result status="404" title="页面不存在" subTitle="请从左侧平台菜单进入页面。" />} />
  </Routes>
)
