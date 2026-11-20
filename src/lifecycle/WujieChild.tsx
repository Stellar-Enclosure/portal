import { startApp } from 'wujie'
import {
  bridgeFail,
  bridgeOk,
  validateAppCatalogUpdate,
  validateRouteRequest,
  WORKBENCH_PROTOCOL_VERSION,
  type AppCatalogUpdate,
  type BridgeResult,
  type LeaveCheck,
  type LeaveResult,
  type Presentation,
  type RouteRequest,
  type RouteTarget,
  type WorkbenchHost,
  type WorkbenchPort,
} from '@stellar-enclosure/stellar-enclosure-web-shared'
import type { PropsWithChildren, ReactNode } from 'react'
import { Component, useEffect, useRef, useState } from 'react'
import { Alert } from 'antd'
import type { ChildContext } from '../bridge/context'
import { buildWorkbenchMountProps } from '../bridge/context'
import { PORTAL_HOST_VERSION, validateChildResource, validateChildUrl } from '../manifest/loader'
import type { ChildContractVersion, ChildManifest } from '../manifest/types'
import { encodeTabKey, resolveWorkbenchUrl } from '../app/workbench/workbenchRoutes'
import type { LifecycleEvent } from './lifecycleState'

export const WORKBENCH_ATTACH_TIMEOUT_MS = 10_000
export const WORKBENCH_PRESENT_TIMEOUT_MS = 5_000

export interface WujieChildProps {
  readonly manifest: ChildManifest
  readonly context: ChildContext
  readonly active?: boolean
  readonly activeTabKey?: string
  readonly onState: (event: LifecycleEvent) => void
  readonly onCatalogUpdate?: (update: AppCatalogUpdate) => void
  readonly onNavigationRequest?: (request: RouteRequest) => void
  readonly onPortReady?: (port: WorkbenchPort | undefined) => void
}

const childRouteSuffix = (platformKey: ChildManifest['key'], routeIntent?: string): string => {
  routeIntent = routeIntent?.split(/[?#]/, 1)[0]
  const prefix = `/xingyuan/${platformKey}`
  if (!routeIntent || (routeIntent !== prefix && !routeIntent.startsWith(`${prefix}/`))) {
    return ''
  }

  try {
    const decoded = decodeURIComponent(routeIntent.slice(prefix.length)).split(/[?#]/, 1)[0]
    const segments = decoded.split('/')
    if (/[\\]/.test(decoded) || Array.from(decoded).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || /%[0-9a-f]{2}/i.test(decoded)
      || segments.some((segment) => segment === '..')) {
      return ''
    }
    return segments.filter((segment) => segment && segment !== '.').join('/')
  } catch {
    return ''
  }
}

export const resolveChildUrl = (
  manifestUrl: string,
  platformKey: ChildManifest['key'],
  routeIntent?: string,
  contractVersion: ChildContractVersion = 'xingyuan-1',
): string => {
  const baseUrl = validateChildUrl(manifestUrl, platformKey)
  if (contractVersion === 'workbench-1') {
    baseUrl.search = ''
    baseUrl.hash = ''
    return baseUrl.toString()
  }
  const routeSuffix = childRouteSuffix(platformKey, routeIntent)
  if (!routeSuffix) {
    baseUrl.search = ''
    baseUrl.hash = ''
    return baseUrl.toString()
  }

  const basePath = baseUrl.pathname.endsWith('/')
    ? baseUrl.pathname
    : baseUrl.pathname.slice(0, baseUrl.pathname.lastIndexOf('/') + 1)
  baseUrl.pathname = `${basePath}${routeSuffix}`
  baseUrl.search = ''
  baseUrl.hash = ''
  return baseUrl.toString()
}

const targetFromRouteIntent = (platformKey: ChildManifest['key'], routeIntent?: string): RouteTarget => {
  if (!routeIntent) {
    return { path: '/workbench', search: '' }
  }
  const resolved = resolveWorkbenchUrl(routeIntent)
  if ((resolved.kind === 'app-page' || resolved.kind === 'app-workbench') && resolved.platformKey === platformKey) {
    return resolved.target
  }
  return { path: '/workbench', search: '' }
}

interface ChildErrorBoundaryProps extends PropsWithChildren {
  readonly onCrash: () => void
}

interface ChildErrorBoundaryState {
  readonly error: Error | null
}

class ChildErrorBoundary extends Component<ChildErrorBoundaryProps, ChildErrorBoundaryState> {
  state: ChildErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ChildErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(): void {
    this.props.onCrash()
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <Alert
          type="error"
          showIcon
          message="子应用运行异常"
          description="当前子应用已隔离，可重新挂载或独立打开。"
        />
      )
    }
    return this.props.children
  }
}

let nextMount = 0

export const WujieChild = ({
  manifest,
  context,
  active = true,
  activeTabKey,
  onState,
  onCatalogUpdate,
  onNavigationRequest,
  onPortReady,
}: WujieChildProps) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const destroyRef = useRef<(() => unknown) | undefined>(undefined)
  const currentMount = useRef<string | undefined>(undefined)
  const [attachedPort, setAttachedPort] = useState<WorkbenchPort | undefined>(undefined)
  const navigationSeqRef = useRef(0)
  const presentAbortRef = useRef<AbortController | undefined>(undefined)

  const onStateRef = useRef(onState)
  const onCatalogRef = useRef(onCatalogUpdate)
  const onNavReqRef = useRef(onNavigationRequest)
  const onPortReadyRef = useRef(onPortReady)
  const activeRef = useRef(active)

  useEffect(() => {
    onStateRef.current = onState
    onCatalogRef.current = onCatalogUpdate
    onNavReqRef.current = onNavigationRequest
    onPortReadyRef.current = onPortReady
    activeRef.current = active
  }, [onState, onCatalogUpdate, onNavigationRequest, onPortReady, active])

  const { routeIntent, resourceContext, scopeDisplay, hostVersion } = context
  const { issuer, tenantId, resource } = resourceContext ?? {}
  const mountRouteIntent = manifest.contractVersion === 'workbench-1' ? undefined : routeIntent

  useEffect(() => {
    const instanceName = `${manifest.key}-${++nextMount}`
    currentMount.current = instanceName
    const host = hostRef.current
    if (!host) {
      onStateRef.current({
        type: 'MOUNT_FAILED',
        code: 'CHILD_HOST_UNAVAILABLE',
        message: 'Child mount host is unavailable',
      })
      return
    }

    if (!issuer || !tenantId || resource !== manifest.resource) {
      onStateRef.current({ type: 'MOUNT_FAILED', code: 'CHILD_RESOURCE_NOT_ALLOWED', message: 'Child Resource does not match Portal context' })
      return
    }
    try {
      validateChildResource(manifest.key, resource)
    } catch {
      onStateRef.current({ type: 'MOUNT_FAILED', code: 'CHILD_RESOURCE_NOT_ALLOWED', message: 'Child Resource is not approved for this entry' })
      return
    }

    const requests = new AbortController()
    let disposed = false
    let timedOut = false
    let cleanupReported = false
    let boundPort: WorkbenchPort | undefined
    let lastCatalogRevision = 0
    let lastRequestId = 0
    let attachTimer: ReturnType<typeof setTimeout> | undefined

    const isAlive = (): boolean => !disposed && !timedOut && currentMount.current === instanceName
    const reportCleaned = (): void => {
      if (cleanupReported || currentMount.current !== instanceName) return
      cleanupReported = true
      onStateRef.current({ type: 'CLEANED' })
    }
    const reportUnmount = (): void => {
      if (currentMount.current === instanceName) onStateRef.current({ type: 'UNMOUNT' })
    }
    const destroyMount = (destroy: () => unknown) => {
      void Promise.resolve().then(destroy).then(reportCleaned, reportCleaned)
    }

    const wrappedPort = (rawPort: WorkbenchPort): WorkbenchPort => ({
      version: WORKBENCH_PROTOCOL_VERSION,
      present: async (presentation: Presentation): Promise<BridgeResult> => {
        if (!isAlive() || boundPort !== rawPort) {
          return bridgeFail('STALE_INSTANCE')
        }
        const timerController = new AbortController()
        const onUpstreamAbort = () => timerController.abort()
        presentation.signal.addEventListener('abort', onUpstreamAbort, { once: true })
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        try {
          const timeoutPromise = new Promise<BridgeResult>((resolve) => {
            timeoutId = setTimeout(() => {
              timerController.abort()
              resolve(bridgeFail('TIMEOUT'))
            }, WORKBENCH_PRESENT_TIMEOUT_MS)
          })
          return await Promise.race([
            rawPort.present({ ...presentation, signal: timerController.signal }),
            timeoutPromise,
          ])
        } catch {
          return bridgeFail('INVALID_INPUT')
        } finally {
          if (timeoutId !== undefined) clearTimeout(timeoutId)
          presentation.signal.removeEventListener('abort', onUpstreamAbort)
        }
      },
      checkLeave: (check: LeaveCheck): LeaveResult => {
        if (!isAlive() || boundPort !== rawPort) {
          return bridgeFail('STALE_INSTANCE')
        }
        try {
          return rawPort.checkLeave(check)
        } catch {
          return bridgeFail('INVALID_INPUT')
        }
      },
    })

    const scopedHost: WorkbenchHost | undefined =
      manifest.contractVersion === 'workbench-1'
        ? {
            attach: (port: WorkbenchPort): BridgeResult => {
              if (!isAlive()) {
                return bridgeFail('STALE_INSTANCE')
              }
              if (!port || typeof port !== 'object') {
                return bridgeFail('INVALID_INPUT')
              }
              if (port.version !== WORKBENCH_PROTOCOL_VERSION) {
                return bridgeFail('VERSION_MISMATCH')
              }
              if (typeof port.present !== 'function' || typeof port.checkLeave !== 'function') {
                return bridgeFail('INVALID_INPUT')
              }
              if (boundPort && boundPort !== port) {
                return bridgeFail('INVALID_INPUT')
              }
              if (boundPort === port) {
                return bridgeOk()
              }
              boundPort = port
              if (attachTimer !== undefined) {
                clearTimeout(attachTimer)
                attachTimer = undefined
              }
              const exposed = wrappedPort(port)
              setAttachedPort(exposed)
              onPortReadyRef.current?.(exposed)
              onStateRef.current({ type: 'ATTACHED' })
              return bridgeOk()
            },
            reportCatalog: (update: AppCatalogUpdate): BridgeResult => {
              if (!isAlive() || !boundPort) {
                return bridgeFail('STALE_INSTANCE')
              }
              if (!validateAppCatalogUpdate(update)) {
                return bridgeFail('INVALID_INPUT')
              }
              if (update.catalogRevision < lastCatalogRevision) {
                return bridgeFail('SUPERSEDED')
              }
              if (update.catalogRevision === lastCatalogRevision) {
                return bridgeOk()
              }
              lastCatalogRevision = update.catalogRevision
              onStateRef.current({
                type: 'CATALOG_UPDATE',
                status: update.status,
                revision: update.catalogRevision,
              })
              onCatalogRef.current?.(update)
              return bridgeOk()
            },
            requestNavigation: (request: RouteRequest): BridgeResult => {
              if (!isAlive() || !boundPort || !activeRef.current) {
                return bridgeFail('STALE_INSTANCE')
              }
              if (!validateRouteRequest(request)) {
                return bridgeFail('INVALID_INPUT')
              }
              if (request.requestId <= lastRequestId) {
                return bridgeFail('SUPERSEDED')
              }
              lastRequestId = request.requestId
              onNavReqRef.current?.(request)
              return bridgeOk()
            },
          }
        : undefined

    const safeProps = buildWorkbenchMountProps(
      {
        platformKey: manifest.key,
        routeIntent: mountRouteIntent,
        scopeDisplay,
        hostVersion: hostVersion ?? PORTAL_HOST_VERSION,
        resourceContext: { issuer, tenantId, resource },
      },
      manifest.contractVersion,
      scopedHost,
    )

    if (!safeProps.resourceContext) {
      onStateRef.current({ type: 'MOUNT_FAILED', code: 'CHILD_RESOURCE_NOT_ALLOWED', message: 'Child Resource context is invalid' })
      return
    }

    let childUrl: string
    try {
      childUrl = resolveChildUrl(manifest.url, manifest.key, mountRouteIntent, manifest.contractVersion)
    } catch {
      onStateRef.current({ type: 'MOUNT_FAILED', code: 'CHILD_URL_NOT_ALLOWED', message: 'Child mount URL is not allowed' })
      return
    }

    const mount = document.createElement('div')
    mount.style.height = '100%'
    host.append(mount)
    onStateRef.current({ type: 'LOAD' })

    if (manifest.contractVersion === 'workbench-1') {
      attachTimer = setTimeout(() => {
        if (!disposed && !boundPort && currentMount.current === instanceName) {
          timedOut = true
          requests.abort()
          setAttachedPort(undefined)
          onPortReadyRef.current?.(undefined)
          onStateRef.current({
            type: 'MOUNT_FAILED',
            code: 'WORKBENCH_ATTACH_TIMEOUT',
            message: 'Child workbench handshake timed out after 10s',
          })
          const destroy = destroyRef.current
          destroyRef.current = undefined
          if (destroy) {
            destroyMount(destroy)
          }
        }
      }, WORKBENCH_ATTACH_TIMEOUT_MS)
    }

    void Promise.resolve().then(() => disposed ? undefined : startApp({
      name: instanceName,
      fetch: (input, init) => {
        const upstream = init?.signal ?? (typeof input === 'string' ? undefined : input.signal)
        const signal = upstream ? AbortSignal.any([upstream, requests.signal]) : requests.signal
        signal.throwIfAborted()
        return globalThis.fetch(input, { ...init, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal })
      },
      url: childUrl,
      el: mount,
      attrs: { src: new URL(`${import.meta.env.BASE_URL}wujie-empty.html`, window.location.origin).toString() },
      degradeAttrs: { title: manifest.displayName, style: 'display:block;width:100%;height:100%;border:0;box-shadow:none' },
      sync: false,
      fiber: false,
      degrade: import.meta.env.DEV,
      plugins: [{
        cssAfterLoaders: [{
          content: `
            html, body, #root { height: 100%; min-width: 0; margin: 0; }
            #root > .ant-layout, #root > .ant-app, #root > .ant-app > .ant-layout {
              height: 100%; min-height: 0 !important;
            }
            .ant-layout-content { min-height: 0; }
          `,
        }],
      }],
      props: safeProps,
      afterMount: () => {
        if (!disposed && !timedOut) onStateRef.current({ type: 'MOUNTED', cleanupToken: instanceName })
      },
      beforeUnmount: reportUnmount,
      afterUnmount: reportCleaned,
      loadError: () => {
        if (!disposed && !timedOut) onStateRef.current({ type: 'MOUNT_FAILED', code: 'CHILD_LOAD_ERROR', message: 'Child asset failed to load' })
      },
    }))
      .then((destroy) => {
        const destroyFunction = typeof destroy === 'function'
          ? destroy as () => unknown
          : undefined
        if (disposed || timedOut) {
          if (destroyFunction) {
            destroyMount(destroyFunction)
          } else {
            reportCleaned()
          }
          return
        }
        destroyRef.current = destroyFunction
      })
      .catch(() => {
        if (!disposed && !timedOut) {
          onStateRef.current({
            type: 'MOUNT_FAILED',
            code: 'CHILD_MOUNT_FAILED',
            message: 'Child mount rejected',
          })
        }
      })

    return () => {
      disposed = true
      if (attachTimer !== undefined) {
        clearTimeout(attachTimer)
        attachTimer = undefined
      }
      presentAbortRef.current?.abort()
      presentAbortRef.current = undefined
      boundPort = undefined
      setAttachedPort(undefined)
      onPortReadyRef.current?.(undefined)
      requests.abort()
      mount.remove()
      const destroy = destroyRef.current
      destroyRef.current = undefined
      if (destroy) {
        destroyMount(destroy)
      } else {
        reportUnmount()
        reportCleaned()
      }
    }
  }, [mountRouteIntent, issuer, tenantId, resource, scopeDisplay, hostVersion, manifest.key, manifest.url, manifest.resource, manifest.version, manifest.displayName, manifest.contractVersion])

  useEffect(() => {
    if (manifest.contractVersion !== 'workbench-1' || !attachedPort) {
      return
    }
    presentAbortRef.current?.abort()
    const controller = new AbortController()
    presentAbortRef.current = controller
    navigationSeqRef.current += 1
    const navigationId = navigationSeqRef.current

    if (!active) {
      onStateRef.current({ type: 'SUSPEND' })
      void attachedPort.present({
        mode: 'suspend',
        navigationId,
        signal: controller.signal,
      })
    } else {
      const target = targetFromRouteIntent(manifest.key, routeIntent)
      const tabKey = activeTabKey ?? encodeTabKey(manifest.key, target.path)
      onStateRef.current({ type: 'RESUME' })
      void attachedPort.present({
        mode: 'show',
        navigationId,
        target,
        tabKey,
        signal: controller.signal,
      })
    }

    return () => {
      controller.abort()
    }
  }, [attachedPort, active, routeIntent, activeTabKey, manifest.contractVersion, manifest.key])

  return (
    <ChildErrorBoundary onCrash={() => onStateRef.current({ type: 'CHILD_CRASHED', message: 'Child render failed' })}>
      <div
        ref={hostRef}
        className="portal-child-host"
        data-testid={`wujie-host-${manifest.key}`}
        style={{ width: '100%', height: '100%', minHeight: 0, overflow: 'auto' }}
      />
    </ChildErrorBoundary>
  )
}
