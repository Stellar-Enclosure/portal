# portal

Stellar Enclosure frontend. All first-party modules start at **0.0.1**.

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
  --output "$(pwd)/dist/sdk-verification" \
  --consumer portal --phase verify --online true
```

The verifier uses actual pack checksums and official registry addresses in the committed lock, then validates offline installation. It never publishes packages.

## Child applications

Five guarded child entries are supported, including Yaoguang at `/xingyuan/yaoguang/knowledge`. `public/portal-manifest/local.json` provides the 0.0.1 same-origin mapping. Deploy each child at `/apps/<business>/` using `VITE_BASE_PATH`, or supply a deployment-owned manifest with the same validation rules. Missing summary adapters remain explicitly unconfigured.

## Compatibility and publication

Java packages/classes, Bean names, configuration keys, OAuth/RPC identities, APIs, and database ownership are retained. Existing SQL and DDL history are copied byte for byte. Artifact/build versions and necessary build paths change. A successful build does not imply application startup or live infrastructure acceptance.

Git pushes run validation only. Central and npm publication are separate user actions. CI defaults to initial source bootstrap; after publication set `STELLAR_USE_SOURCE_BOOTSTRAP=false` to consume published artifacts directly. Private organizations may supply the Actions secret `STELLAR_ENCLOSURE_READ_TOKEN` with repository read access.

Original MIT/LGPL licenses and author attribution are preserved.
