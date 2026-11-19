import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startApp } from 'wujie'
import type { ChildContext } from '../bridge/context'
import type { ChildManifest } from '../manifest/types'
import { WujieChild, resolveChildUrl } from './WujieChild'

const manifest: ChildManifest = {
  key: 'tianquan-shoubing',
  displayName: '身份与安全',
  resource: 'https://resources.example.invalid/tianquan-shoubing',
  url: '/children/tianquan-shoubing/',
  standaloneUrl: '/overview',
  version: '0.0.1',
  contractVersion: 'xingyuan-1',
  compatibleHostRange: '>=0.0.1 <0.1.0',
  requiredCapabilities: [],
}

const context: ChildContext = {
  platformKey: 'tianquan-shoubing',
  routeIntent: '/xingyuan/tianquan-shoubing/overview',
  scopeDisplay: 'default',
  hostVersion: '0.0.1',
  resourceContext: {issuer: 'https://identity.example/tenants/101', tenantId: '101', resource: manifest.resource},
}

afterEach(() => {
  vi.clearAllMocks()
})

beforeEach(() => {
  const testWindow = window as unknown as Record<string, unknown>
  delete testWindow.__WUJIE_TEST_EVENTS
  delete testWindow.__WUJIE_TEST_TRIGGER_LOAD_ERROR
})

describe('WujieChild', () => {
  it('mounts the child in a concrete host and reports MOUNTED', async () => {
    const onState = vi.fn()

    render(<WujieChild manifest={manifest} context={context} onState={onState} />)

    await waitFor(() => expect(onState).toHaveBeenCalledWith({
      type: 'MOUNTED',
      cleanupToken: expect.stringMatching(/^tianquan-shoubing-\d+$/),
    }))
    expect(screen.getByTestId('wujie-host-tianquan-shoubing')).toBeInTheDocument()
    expect(vi.mocked(startApp)).toHaveBeenCalledWith(expect.objectContaining({
      name: expect.stringMatching(/^tianquan-shoubing-\d+$/),
      url: expect.stringMatching(/\/overview$/),
      el: expect.any(HTMLElement),
      attrs: {src: new URL('/wujie-empty.html', window.location.origin).toString()},
      degradeAttrs: {title: '身份与安全', style: 'display:block;width:100%;height:100%;border:0;box-shadow:none'},
      fiber: false,
      sync: false,
    }))
    expect(screen.getByTestId('wujie-host-tianquan-shoubing')).toContainElement(vi.mocked(startApp).mock.lastCall![0].el as HTMLElement)
    expect(screen.getByTestId('wujie-host-tianquan-shoubing')).toHaveStyle({
      height: '100%',
      minHeight: '0',
      overflow: 'auto',
    })
  })

  it('requires the selected child Resource and forwards only its public context', async () => {
    const onState = vi.fn()
    const wrong = {...context, resourceContext: {...context.resourceContext!, resource: 'https://resources.example.invalid/portal'}}
    const view = render(<WujieChild manifest={manifest} context={wrong} onState={onState} />)
    await waitFor(() => expect(onState).toHaveBeenCalledWith(expect.objectContaining({code: 'CHILD_RESOURCE_NOT_ALLOWED'})))
    expect(startApp).not.toHaveBeenCalled()
    view.rerender(<WujieChild manifest={{...manifest, resource: wrong.resourceContext.resource}} context={wrong} onState={onState} />)
    await waitFor(() => expect(onState).toHaveBeenCalledWith(expect.objectContaining({message: 'Child Resource is not approved for this entry'})))
    expect(startApp).not.toHaveBeenCalled()
    view.rerender(<WujieChild manifest={manifest} context={{...context, accessToken: 'unsafe'} as ChildContext} onState={onState} />)
    await waitFor(() => expect(startApp).toHaveBeenCalledOnce())
    const props = vi.mocked(startApp).mock.lastCall?.[0].props
    expect(props?.resourceContext).toEqual(context.resourceContext)
    expect(JSON.stringify(props)).not.toContain('unsafe')
  })

  it('aborts the previous sandbox fetch and rejects stale lifecycle callbacks on tenant change', async () => {
    const events = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue(new Response('asset'))
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<WujieChild manifest={manifest} context={context} onState={events} />)
    await waitFor(() => expect(startApp).toHaveBeenCalledOnce())
    const old = vi.mocked(startApp).mock.calls[0][0]
    await old.fetch!('/asset.js')
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    expect(fetchMock.mock.calls[0][1]).toMatchObject({credentials: 'omit', redirect: 'error'})
    view.rerender(<WujieChild manifest={manifest} context={{...context,
      resourceContext: {...context.resourceContext!, tenantId: '102', issuer: 'https://identity.example/tenants/102'}}} onState={events} />)
    await waitFor(() => expect(startApp).toHaveBeenCalledTimes(2))
    expect(signal.aborted).toBe(true)
    const current = vi.mocked(startApp).mock.lastCall![0]
    expect(current.name).not.toBe(old.name)
    const count = events.mock.calls.length
    old.afterMount?.(window)
    old.loadError?.('/asset.js', new Error('stale'))
    expect(events).toHaveBeenCalledTimes(count)
    vi.unstubAllGlobals()
  })

  it('detaches the old DOM and reports cleanup even when Wujie destruction fails', async () => {
    vi.mocked(startApp).mockImplementationOnce(async options => {
      options.afterMount?.(window)
      return () => { throw new Error('destroy failed') }
    })
    const events = vi.fn()
    const view = render(<WujieChild manifest={manifest} context={context} onState={events} />)
    await waitFor(() => expect(startApp).toHaveBeenCalledOnce())
    const element = vi.mocked(startApp).mock.lastCall![0].el as HTMLElement
    expect(element.isConnected).toBe(true)
    view.unmount()
    expect(element.isConnected).toBe(false)
    await waitFor(() => expect(events).toHaveBeenCalledWith({type: 'CLEANED'}))
  })

  it('turns a Core mount rejection into a recoverable mount failure', async () => {
    vi.mocked(startApp).mockRejectedValueOnce(new Error('sandbox failed'))
    const onState = vi.fn()

    render(<WujieChild manifest={manifest} context={context} onState={onState} />)

    await waitFor(() => expect(onState).toHaveBeenCalledWith({
      type: 'MOUNT_FAILED',
      code: 'CHILD_MOUNT_FAILED',
      message: 'Child mount rejected',
    }))
    expect(screen.getByTestId('wujie-host-tianquan-shoubing')).toBeInTheDocument()
  })

  it('does not start a sandbox after the mounting effect was cancelled', async () => {
    const rendered = render(<WujieChild manifest={manifest} context={context} onState={vi.fn()} />)
    rendered.unmount()

    await Promise.resolve()

    expect(startApp).not.toHaveBeenCalled()
  })

  it('destroys the Core instance when the host unmounts', async () => {
    const onState = vi.fn()
    const rendered = render(<WujieChild manifest={manifest} context={context} onState={onState} />)

    await waitFor(() => expect(onState).toHaveBeenCalledWith({
      type: 'MOUNTED',
      cleanupToken: expect.stringMatching(/^tianquan-shoubing-\d+$/),
    }))
    rendered.unmount()

    await waitFor(() => expect(onState).toHaveBeenCalledWith({ type: 'CLEANED' }))
    expect((window as unknown as { __WUJIE_TEST_EVENTS?: string[] }).__WUJIE_TEST_EVENTS)
      .toContain('afterUnmount')
  })
})


describe('mounted child route boundary', () => {
  it('strips query and fragment from route intent before passing the child URL to Wujie', () => {
    expect(resolveChildUrl('/children/tianshu/', 'tianshu', '/xingyuan/tianshu/registry?tenant=forged#section'))
      .toBe(new URL('/children/tianshu/registry', window.location.href).toString())
  })
  it('keeps encoded traversal inside the approved mount by rejecting the suffix', () => {
    expect(resolveChildUrl('/children/tianshu/', 'tianshu', '/xingyuan/tianshu/%252e%252e/yuheng/catalog'))
      .toBe(new URL('/children/tianshu/', window.location.href).toString())
  })
})
