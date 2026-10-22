# portal

Unified browser entry point for the five Stellar Enclosure platform consoles. All first-party modules start at **0.0.1**.

## Current capabilities

- Render shared enterprise navigation and mount independent consoles through Wujie under `/xingyuan/:platformKey/*`, with a standalone fallback entry for each application.
- Validate deployment-owned manifests, child entry URLs, contract versions and host compatibility before mounting; pass the permitted host context and manage child teardown during navigation.
- Use Edge BFF sessions and platform capabilities to guard access. The portal consumes the shared Web SDK; individual consoles and backends own their business pages and authorization decisions.
- Include a platform-summary facade/component with timeout, partial-failure and retry states. Summary adapters are optional and report `NOT_CONFIGURED` when absent; the current root route redirects to the first child entry.

The implementation entry points are [routing](src/app/router.tsx), [platform navigation](src/pages/PortalHomePage.tsx), [manifest validation](src/manifest/loader.ts), [host/child context](src/bridge/context.ts) and the [summary facade](src/summary/platformSummaryFacade.ts). The portal does not implement platform business APIs or deploy child applications itself.

## Build and test

Requires Node 24 and npm 11. After the SDKs are published:

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
  --consumer portal --phase verify --online true
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

[Local manifest](public/portal-manifest/local.json) provides the 0.0.1 same-origin mapping. Deploy each child at `/apps/<business>/` using `VITE_BASE_PATH`, or supply a deployment-owned manifest with the same validation rules. A successful portal build does not prove that child assets, BFF sessions or their backend APIs are available.

## Application delivery (no package publication)

This repository is a frontend application, not a library. Its `package.json` remains `private: true`; do not publish it to npm or Maven Central. Publish only the reusable packages owned by [web-sdk](https://github.com/Stellar-Enclosure/web-sdk#publish-to-npmjs).

```bash
npm ci
npm test
npm run build
```

Deploy the resulting `dist/` directory as static application assets. Before the first SDK publication, use the Build section's local consumer verification instead of `npm ci` against the public registry. These commands do not start a server.

## Compatibility and publication

Java packages/classes, Bean names, configuration keys, OAuth/RPC identities, APIs, and database ownership are retained. Existing SQL and DDL history are copied byte for byte. Artifact/build versions and necessary build paths change. A successful build does not imply application startup or live infrastructure acceptance.

Git pushes run validation only. Central and npm publication are separate user actions. CI defaults to initial source bootstrap; after publication set `STELLAR_USE_SOURCE_BOOTSTRAP=false` to consume published artifacts directly. Private organizations may supply the Actions secret `STELLAR_ENCLOSURE_READ_TOKEN` with repository read access.

Original MIT/LGPL licenses and author attribution are preserved.
