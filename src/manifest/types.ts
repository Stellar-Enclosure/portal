export const PLATFORM_KEY_LIST = [
  'tianquan-shoubing',
  'tianquan-jianshen',
  'yuheng',
  'tianshu',
  'yaoguang',
  'tianji',
] as const

export type PlatformKey = (typeof PLATFORM_KEY_LIST)[number]

export const isPlatformKey = (value: unknown): value is PlatformKey =>
  typeof value === 'string' && (PLATFORM_KEY_LIST as readonly string[]).includes(value)

export type ChildContractVersion = 'xingyuan-1' | 'workbench-1'

export const isChildContractVersion = (value: unknown): value is ChildContractVersion =>
  value === 'xingyuan-1' || value === 'workbench-1'

export interface ChildManifest {
  key: PlatformKey
  displayName: string
  resource: string
  url: string
  standaloneUrl: string
  version: string
  contractVersion: ChildContractVersion
  compatibleHostRange: string
  requiredCapabilities: readonly string[]
  summaryUrl?: string
}

export type PlatformManifest = ChildManifest

export type ManifestErrorCode =
  | 'MANIFEST_FETCH_FAILED'
  | 'MANIFEST_INVALID'
  | 'MANIFEST_URL_NOT_ALLOWED'
  | 'MANIFEST_RESOURCE_NOT_ALLOWED'
  | 'MANIFEST_VERSION_UNSUPPORTED'
