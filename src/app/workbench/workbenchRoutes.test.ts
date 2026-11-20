import { describe, expect, it } from 'vitest'
import type { AppPageDescriptor } from '@stellar-enclosure/stellar-enclosure-web-shared'
import {
  encodeTabKey,
  matchAppDescriptor,
  resolveWorkbenchUrl,
  sanitizeReturnTo,
} from './workbenchRoutes'

const tianshuCatalog: readonly AppPageDescriptor[] = [
  {
    pageId: 'tianshu.page.publishTasks',
    pattern: '/publish-tasks',
    label: '发布任务',
    groupKey: 'runtime',
    groupLabel: '运行与发布',
    identityParams: [],
    queryKeys: ['changeId'],
  },
  {
    pageId: 'tianshu.page.siNew',
    pattern: '/si/resources/new',
    label: '新建 SI 资源',
    groupKey: 'si',
    groupLabel: 'SI 管理',
    identityParams: [],
    queryKeys: [],
  },
  {
    pageId: 'tianshu.page.siEditor',
    pattern: '/si/resources/:id',
    label: '编辑 SI 资源',
    identityParams: ['id'],
    queryKeys: ['tab'],
  },
]

describe('workbenchRoutes resolution and normalization', () => {
  it('resolves fixed entries, app workbenches, and static-over-dynamic descriptors', () => {
    expect(resolveWorkbenchUrl('/')).toMatchObject({ kind: 'home', canonicalUrl: '/' })
    expect(resolveWorkbenchUrl('/agent')).toMatchObject({ kind: 'agent', canonicalUrl: '/agent' })
    expect(resolveWorkbenchUrl('/xingyuan/tianshu/workbench')).toMatchObject({
      kind: 'app-workbench',
      platformKey: 'tianshu',
      canonicalUrl: '/xingyuan/tianshu/workbench',
    })

    // Static /si/resources/new must beat dynamic /si/resources/:id regardless of descriptor order
    const reversed = [tianshuCatalog[2], tianshuCatalog[1], tianshuCatalog[0]]
    const staticMatch = matchAppDescriptor('/si/resources/new', reversed)
    expect(staticMatch?.descriptor.pageId).toBe('tianshu.page.siNew')

    const dynamicMatch = matchAppDescriptor('/si/resources/0091234567890123456789', reversed)
    expect(dynamicMatch?.descriptor.pageId).toBe('tianshu.page.siEditor')
    expect(dynamicMatch?.identityValues).toEqual(['0091234567890123456789'])
  })

  it('filters undeclared query keys while preserving whitelisted multi-value order and keeping query out of tabKey', () => {
    const resolvedA = resolveWorkbenchUrl('/xingyuan/tianshu/publish-tasks?changeId=chg-1&extra=drop', {
      tianshu: tianshuCatalog,
    })
    const resolvedB = resolveWorkbenchUrl('/xingyuan/tianshu/publish-tasks?changeId=chg-2', {
      tianshu: tianshuCatalog,
    })

    expect(resolvedA).toMatchObject({
      kind: 'app-page',
      platformKey: 'tianshu',
      pageId: 'tianshu.page.publishTasks',
      target: { path: '/publish-tasks', search: '?changeId=chg-1' },
      canonicalUrl: '/xingyuan/tianshu/publish-tasks?changeId=chg-1',
    })
    expect(resolvedB).toMatchObject({
      kind: 'app-page',
      target: { path: '/publish-tasks', search: '?changeId=chg-2' },
    })
    if (resolvedA.kind === 'app-page' && resolvedB.kind === 'app-page') {
      expect(resolvedA.tabKey).toBe(resolvedB.tabKey)
    }

    const entityA = encodeTabKey('tianshu', 'tianshu.page.siEditor', ['10'])
    const entityB = encodeTabKey('tianshu', 'tianshu.page.siEditor', ['20'])
    expect(entityA).not.toBe(entityB)
  })

  it('rejects external URLs, double encoding, path traversal, and OAuth/token parameters', () => {
    for (const bad of [
      'https://evil.example/xingyuan/tianshu/registry',
      '//evil.example/xingyuan/tianshu/registry',
      '/xingyuan/tianshu/%252e%252e/yuheng/dashboard',
      '/xingyuan/tianshu/../yuheng/dashboard',
      '/xingyuan/tianshu/registry?code=oauth-code&state=abc',
      '/xingyuan/tianshu/registry?access_token=secret',
    ]) {
      const result = resolveWorkbenchUrl(bad)
      expect(result.kind).toBe('not-found')
    }

    expect(sanitizeReturnTo('https://evil.example/x')).toBe('/')
    expect(sanitizeReturnTo('/auth/oidc/callback/portal-101?code=123')).toBe('/')
    expect(sanitizeReturnTo('/xingyuan/tianshu/publish-tasks?changeId=chg-1')).toBe(
      '/xingyuan/tianshu/publish-tasks?changeId=chg-1',
    )
  })
})
