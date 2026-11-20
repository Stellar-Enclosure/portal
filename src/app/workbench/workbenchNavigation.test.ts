import { describe, expect, it } from 'vitest'
import type { AppPageDescriptor } from '@stellar-enclosure/stellar-enclosure-web-shared'
import {
  initialWorkbenchNavigationState,
  workbenchNavigationReducer,
} from './workbenchNavigation'
import { resolveWorkbenchUrl } from './workbenchRoutes'

const tianshuCatalog: readonly AppPageDescriptor[] = [
  {
    pageId: 'tianshu.page.publishTasks',
    pattern: '/publish-tasks',
    label: '发布任务',
    identityParams: [],
    queryKeys: ['changeId'],
  },
  {
    pageId: 'tianshu.page.configs',
    pattern: '/configs',
    label: '配置管理',
    identityParams: [],
    queryKeys: [],
  },
  {
    pageId: 'tianshu.page.aiEditor',
    pattern: '/ai/resources/:id',
    label: 'AI 资源编辑',
    identityParams: ['id'],
    queryKeys: [],
  },
]

const catalog = { tianshu: tianshuCatalog }

describe('workbenchNavigationReducer', () => {
  it('deduplicates list pages by PageKey, updates query in place, and creates distinct tabs for distinct dynamic entities', () => {
    let state = initialWorkbenchNavigationState()

    state = workbenchNavigationReducer(state, {
      type: 'OPEN',
      location: resolveWorkbenchUrl('/xingyuan/tianshu/publish-tasks?changeId=chg-1', catalog),
    })
    expect(state.tabs).toHaveLength(1)
    const listTabKey = state.tabs[0].tabKey

    // Same list page with different query reuses the same tab
    state = workbenchNavigationReducer(state, {
      type: 'OPEN',
      location: resolveWorkbenchUrl('/xingyuan/tianshu/publish-tasks?changeId=chg-2', catalog),
    })
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0].tabKey).toBe(listTabKey)
    expect(state.tabs[0].canonicalUrl).toBe('/xingyuan/tianshu/publish-tasks?changeId=chg-2')

    // Two distinct dynamic entities open two separate tabs
    state = workbenchNavigationReducer(state, {
      type: 'OPEN',
      location: resolveWorkbenchUrl('/xingyuan/tianshu/ai/resources/101', catalog),
    })
    state = workbenchNavigationReducer(state, {
      type: 'OPEN',
      location: resolveWorkbenchUrl('/xingyuan/tianshu/ai/resources/202', catalog),
    })
    expect(state.tabs).toHaveLength(3)
    expect(state.activeTabKey).toBe(state.tabs[2].tabKey)
  })

  it('closes active tab preferring right neighbor, then left neighbor, then home with replace history', () => {
    let state = initialWorkbenchNavigationState()
    state = workbenchNavigationReducer(state, {
      type: 'OPEN',
      location: resolveWorkbenchUrl('/xingyuan/tianshu/publish-tasks', catalog),
    })
    state = workbenchNavigationReducer(state, {
      type: 'OPEN',
      location: resolveWorkbenchUrl('/xingyuan/tianshu/configs', catalog),
    })
    state = workbenchNavigationReducer(state, {
      type: 'OPEN',
      location: resolveWorkbenchUrl('/xingyuan/tianshu/ai/resources/101', catalog),
    })

    const [tabA, tabB, tabC] = state.tabs

    // Activate middle tab B and close it -> selects right neighbor C
    state = workbenchNavigationReducer(state, { type: 'OPEN', location: resolveWorkbenchUrl(tabB.canonicalUrl, catalog) })
    state = workbenchNavigationReducer(state, { type: 'CLOSE_TAB', tabKey: tabB.tabKey })
    expect(state.activeTabKey).toBe(tabC.tabKey)
    expect(state.historyEffect).toMatchObject({ mode: 'replace', url: tabC.canonicalUrl })

    // Close rightmost active tab C -> selects left neighbor A
    state = workbenchNavigationReducer(state, { type: 'CLOSE_TAB', tabKey: tabC.tabKey })
    expect(state.activeTabKey).toBe(tabA.tabKey)
    expect(state.historyEffect).toMatchObject({ mode: 'replace', url: tabA.canonicalUrl })

    // Close last tab A -> falls back to home '/'
    state = workbenchNavigationReducer(state, { type: 'CLOSE_TAB', tabKey: tabA.tabKey })
    expect(state.tabs).toHaveLength(0)
    expect(state.activeFixedEntry).toBe('home')
    expect(state.activeTabKey).toBeUndefined()
    expect(state.historyEffect).toMatchObject({ mode: 'replace', url: '/' })
  })

  it('keeps fixed entries out of closable tabs, handles browser POP without extra history push, and ignores stale navigation acks', () => {
    let state = initialWorkbenchNavigationState()
    state = workbenchNavigationReducer(state, {
      type: 'OPEN',
      location: resolveWorkbenchUrl('/xingyuan/tianshu/publish-tasks', catalog),
    })
    const nav1 = state.navigationId
    const tabKey = state.tabs[0].tabKey

    // Switching to fixed /agent preserves existing tabs and does not add a closable tab
    state = workbenchNavigationReducer(state, {
      type: 'OPEN',
      location: resolveWorkbenchUrl('/agent'),
    })
    expect(state.activeFixedEntry).toBe('agent')
    expect(state.tabs).toHaveLength(1)

    // Stale ack from nav1 must be ignored now that navigationId advanced
    const beforeStale = state
    state = workbenchNavigationReducer(state, {
      type: 'COMMIT_PRESENTATION',
      navigationId: nav1,
      tabKey,
    })
    expect(state.activeFixedEntry).toBe(beforeStale.activeFixedEntry)
    expect(state.activeTabKey).toBe(beforeStale.activeTabKey)

    // Closing the tab, then browser POP to its URL re-opens it without pushing extra history
    state = workbenchNavigationReducer(state, { type: 'CLOSE_TAB', tabKey })
    expect(state.tabs).toHaveLength(0)

    state = workbenchNavigationReducer(state, {
      type: 'POP_LOCATION',
      location: resolveWorkbenchUrl('/xingyuan/tianshu/publish-tasks', catalog),
    })
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTabKey).toBe(tabKey)
    expect(state.historyEffect?.mode).toBe('none')
  })
})
