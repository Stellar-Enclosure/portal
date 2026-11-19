import {afterEach, describe, expect, it, vi} from 'vitest'
import {loadManifest} from './loader'

const manifest = (overrides: Record<string, unknown> = {}) => ({
  key: 'tianquan-shoubing',
  displayName: 'Tianquan-Shoubing',
  resource: 'https://resources.example.invalid/tianquan-shoubing',
  url: '/children/tianquan-shoubing/',
  standaloneUrl: '/tianquan-shoubing/overview',
  version: '0.0.1',
  contractVersion: 'xingyuan-1',
  compatibleHostRange: '>=0.0.1 <0.1.0',
  requiredCapabilities: ['tianquan-shoubing:read'],
  ...overrides,
})

const jsonResponse = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } },
)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('loadManifest', () => {
  it('accepts a compatible manifest and keeps the standalone fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(manifest()))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadManifest('tianquan-shoubing', 'local', new AbortController().signal)).resolves.toMatchObject({
      key: 'tianquan-shoubing',
      url: '/children/tianquan-shoubing/',
      standaloneUrl: '/tianquan-shoubing/overview',
    })
    expect(fetchMock).toHaveBeenCalledWith('/portal-manifest/local.json', {
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    })
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has('Authorization')).toBe(false)
  })

  it('selects a xingyuan entry and allows explicit local child origins', async () => {
    vi.stubEnv('VITE_PORTAL_CHILD_BINDINGS', JSON.stringify({ yuheng: {
      resource: 'https://resources.example.invalid/yuheng', url: 'http://localhost:18141/',
      standaloneUrl: 'http://localhost:18141/dashboard',
    } }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
        'tianquan-shoubing': manifest(),
      yuheng: manifest({
        key: 'yuheng',
        resource: 'https://resources.example.invalid/yuheng',
        url: 'http://localhost:18141/',
        standaloneUrl: 'http://localhost:18141/dashboard',
        requiredCapabilities: ['yuheng:read'],
      }),
    })))

    await expect(loadManifest('yuheng', 'local', new AbortController().signal))
      .resolves.toMatchObject({
        key: 'yuheng',
        resource: 'https://resources.example.invalid/yuheng',
        url: 'http://localhost:18141/',
        standaloneUrl: 'http://localhost:18141/dashboard',
      })
  })

  it('rejects invalid manifests before a child can mount', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(manifest({ url: '' }))))

    await expect(loadManifest('tianquan-shoubing', 'local', new AbortController().signal))
      .rejects.toMatchObject({ code: 'MANIFEST_INVALID' })
  })

  it('rejects a manifest outside the Portal host version range', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(
      manifest({ compatibleHostRange: '>=9.0.0' }),
    )))

    await expect(loadManifest('tianquan-shoubing', 'local', new AbortController().signal))
      .rejects.toMatchObject({ code: 'MANIFEST_VERSION_UNSUPPORTED' })
  })

  it('rejects unsafe asset URLs and drops unknown sensitive fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(manifest({
      url: 'https://untrusted.example/child.js',
      accessToken: 'must-not-cross-the-boundary',
    }))))

    await expect(loadManifest('tianquan-shoubing', 'local', new AbortController().signal))
      .rejects.toMatchObject({ code: 'MANIFEST_URL_NOT_ALLOWED' })
  })

  it('rejects an allowlisted asset URL with an unapproved Resource', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(manifest({resource: 'https://resources.example.invalid/yuheng'}))))
    await expect(loadManifest('tianquan-shoubing', 'local', new AbortController().signal))
      .rejects.toMatchObject({code: 'MANIFEST_RESOURCE_NOT_ALLOWED'})
  })

  it('preserves AbortError without converting it into a mount failure', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))

    await expect(loadManifest('tianquan-shoubing', 'local', new AbortController().signal)).rejects.toBe(abort)
  })
})


describe('fixed child mount URLs', () => {
  it.each(['/apps/tianquan-shoubing/', '/apps/yuheng/', '/apps/tianquan-shoubing/?access_token=forged', '/apps/tianquan-shoubing/#section',
    '/apps/tianquan-shoubing/assets/index.js'])('rejects an unapproved child entry %s', async (url) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(manifest({url}))))
    await expect(loadManifest('tianquan-shoubing', 'local', new AbortController().signal))
      .rejects.toMatchObject({code: 'MANIFEST_URL_NOT_ALLOWED'})
  })
})
