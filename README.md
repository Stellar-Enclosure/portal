# portal

Unified browser entry point for the five Stellar Enclosure platform consoles. Uses the shared Web SDK **0.1.0** and keeps the Portal host manifest contract at **0.0.1**.

## Current capabilities

- Render shared enterprise navigation and mount independent consoles through Wujie under `/xingyuan/:platformKey/*`, with a standalone fallback entry for each application.
- Validate deployment-owned manifests, child entry URLs, contract versions and host compatibility before mounting; pass the permitted host context and manage child teardown during navigation.
- Sign in through a tenant PUBLIC OAuth registration with S256 PKCE. Each console manages its own resource authorization and the backend enforces business permissions.
- Include a platform-summary facade/component with timeout, partial-failure and retry states. Summary adapters are optional and report `NOT_CONFIGURED` when absent; the current root route redirects to the first child entry.

The implementation entry points are [routing](src/app/router.tsx), [platform navigation](src/pages/PortalHomePage.tsx), [manifest validation](src/manifest/loader.ts), [host/child context](src/bridge/context.ts) and the [summary facade](src/summary/platformSummaryFacade.ts). The portal does not implement platform business APIs or deploy child applications itself.

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

| Console | Portal entry | Owned functionality |
|---|---|---|
| [Shoubing](https://github.com/Stellar-Enclosure/tianquan-shoubing-web) | `/xingyuan/tianquan-shoubing/overview` | Identity, tenants, OAuth clients, resource grants, keys and audit. |
| [Jianshen](https://github.com/Stellar-Enclosure/tianquan-jianshen-web) | `/xingyuan/tianquan-jianshen/iam/roles` | IAM directory, role/permission governance and authorization runtime. |
| [Yuheng](https://github.com/Stellar-Enclosure/yuheng-web) | `/xingyuan/yuheng/dashboard` | Gateway management, API catalog, releases, MCP and LLM configuration. |
| [Tianshu](https://github.com/Stellar-Enclosure/tianshu-web) | `/xingyuan/tianshu/registry` | Service registry, configuration, scope metadata and Prompt/Skill management. |
| [Yaoguang](https://github.com/Stellar-Enclosure/yaoguang-web) | `/xingyuan/yaoguang/knowledge` | Knowledge bases, documents, retrieval answers and Wiki. |

Deploy each console as static assets on its approved entry URL. Configure the Portal build with `VITE_PORTAL_CHILD_BINDINGS`, a JSON object keyed by the platform keys above. Each value supplies its exact `resource`, `url` for embedding, and `standaloneUrl`. The embedded URL ends with `/` or `/index.html`. Serve the same registration in `${BASE_URL}portal-manifest/<environment>.json`, adding the version range and metadata shown in the [local manifest example](public/portal-manifest/local.json). The example Resource URIs illustrate the shape. Deployment supplies the real approved HTTPS URLs and Resource URIs. `VITE_PORTAL_ENV` selects the manifest environment and defaults to `local`.

Set `VITE_PORTAL_OAUTH_CONFIG` to an object with `activeResource` and `registrations`. Each registration follows the shared `PublicOAuthRegistration` contract and names the host's tenant, issuer, PUBLIC client, Resource, API base, scopes and the fixed issuer endpoints. Register the exact callback `${Portal HTTPS origin}${VITE_BASE_PATH}auth/oidc/callback/${registration.id}`. Configure the Portal static server to serve its SPA for that path and the routes in the table. The Portal reads the identity from the signed callback. The Wujie bridge carries the selected tenant, issuer and child Resource as public context. Every console uses its own registration and starts its own user-authorized flow.

Use an explicit loopback child binding for local development over HTTP. Production child entries and their independent URLs use HTTPS. Provide the IdP and resource CORS and approved routes through the platform deployment.

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
