import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Result, Space, Spin, Typography } from 'antd'
import { useEffect, useReducer, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import {PortalLayout} from '../app/PortalLayout'
import {usePortalSession, type PortalSession} from '../auth/portalAuth'
import { buildChildProps } from '../bridge/context'
import { ManifestLoadError, PORTAL_HOST_VERSION, loadManifest, standaloneEntry } from '../manifest/loader'
import type { PlatformKey } from '../manifest/types'
import { WujieChild } from '../lifecycle/WujieChild'
import {
  initialLifecycleState,
  reduceLifecycle,
} from '../lifecycle/lifecycleState'

const isPlatformKey = (value: string | undefined): value is PlatformKey => (
  value === 'tianquan-shoubing' || value === 'tianquan-jianshen' || value === 'yuheng' || value === 'tianshu' || value === 'yaoguang'
)

const errorCopy = (error: unknown): string => {
  if (error instanceof ManifestLoadError) {
    switch (error.code) {
      case 'MANIFEST_VERSION_UNSUPPORTED':
        return '子应用版本不兼容，暂未挂载'
      case 'MANIFEST_RESOURCE_NOT_ALLOWED':
        return '子应用资源未获部署批准，暂未挂载'
      case 'MANIFEST_URL_NOT_ALLOWED':
        return '子应用地址不安全，暂未挂载'
      case 'MANIFEST_FETCH_FAILED':
        return '子应用清单加载失败'
      default:
        return '子应用清单无效'
    }
  }
  return '子应用加载失败'
}

interface MountFailureProps {
  readonly message: string
  readonly standaloneUrl?: string
  readonly retryLabel: string
  readonly onRetry: () => void
}

const MountFailure = ({ message, standaloneUrl, retryLabel, onRetry }: MountFailureProps) => (
  <Alert
    type="error"
    showIcon
    message={message}
    description={(
      <Space wrap>
        <Button type="primary" size="small" onClick={onRetry}>{retryLabel}</Button>
        {standaloneUrl && <a href={standaloneUrl}>独立打开</a>}
      </Space>
    )}
  />
)

export const ChildRoutePage = () => {
  const {platformKey} = useParams()
  const {pathname} = useLocation()
  const session = usePortalSession()
  let child: React.ReactNode
  if (!isPlatformKey(platformKey)) {
    child = <Result status="404" title="平台不存在" />
  } else if (!session.identity || session.pending) {
    const url = standaloneEntry(platformKey)
    child = <Result status="info" title="登录后可在门户中打开平台"
      extra={url && <a href={url}>独立打开</a>} />
  } else {
    child = <AuthorizedChild key={`${session.epoch}:${pathname}`} platformKey={platformKey}
      pathname={pathname} identity={session.identity} epoch={session.epoch} />
  }
  return <PortalLayout>{child}</PortalLayout>
}

interface AuthorizedChildProps {
  readonly platformKey: PlatformKey
  readonly pathname: string
  readonly identity: NonNullable<PortalSession['identity']>
  readonly epoch: number
}

const AuthorizedChild = ({platformKey, pathname, identity, epoch}: AuthorizedChildProps) => {
  const environment = import.meta.env.VITE_PORTAL_ENV ?? 'local'
  const [lifecycle, dispatch] = useReducer(
    reduceLifecycle,
    platformKey,
    initialLifecycleState,
  )
  const [mountKey, setMountKey] = useState(0)
  const [remounting, setRemounting] = useState(false)

  const manifestQuery = useQuery({
    queryKey: ['portal-manifest', platformKey, environment, identity.tenantId, epoch],
    queryFn: ({signal}) => loadManifest(platformKey, environment, signal),
  })

  useEffect(() => {
    if (!remounting || lifecycle.status !== 'IDLE') return
    // The child has completed afterUnmount; only now is a new Wujie instance allowed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMountKey((current) => current + 1)
    setRemounting(false)
  }, [lifecycle.status, remounting])

  let content: React.ReactNode
  if (manifestQuery.isPending) {
    content = <Spin description="加载子应用清单" />
  } else if (manifestQuery.error) {
    content = (
      <MountFailure
        message={errorCopy(manifestQuery.error)}
        standaloneUrl={standaloneEntry(platformKey)}
        retryLabel="重试加载"
        onRetry={() => { void manifestQuery.refetch() }}
      />
    )
  } else if (!manifestQuery.data) {
    content = <Typography.Text type="secondary">子应用清单为空</Typography.Text>
  } else {
    const isFailure = lifecycle.status === 'MOUNT_FAILED' || lifecycle.status === 'CRASHED'
    const handleRemount = (): void => {
      setRemounting(true)
      dispatch({ type: 'UNMOUNT' })
    }
    const safeContext = buildChildProps({
      platformKey,
      routeIntent: pathname,
      scopeDisplay: identity.tenantId,
      resourceContext: { issuer: identity.issuer, tenantId: identity.tenantId, resource: manifestQuery.data.resource },
      hostVersion: PORTAL_HOST_VERSION,
    })
    content = (
      <div className="portal-child-stage">
        {isFailure && (
          <MountFailure
            message={lifecycle.status === 'CRASHED' ? '子应用运行异常' : '子应用加载失败'}
            standaloneUrl={manifestQuery.data.standaloneUrl}
            retryLabel="重新挂载"
            onRetry={handleRemount}
          />
        )}
        {!remounting && (
          <div className="portal-child-mount" style={isFailure ? { display: 'none' } : undefined}>
            <WujieChild
              key={`${manifestQuery.data.key}:${mountKey}`}
              manifest={manifestQuery.data}
              context={safeContext}
              onState={dispatch}
            />
          </div>
        )}
      </div>
    )
  }

  return content
}
