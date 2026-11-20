import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startApp } from 'wujie'
import type { WorkbenchHost, WorkbenchPort } from '@stellar-enclosure/stellar-enclosure-web-shared'
import type { ChildContext } from '../bridge/context'
import type { ChildManifest } from '../manifest/types'
import { WujieChild } from './WujieChild'

const workbenchManifest: ChildManifest = {
  key: 'tianshu',
  displayName: '配置中心',
  resource: 'https://resources.example.invalid/tianshu',
  url: '/children/tianshu/',
  standaloneUrl: '/tianshu/registry',
  version: '0.0.2',
  contractVersion: 'workbench-1',
  compatibleHostRange: '>=0.0.1 <0.1.0',
  requiredCapabilities: ['tianshu:read'],
}

const legacyManifest: ChildManifest = {
  ...workbenchManifest,
  key: 'tianquan-shoubing',
  displayName: '身份与安全',
  resource: 'https://resources.example.invalid/tianquan-shoubing',
  url: '/children/tianquan-shoubing/',
  standaloneUrl: '/tianquan-shoubing/overview',
  contractVersion: 'xingyuan-1',
}

const baseContext: ChildContext = {
  platformKey: 'tianshu',
  routeIntent: '/xingyuan/tianshu/publish-tasks',
  scopeDisplay: '101',
  hostVersion: '0.0.2',
  resourceContext: {
    issuer: 'https://identity.example/tenants/101',
    tenantId: '101',
    resource: workbenchManifest.resource,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('WorkbenchBridge host-child protocol (INTERNAL-001 to INTERNAL-005)', () => {
  it('mounts a workbench-1 app once across route switches, attaches port, and forwards present/suspend/checkLeave', async () => {
    const presentSpy = vi.fn(async () => ({ ok: true as const }))
    const checkLeaveSpy = vi.fn(() => ({
      ok: true as const,
      dirty: true,
      pendingMutation: false,
      guardRevision: 2,
    }))
    const onCatalog = vi.fn()
    const onNavRequest = vi.fn()
    const onState = vi.fn()

    let capturedHost: WorkbenchHost | undefined
    vi.mocked(startApp).mockImplementationOnce(async (options) => {
      capturedHost = (options.props as { workbenchHost?: WorkbenchHost } | undefined)?.workbenchHost
      options.afterMount?.(window)
      return vi.fn()
    })

    const { rerender, unmount } = render(
      <WujieChild
        manifest={workbenchManifest}
        context={baseContext}
        onState={onState}
        onCatalogUpdate={onCatalog}
        onNavigationRequest={onNavRequest}
      />,
    )

    await waitFor(() => expect(startApp).toHaveBeenCalledTimes(1))
    expect(capturedHost).toBeDefined()

    const port: WorkbenchPort = {
      version: 'workbench-1',
      present: presentSpy,
      checkLeave: checkLeaveSpy,
    }
    expect(capturedHost!.attach(port)).toEqual({ ok: true })
    expect(
      capturedHost!.reportCatalog({
        catalogRevision: 1,
        status: 'ready',
        pages: [
          {
            pageId: 'tianshu.page.publishTasks',
            pattern: '/publish-tasks',
            label: '发布任务',
            identityParams: [],
            queryKeys: ['changeId'],
          },
        ],
      }),
    ).toEqual({ ok: true })
    expect(onCatalog).toHaveBeenCalledTimes(1)

    // Same-APP route change must reuse the mounted instance via port.present, NOT remount Wujie
    rerender(
      <WujieChild
        manifest={workbenchManifest}
        context={{ ...baseContext, routeIntent: '/xingyuan/tianshu/configs' }}
        onState={onState}
        onCatalogUpdate={onCatalog}
        onNavigationRequest={onNavRequest}
      />,
    )

    await waitFor(() =>
      expect(presentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'show',
          target: { path: '/configs', search: '' },
        }),
      ),
    )
    expect(startApp).toHaveBeenCalledTimes(1)

    // Request navigation from child routes to host callback
    expect(
      capturedHost!.requestNavigation({
        requestId: 1,
        mode: 'push',
        target: { path: '/publish-tasks', search: '?changeId=chg-1' },
      }),
    ).toEqual({ ok: true })
    expect(onNavRequest).toHaveBeenCalledWith({
      requestId: 1,
      mode: 'push',
      target: { path: '/publish-tasks', search: '?changeId=chg-1' },
    })

    unmount()
    // Stale host must reject calls after unmount
    expect(capturedHost!.attach(port)).toEqual({ ok: false, code: 'STALE_INSTANCE' })
  })

  it('never passes workbenchHost to legacy xingyuan-1 manifests and enforces 10s handshake timeout', async () => {
    vi.useFakeTimers()
    const onState = vi.fn()
    let capturedLegacyProps: Record<string, unknown> | undefined
    vi.mocked(startApp).mockImplementationOnce(async (options) => {
      capturedLegacyProps = options.props as Record<string, unknown>
      options.afterMount?.(window)
      return vi.fn()
    })

    const { unmount } = render(
      <WujieChild
        manifest={legacyManifest}
        context={{
          ...baseContext,
          platformKey: 'tianquan-shoubing',
          resourceContext: {
            issuer: 'https://identity.example/tenants/101',
            tenantId: '101',
            resource: legacyManifest.resource,
          },
        }}
        onState={onState}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(capturedLegacyProps).toBeDefined()
    expect(capturedLegacyProps?.workbenchHost).toBeUndefined()
    unmount()

    // Workbench-1 handshake times out after 10,000 ms if child never attaches
    const timeoutEvents = vi.fn()
    let timedOutHost: WorkbenchHost | undefined
    vi.mocked(startApp).mockImplementationOnce(async (options) => {
      timedOutHost = (options.props as { workbenchHost?: WorkbenchHost } | undefined)?.workbenchHost
      options.afterMount?.(window)
      return vi.fn()
    })

    render(
      <WujieChild
        manifest={workbenchManifest}
        context={baseContext}
        onState={timeoutEvents}
      />,
    )

    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(timeoutEvents).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MOUNT_FAILED', code: 'WORKBENCH_ATTACH_TIMEOUT' }),
    )
    expect(
      timedOutHost!.attach({
        version: 'workbench-1',
        present: async () => ({ ok: true }),
        checkLeave: () => ({ ok: true, dirty: false, pendingMutation: false, guardRevision: 0 }),
      }),
    ).toEqual({ ok: false, code: 'STALE_INSTANCE' })
  })
})
