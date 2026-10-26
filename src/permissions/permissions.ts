import {definePermissionReferences} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'

// Static host navigation carries no role grant; child applications enforce their own policies.
export const permissions = definePermissionReferences([] as const)
