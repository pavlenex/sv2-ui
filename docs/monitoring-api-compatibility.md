# Monitoring API Contract

`sv2-ui` consumes monitoring APIs exposed by `sv2-apps` containers, currently JD Client (JDC) and Translator Proxy (tProxy).

These APIs may still evolve on the `sv2-apps` side. Because of that, `sv2-ui` should treat the backend-facing monitoring API as an integration contract and keep the React frontend insulated from raw response-shape churn.

## Contract Boundaries

`sv2-ui` should keep monitoring assumptions explicit at the boundary where it calls JDC and Translator Proxy.

When a monitoring endpoint is used, capture:

- endpoint path
- response fields consumed by the UI
- backend normalization needed before data reaches React
- optional fields or features that may be absent

## Handling API Changes

When `sv2-apps` changes a monitoring API, `sv2-ui` should classify the API change before updating the dashboard.

### Backward-Compatible Additions

Examples:

- new optional field
- new endpoint
- new optional detail beside an existing field

Action in `sv2-ui`:

- no change if unused
- optional UI enhancement if useful
- field-presence check is usually enough

### Breaking Changes

Examples:

- field removed
- field renamed
- field type changed
- field meaning or unit changed
- endpoint removed or response shape changed

Action in `sv2-ui`:

- update the integration contract for the affected endpoint
- add or update backend normalization if the frontend needs a stable shape
- add fixture tests using representative upstream payloads

## Frontend Rule

The React frontend should avoid depending directly on raw JDC/tProxy response shapes.

If a raw API difference affects data already shown by the dashboard, normalize it in the `sv2-ui` backend or shared monitoring layer first.

If a future monitoring API exposes new data, treat it as an optional feature unless the setup flow requires it.

## API Type Generation

TypeScript types are **auto-generated from the shared OpenAPI spec** (`shared/openapi.json`), not manually maintained.

### File Structure

| File | Purpose |
|------|---------|
| `src/types/api-generated.ts` | **AUTO-GENERATED** - Types from OpenAPI spec. Do not edit manually. |
| `src/types/api.ts` | Re-exports generated types + manual app-specific types |

### Generating Types

```bash
npm run generate:types
```

Regenerate after updating `shared/openapi.json` from upstream.
