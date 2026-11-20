import type { AppPageDescriptor, RouteTarget } from '@stellar-enclosure/stellar-enclosure-web-shared'
import type { PlatformKey } from '../../manifest/types'
import { defaultAppTitle, resolveWorkbenchUrl, type ResolvedWorkbenchLocation } from './workbenchRoutes'

export interface WorkbenchTab {
  readonly tabKey: string
  readonly appId: PlatformKey
  readonly pageId: string
  readonly isWorkbench: boolean
  readonly target: RouteTarget
  readonly canonicalUrl: string
  readonly title: string
  readonly status: 'opening' | 'active' | 'suspended' | 'failed' | 'denied'
}

export interface WorkbenchNavigationState {
  readonly navigationId: number
  readonly tabs: readonly WorkbenchTab[]
  readonly activeFixedEntry?: 'home' | 'agent'
  readonly activeTabKey?: string
  readonly lastError?: {
    readonly code: string
    readonly canonicalUrl: string
  }
  readonly historyEffect?: {
    readonly mode: 'push' | 'replace' | 'none'
    readonly url: string
    readonly navigationId: number
  }
}

export type WorkbenchNavigationAction =
  | { readonly type: 'OPEN'; readonly location: ResolvedWorkbenchLocation; readonly mode?: 'push' | 'replace' }
  | { readonly type: 'POP_LOCATION'; readonly location: ResolvedWorkbenchLocation }
  | { readonly type: 'CLOSE_TAB'; readonly tabKey: string }
  | { readonly type: 'COMMIT_PRESENTATION'; readonly navigationId: number; readonly tabKey: string; readonly title?: string }
  | { readonly type: 'REJECT_NAVIGATION'; readonly navigationId: number; readonly code: string; readonly tabKey?: string }
  | { readonly type: 'SYNC_CATALOG'; readonly appId: PlatformKey; readonly catalog: readonly AppPageDescriptor[] }
  | { readonly type: 'RESET_FOR_AUTH_CHANGE' }

export function initialWorkbenchNavigationState(): WorkbenchNavigationState {
  return { navigationId: 0, tabs: [], activeFixedEntry: 'home' }
}

const suspendNonActiveTabs = (tabs: readonly WorkbenchTab[], nextActiveKey?: string): readonly WorkbenchTab[] =>
  tabs.map((tab) => {
    if (tab.tabKey === nextActiveKey) return tab
    if (tab.status === 'active') return { ...tab, status: 'suspended' }
    return tab
  })

const titleForLocation = (location: Extract<ResolvedWorkbenchLocation, { kind: 'app-workbench' | 'app-page' }>): string => {
  if (location.kind === 'app-workbench') {
    return `${defaultAppTitle(location.platformKey)} · 工作台`
  }
  return location.descriptor?.label ?? defaultAppTitle(location.platformKey)
}

const applyLocationOpen = (
  state: WorkbenchNavigationState,
  location: ResolvedWorkbenchLocation,
  historyMode: 'push' | 'replace' | 'none',
): WorkbenchNavigationState => {
  const nextNavigationId = state.navigationId + 1

  if (location.kind === 'home' || location.kind === 'agent') {
    return {
      ...state,
      navigationId: nextNavigationId,
      tabs: suspendNonActiveTabs(state.tabs, undefined),
      activeFixedEntry: location.kind,
      activeTabKey: undefined,
      lastError: undefined,
      historyEffect: { mode: historyMode, url: location.canonicalUrl, navigationId: nextNavigationId },
    }
  }

  if (location.kind === 'app-workbench' || location.kind === 'app-page') {
    const existingIndex = state.tabs.findIndex((tab) => tab.tabKey === location.tabKey)
    const nextTitle = titleForLocation(location)
    const nextTab: WorkbenchTab = {
      tabKey: location.tabKey,
      appId: location.platformKey,
      pageId: location.kind === 'app-workbench' ? 'workbench' : location.pageId,
      isWorkbench: location.kind === 'app-workbench',
      target: location.target,
      canonicalUrl: location.canonicalUrl,
      title: existingIndex >= 0 ? (location.kind === 'app-page' && location.descriptor ? location.descriptor.label : state.tabs[existingIndex].title) : nextTitle,
      status: location.kind === 'app-workbench' || location.matched ? 'active' : 'opening',
    }
    const baseTabs =
      existingIndex >= 0
        ? state.tabs.map((tab, index) => (index === existingIndex ? nextTab : tab))
        : [...state.tabs, nextTab]
    return {
      ...state,
      navigationId: nextNavigationId,
      tabs: suspendNonActiveTabs(baseTabs, location.tabKey),
      activeFixedEntry: undefined,
      activeTabKey: location.tabKey,
      lastError: undefined,
      historyEffect: { mode: historyMode, url: location.canonicalUrl, navigationId: nextNavigationId },
    }
  }

  if (location.kind === 'not-found') {
    return {
      ...state,
      navigationId: nextNavigationId,
      lastError: { code: location.reason, canonicalUrl: location.canonicalUrl },
      historyEffect: { mode: historyMode, url: location.canonicalUrl, navigationId: nextNavigationId },
    }
  }

  return {
    ...state,
    navigationId: nextNavigationId,
    historyEffect: { mode: historyMode, url: location.canonicalUrl, navigationId: nextNavigationId },
  }
}

export function workbenchNavigationReducer(
  state: WorkbenchNavigationState,
  action: WorkbenchNavigationAction,
): WorkbenchNavigationState {
  switch (action.type) {
    case 'OPEN':
      return applyLocationOpen(state, action.location, action.mode ?? 'push')

    case 'POP_LOCATION':
      return applyLocationOpen(state, action.location, 'none')

    case 'CLOSE_TAB': {
      const targetIndex = state.tabs.findIndex((tab) => tab.tabKey === action.tabKey)
      if (targetIndex < 0) {
        return state
      }
      const nextTabs = state.tabs.filter((tab) => tab.tabKey !== action.tabKey)
      if (state.activeTabKey !== action.tabKey) {
        return {
          ...state,
          tabs: nextTabs,
          historyEffect: { mode: 'none', url: '', navigationId: state.navigationId },
        }
      }

      const nextNavigationId = state.navigationId + 1
      const neighbor = nextTabs[targetIndex] ?? nextTabs[targetIndex - 1]
      if (!neighbor) {
        return {
          ...state,
          navigationId: nextNavigationId,
          tabs: [],
          activeFixedEntry: 'home',
          activeTabKey: undefined,
          historyEffect: { mode: 'replace', url: '/', navigationId: nextNavigationId },
        }
      }
      const updatedTabs = nextTabs.map((tab) =>
        tab.tabKey === neighbor.tabKey ? { ...tab, status: 'active' as const } : tab,
      )
      return {
        ...state,
        navigationId: nextNavigationId,
        tabs: updatedTabs,
        activeFixedEntry: undefined,
        activeTabKey: neighbor.tabKey,
        historyEffect: { mode: 'replace', url: neighbor.canonicalUrl, navigationId: nextNavigationId },
      }
    }

    case 'COMMIT_PRESENTATION': {
      if (action.navigationId < state.navigationId) {
        return state
      }
      const targetIndex = state.tabs.findIndex((tab) => tab.tabKey === action.tabKey)
      if (targetIndex < 0) {
        return state
      }
      const updatedTabs = state.tabs.map((tab) => {
        if (tab.tabKey === action.tabKey) {
          return {
            ...tab,
            status: 'active' as const,
            title: action.title ?? tab.title,
          }
        }
        return tab.status === 'active' ? { ...tab, status: 'suspended' as const } : tab
      })
      return {
        ...state,
        tabs: updatedTabs,
        activeFixedEntry: undefined,
        activeTabKey: action.tabKey,
        lastError: undefined,
      }
    }

    case 'REJECT_NAVIGATION': {
      if (action.navigationId < state.navigationId) {
        return state
      }
      const nextStatus: WorkbenchTab['status'] = action.code === 'DENIED' ? 'denied' : 'failed'
      const updatedTabs = action.tabKey
        ? state.tabs.map((tab) => (tab.tabKey === action.tabKey ? { ...tab, status: nextStatus } : tab))
        : state.tabs
      return {
        ...state,
        tabs: updatedTabs,
        lastError: {
          code: action.code,
          canonicalUrl: state.tabs.find((t) => t.tabKey === action.tabKey)?.canonicalUrl ?? '/',
        },
      }
    }

    case 'SYNC_CATALOG': {
      const updatedTabs: WorkbenchTab[] = []
      let nextActiveTabKey = state.activeTabKey
      for (const tab of state.tabs) {
        if (tab.appId !== action.appId || tab.isWorkbench) {
          updatedTabs.push(tab)
          continue
        }
        const resolved = resolveWorkbenchUrl(tab.canonicalUrl, { [action.appId]: action.catalog })
        if (resolved.kind === 'app-page') {
          if (state.activeTabKey === tab.tabKey) {
            nextActiveTabKey = resolved.tabKey
          }
          updatedTabs.push({
            ...tab,
            tabKey: resolved.tabKey,
            pageId: resolved.pageId,
            target: resolved.target,
            canonicalUrl: resolved.canonicalUrl,
            title: resolved.descriptor?.label ?? tab.title,
            status: tab.status === 'opening' ? 'active' : tab.status,
          })
        } else {
          updatedTabs.push({ ...tab, status: 'denied' })
        }
      }
      return {
        ...state,
        tabs: updatedTabs,
        activeTabKey: nextActiveTabKey,
      }
    }

    case 'RESET_FOR_AUTH_CHANGE':
      return {
        navigationId: state.navigationId + 1,
        tabs: [],
        activeFixedEntry: 'home',
        activeTabKey: undefined,
        lastError: undefined,
      }
  }
}
