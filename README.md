# portal

Unified browser entry point for the six Stellar Enclosure platform consoles. Uses the shared Web SDK **0.1.1** (`@stellar-enclosure/stellar-enclosure-web-shared@0.1.1` and `@stellar-enclosure/stellar-enclosure-tianquan-jianshen-react-sdk@0.1.1`) and keeps the Portal host manifest contract at **0.0.2** (`compatibleHostRange: ">=0.0.1 <0.1.0"`), accepting both **`workbench-1`** single-instance scoped workbench children and **`xingyuan-1`** legacy URL-mounted children during gradual migration.

## Current capabilities

- Render the unified enterprise workbench shell (`PortalLayout`) with a 52px top bar (`AppLauncherDrawer`, tenant selector, theme toggle, user menu), a 44px tab strip with fixed **`Agent 助手`** (`/agent`) and **`门户首页`** (`/`) buttons plus closable business workspace tabs, and a persistent child host stage (`WorkbenchStage`).
- Keep at most one active Wujie child instance per `appKey` (`tianquan-shoubing`, `tianquan-jianshen`, `yuheng`, `tianshu`, `yaoguang`, `tianji`) mounted at stable `entryUrl` for `workbench-1` apps while driving tab presentation (`activate` / `suspend` / `close`), child route handoffs (`requestNavigation`), and authorized page catalog updates (`publishCatalog`) over a capability-scoped `WorkbenchHost` bridge.
- Retain seamless fallback mounting for `xingyuan-1` child apps by computing sub-path entry URLs and hiding the child chrome only when `workbench-1` is active.
- Connect the fixed `/agent` view to Yaoguang's embedded `/assistant/knowledge` workspace while keeping `/agent` out of the closable tab strip and routing citation/governance deep links (`/xingyuan/tianshu/governance/configs`, `/xingyuan/yuheng/governance/apis`, `/xingyuan/tianquan-jianshen/iam/roles`, `/xingyuan/yaoguang/knowledge/:kbId/wiki/:pageId`, `/xingyuan/yaoguang/knowledge/:kbId`) directly into business tabs.
- Validate deployment-owned manifests, child entry URLs, contract versions (`workbench-1` | `xingyuan-1`), and host compatibility before mounting; pass the permitted host context and manage child teardown on logout, tenant switch, or identity change.
- Sign in through a tenant PUBLIC OAuth registration with S256 PKCE. Each console manages its own resource authorization and the backend enforces business permissions.
- Include a platform-summary facade/component with timeout, partial-failure and retry states. Summary adapters are optional and report `NOT_CONFIGURED` when absent.

The implementation entry points are [routing](src/app/router.tsx), [workbench shell](src/app/PortalLayout.tsx), [Agent view](src/pages/AgentPage.tsx), [platform overview](src/pages/PortalHomePage.tsx), [manifest validation](src/manifest/loader.ts), [navigation and tab model](src/navigation/WorkbenchTabsContext.tsx), [persistent child lifecycle](src/lifecycle/ChildLifecycleManager.ts), [scoped workbench bridge](src/lifecycle/WorkbenchBridge.ts), [host/child context](src/bridge/context.ts) and the [summary facade](src/summary/platformSummaryFacade.ts). The portal does not implement platform business APIs or deploy child applications itself.

## Build and test

Use Node 24 and npm 11 with the matching shared SDK tarball in the cache or registry. For the digest-bound build, set the permission toolchain inputs described below.

```bash
npm ci
npm run build
npm test -- --run
```

For the initial release before npm publication, clone `web-sdk` next to this repository:

```bash
node ../web-sdk/scripts/verify-consumers.mjs \
  --workspace "$(cd .. && pwd)" \
  --cache "$HOME/.npm" \
  --output "$(cd ../web-sdk && pwd)/dist/npm-release" \
  --consumer portal --phase verify
```

The verifier uses actual pack checksums and official registry addresses in the committed lock, then validates offline installation. It never publishes packages.

## Child applications

| Console | Domain | Portal default entry | Contract | Owned functionality & route scope |
|---|---|---|---|---|
| [Shoubing](https://github.com/Stellar-Enclosure/tianquan-shoubing-web) | 身份与权限 | `/xingyuan/tianquan-shoubing/overview` | `workbench-1` / `xingyuan-1` | Identity overview, tenants, users, OAuth clients, resource grants, signing keys and security audit (8 routes). |
| [Jianshen](https://github.com/Stellar-Enclosure/tianquan-jianshen-web) | 身份与权限 | `/xingyuan/tianquan-jianshen/iam/roles` | `workbench-1` / `xingyuan-1` | IAM directory (users, groups, departments, positions), role/permission governance, resource tree and authorization audit (14 routes). |
| [Yuheng](https://github.com/Stellar-Enclosure/yuheng-web) | API 与集成 | `/xingyuan/yuheng/dashboard` | `workbench-1` / `xingyuan-1` | Gateway dashboard, routes, upstreams, policies, API catalog, releases, MCP registry, LLM gateway, subscriptions and audit (22 routes). |
| [Tianshu](https://github.com/Stellar-Enclosure/tianshu-web) | 配置与元数据 | `/xingyuan/tianshu/registry` | `workbench-1` / `xingyuan-1` | Service registry, configuration items & drafts, business/env/app/namespace/binding scope metadata, publish tasks, cache, instances, i18n, Prompt/Skill and SI resources (20 routes). |
| [Yaoguang](https://github.com/Stellar-Enclosure/yaoguang-web) | 知识与智能 | `/xingyuan/yaoguang/knowledge` | `workbench-1` / `xingyuan-1` | Knowledge bases, documents, retrieval Q&A, Wiki and embedded `/assistant/knowledge` Agent collaboration view (4 routes). |
| [Tianji](https://github.com/Stellar-Enclosure/tianji-web) | 流程与运行时 | `/xingyuan/tianji/definitions` | `workbench-1` / `xingyuan-1` | BPMN/DMN/CMMN process definitions & draft editors, releases, instances, human tasks (`/tasks` -> `/human-tasks` handoff), cases, execution timelines, worker failures and Agent runs (15 routes). |

Deploy each console as static assets on its approved entry URL. Configure the Portal build with `VITE_PORTAL_CHILD_BINDINGS`, a JSON object keyed by the six platform keys above. Each value supplies its exact `resource`, `url` for embedding, and `standaloneUrl`. The embedded URL ends with `/` or `/index.html`. Serve the same registration in `${BASE_URL}portal-manifest/<environment>.json`, adding the version range and metadata shown in the [local manifest example](public/portal-manifest/local.json). The example Resource URIs illustrate the shape. Deployment supplies the real approved HTTPS URLs and Resource URIs. `VITE_PORTAL_ENV` selects the manifest environment and defaults to `local`.

Set `VITE_PORTAL_OAUTH_CONFIG` to an object with `activeResource` and `registrations`. Each registration follows the shared `PublicOAuthRegistration` contract and names the host's tenant, issuer, PUBLIC client, Resource, API base, scopes and the fixed issuer endpoints. Register the exact callback `${Portal HTTPS origin}${VITE_BASE_PATH}auth/oidc/callback/${registration.id}`. Configure the Portal static server to serve its SPA for that path and the shell routes (`/`, `/agent`, `/xingyuan/:appKey/workbench`, `/xingyuan/:appKey/*`, `/standalone/:platformKey`). The Portal reads the identity from the signed callback. The Wujie bridge carries the selected tenant, issuer and child Resource as public context. Every console uses its own registration and starts its own user-authorized flow.

Use an explicit loopback child binding for local development over HTTP. Production child entries and their independent URLs use HTTPS. Provide the IdP and resource CORS and approved routes through the platform deployment.

## Workbench rollout, compatibility matrix, and per-APP rollback

### 4-combination compatibility matrix

| Host / Child combination | Runtime contract | Expected behavior |
|---|---|---|
| **Legacy Host (`0.0.1`) + Legacy Child (`xingyuan-1`)** | `xingyuan-1` | Baseline multi-entry URL mounting with child-owned chrome. |
| **New Host (`0.0.2`) + Legacy Child (`xingyuan-1`)** | `xingyuan-1` | Portal shell renders top bar, tab strip, and `/agent`; legacy child mounts via sub-path URL (`resolveChildTargetUrl`) and retains its internal navigation until upgraded. |
| **New Host (`0.0.2`) + New Child (`workbench-1`)** | `workbench-1` | Full single-instance workbench mode: child hides duplicate outer Sider/Header (`EmbeddedWorkbench`), publishes authorized `AppPageDescriptor[]` catalog, and switches tabs in-place via `onPresent` / `requestNavigation` without reloading the iframe/shadow root. |
| **Legacy Host (`0.0.1`) + New Child (`workbench-1`)** | Standalone / `xingyuan-1` fallback | When `window.$wujie?.props?.workbenchHost` is absent, the child automatically falls back to `createBrowserRouter` with its full standalone `AdminLayout` and PUBLIC OAuth PKCE flow. |

### Recommended staged rollout order

1. **`web-sdk@0.1.1`**: Pack and verify `@stellar-enclosure/stellar-enclosure-web-shared@0.1.1` and `@stellar-enclosure/stellar-enclosure-tianquan-jianshen-react-sdk@0.1.1` across all seven consumer lockfiles (`verify-consumers.mjs --phase verify`).
2. **`portal@0.0.2`**: Deploy the Portal workbench host while keeping `portal-manifest/<env>.json` entries at `xingyuan-1` for applications not yet switched, or `workbench-1` for applications cut over with the host.
3. **Child consoles (`tianshu-web` -> `yuheng-web` -> `tianquan-shoubing-web` -> `tianquan-jianshen-web` -> `yaoguang-web` -> `tianji-web`)**: Deploy each child's static bundle alongside its matching `dist/permission-build.json` and update its `contractVersion` in `portal-manifest/<env>.json` to `"workbench-1"`.

### Per-APP rollback procedure

- **Single child rollback (no host downtime)**: If an individual child console encounters a regression after switching to `workbench-1`, revert that child's entry in `portal-manifest/<env>.json` to `"contractVersion": "xingyuan-1"` (or redeploy its previous static bundle together with its matching permission artifact). Portal `0.0.2` immediately falls back to `xingyuan-1` URL mounting for that `appKey` while all other `workbench-1` consoles continue running in single-instance workbench mode.
- **Full host rollback**: Redeploy the previous Portal static bundle and manifest together with its matching permission artifact. Because all `0.1.1` child consoles automatically fall back to `createBrowserRouter` and full `AdminLayout` when `workbenchHost` is absent, upgraded child consoles remain functional under both standalone access and legacy host mounting.
- **Security boundary during rollback**: Never re-enable retired static Edge tokens, shared OAuth client secrets, or cross-app token forwarding during rollback; every child console and Portal host continues to authenticate exclusively via its own tenant PUBLIC OAuth S256 PKCE registration.

## Application delivery (no package publication)

This repository is a frontend application, not a library. Its `package.json` remains `private: true`; do not publish it to npm or Maven Central. Publish only the reusable packages owned by [web-sdk](https://github.com/Stellar-Enclosure/web-sdk#publish-to-npmjs).

```bash
npm ci
npm test
npm run build
```

Deploy the resulting `dist/` directory as static application assets. Before the first SDK publication, use the Build section's local consumer verification instead of `npm ci` against the public registry. These commands do not start a server.

## Compatibility and publication

Validate the login, callback and child CORS with the deployed Portal and registered PUBLIC clients before production cutover. The offline checks cover TypeScript, unit tests, static build and permission artifacts.

Git pushes run validation only. Central and npm publication are separate user actions. CI defaults to initial source bootstrap; after publication set `STELLAR_USE_SOURCE_BOOTSTRAP=false` to consume published artifacts directly. Private organizations may supply the Actions secret `STELLAR_ENCLOSURE_READ_TOKEN` with repository read access.

Original MIT/LGPL licenses and author attribution are preserved.

## Permission manifest builds and controlled delivery

`npm run build` uses the explicit SDK tool checkout to prepare the digest-pinned RBAC contract, scan and validate all declared modules, typecheck, and build Vite assets. It writes a FULL manifest and artifact record under `.generated/permissions/`, and embeds matching build identifiers in `dist/permission-build.json`. A failed build removes its current success evidence. The frontend owns its APP/MENU/PAGE/COMPONENT/BUTTON declarations; API and FIELD entries reference backend definitions. Form writes require the current identity snapshot, matching field catalog, backend `inputBinding`, and the field's write expression.

For local source verification, provide absolute reviewed paths. The current `permission-toolchain.local.lock.json` has mode `LOCAL_UNCOMMITTED`; it permits offline validation and rejects online registration and distribution. `PAC_CONTRACT_ARTIFACT` must name the exact JAR whose SHA-256 is recorded by that lock. These variables contain paths and build metadata only.

```sh
export PAC_SDK_DIR=/absolute/path/to/web-sdk
export PAC_TOOLCHAIN_LOCK="$PWD/permission-toolchain.local.lock.json"
export PAC_CONTRACT_ARTIFACT=/absolute/path/to/reviewed-permission-contract.jar
npm ci --offline --ignore-scripts
npm run typecheck
npm test -- --run --testTimeout=15000
npm run build
python3 scripts/permission-ci.test.py
node "$PAC_SDK_DIR/scripts/permissions/ci.mjs" --phase validate \
  --lock "$PAC_TOOLCHAIN_LOCK" --manifest .generated/permissions/manifest-v1.json \
  --evidence .generated/permissions/artifact-record.json --artifact dist \
  --output-dir .generated/permission-ci
```

Install the same reviewed SDK tarballs into the npm cache before `npm ci --offline`; use `web-sdk/scripts/verify-consumers.mjs --phase prepare` and then `--phase verify` for the six-consumer lock/integrity check. An npm cache or an offline source build is not npm registry publication.

CI requires a real `permission-toolchain.lock.json` in `PINNED_COMMIT` mode, a clean SDK checkout at its exact commit, and a digest-matching RC artifact. No immutable toolchain pin or target account is fabricated in this working tree. Configure the non-secret `permission-targets.json` with the exact scope, producer, issuer, client and allowed service scopes before enabling delivery. Namespace/environment build settings must match the deployed authorization snapshot.

The normal GitHub/GitLab pipelines perform offline checks and package artifact evidence. Pull requests receive no registration credential. The separate protected delivery phase explicitly chooses `register` or `activate`; registration uses one stable operation ID, and pending/unknown outcomes remain exit code 6 and must be queried with that same ID. Registration does not grant roles or activate a version. Activation consumes the exact successful build plus fresh trusted deployment/readiness evidence and the complete producer selection with existing qualification IDs. The server independently rechecks scope, ownership, revisions and qualification. Keep credentials in protected owner-only files; do not place them in command arguments, manifests, reports or source.

Local unit/build evidence does not prove PostgreSQL migrations, browser/SSO behavior, deployed artifact readiness, real CI runs, or remote registration/activation. Those require the separately prepared environment. None of these commands starts an application, database, container or browser.

GitLab activation additionally requires protected `PERMISSION_DEPLOYMENT_JOB_NAME` (the exact name of a separate successful deployment job) and `PERMISSION_GITLAB_READ_TOKEN_FILE` (an absolute owner-only file containing a `read_api` token). Deployment evidence includes `gitlab: {projectId, pipelineId, jobId}` using decimal strings from the current project. The adapter reads that job and successful pipeline from the configured GitLab API, checks the current protected ref/commit and fresh readiness, and compares the original `permission-deployment.json` job artifact with the local proof. The API must share the `CI_SERVER_URL` HTTPS origin; artifact CDN redirects never receive the API token. These external variables and deployment jobs still require environment configuration and verification.
