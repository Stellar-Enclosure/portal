import type { AppCatalogStatus } from '@stellar-enclosure/stellar-enclosure-web-shared'
import type { PlatformKey } from '../manifest/types'

export type LifecycleStatus =
  | 'IDLE'
  | 'LOADING'
  | 'MOUNTED'
  | 'AUTHORIZING'
  | 'READY'
  | 'SUSPENDED'
  | 'MOUNT_FAILED'
  | 'UNMOUNTING'
  | 'CRASHED'

export interface LifecycleState {
  readonly platformKey: PlatformKey
  readonly status: LifecycleStatus
  readonly retryCount: number
  readonly errorCode?: string
  readonly errorMessage?: string
  readonly cleanupToken?: string
  readonly portAttached?: boolean
  readonly catalogStatus?: AppCatalogStatus
  readonly catalogRevision?: number
}

export type LifecycleEvent =
  | { readonly type: 'LOAD' }
  | { readonly type: 'MOUNTED'; readonly cleanupToken: string }
  | { readonly type: 'ATTACHED' }
  | { readonly type: 'CATALOG_UPDATE'; readonly status: AppCatalogStatus; readonly revision: number }
  | { readonly type: 'SUSPEND' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'MOUNT_FAILED'; readonly code: string; readonly message: string }
  | { readonly type: 'CHILD_CRASHED'; readonly message: string }
  | { readonly type: 'UNMOUNT' }
  | { readonly type: 'CLEANED' }
  | { readonly type: 'RETRY' }

export const initialLifecycleState = (platformKey: PlatformKey): LifecycleState => ({
  platformKey,
  status: 'IDLE',
  retryCount: 0,
})

const clearFailure = (state: LifecycleState): LifecycleState => ({
  ...state,
  errorCode: undefined,
  errorMessage: undefined,
  cleanupToken: undefined,
})

export const reduceLifecycle = (
  state: LifecycleState,
  event: LifecycleEvent,
): LifecycleState => {
  switch (event.type) {
    case 'LOAD':
      if (state.status === 'UNMOUNTING' || state.status === 'LOADING' || state.status === 'MOUNTED' || state.status === 'AUTHORIZING' || state.status === 'READY' || state.status === 'SUSPENDED') {
        return state
      }
      return { ...clearFailure(state), status: 'LOADING', portAttached: false, catalogStatus: undefined, catalogRevision: undefined }
    case 'MOUNTED':
      if (state.status === 'UNMOUNTING') {
        return state
      }
      return {
        ...clearFailure(state),
        status: 'MOUNTED',
        cleanupToken: event.cleanupToken,
      }
    case 'ATTACHED':
      if (state.status === 'UNMOUNTING' || state.status === 'MOUNT_FAILED' || state.status === 'CRASHED') {
        return state
      }
      return {
        ...state,
        status: 'AUTHORIZING',
        portAttached: true,
      }
    case 'CATALOG_UPDATE':
      if (state.status === 'UNMOUNTING' || state.status === 'MOUNT_FAILED' || state.status === 'CRASHED') {
        return state
      }
      return {
        ...state,
        status: event.status === 'ready' ? 'READY' : event.status === 'failed' ? 'MOUNT_FAILED' : 'AUTHORIZING',
        catalogStatus: event.status,
        catalogRevision: event.revision,
        ...(event.status === 'failed' ? { errorCode: 'CHILD_CATALOG_FAILED', errorMessage: 'Child catalog failed' } : {}),
      }
    case 'SUSPEND':
      if (state.status === 'READY' || state.status === 'MOUNTED' || state.status === 'AUTHORIZING') {
        return { ...state, status: 'SUSPENDED' }
      }
      return state
    case 'RESUME':
      if (state.status === 'SUSPENDED') {
        return { ...state, status: state.catalogStatus === 'ready' ? 'READY' : 'AUTHORIZING' }
      }
      return state
    case 'MOUNT_FAILED':
      if (state.status === 'UNMOUNTING') {
        return state
      }
      return {
        ...state,
        status: 'MOUNT_FAILED',
        errorCode: event.code,
        errorMessage: event.message,
        cleanupToken: undefined,
        portAttached: false,
      }
    case 'CHILD_CRASHED':
      if (state.status === 'IDLE' || state.status === 'UNMOUNTING') {
        return state
      }
      return {
        ...state,
        status: 'CRASHED',
        errorCode: 'CHILD_RUNTIME_ERROR',
        errorMessage: event.message,
        portAttached: false,
      }
    case 'UNMOUNT':
      if (state.status === 'IDLE' || state.status === 'UNMOUNTING') {
        return state
      }
      return { ...state, status: 'UNMOUNTING', portAttached: false }
    case 'CLEANED':
      if (state.status !== 'UNMOUNTING') {
        return state
      }
      return { ...clearFailure(state), status: 'IDLE', portAttached: false, catalogStatus: undefined, catalogRevision: undefined }
    case 'RETRY':
      if (state.status !== 'MOUNT_FAILED' && state.status !== 'CRASHED' && state.status !== 'IDLE') {
        return state
      }
      return {
        ...clearFailure(state),
        status: 'LOADING',
        retryCount: state.retryCount + 1,
        portAttached: false,
      }
  }
}
