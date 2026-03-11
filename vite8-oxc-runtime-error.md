# Vite 8 Bug: `@oxc-project/runtime` CJS helpers crash SSR module runner

## Summary

When OXC's `taggedTemplateEscape` feature rewrites tagged template literals containing `</script>`, it injects an import for `@oxc-project/runtime/helpers/taggedTemplateLiteral`. In SSR environments, Vite resolves this to the CJS version of the helper (because the `"node"` export condition matches first), but Vite's `ESModulesEvaluator` runs all code as ESM where `module` is not defined, causing a `ReferenceError`.

## Reproduction

```bash
node repro-oxc-runtime.mjs
```

**`src/ssr-test.ts`** — A tagged template literal containing `</script>`:

```ts
function html(strings: TemplateStringsArray, ...values: unknown[]) {
  return strings.join("");
}
export const result = html`<script>
  console.log("hi");
</script>`;
```

**`repro-oxc-runtime.mjs`** — Load it through the SSR module runner:

```js
import { createServer } from "vite";
const server = await createServer({
  configFile: false,
  root: import.meta.dirname,
});
const mod = await server.environments.ssr.runner.import("./src/ssr-test.ts");
// => ReferenceError: module is not defined
```

## Error

```
ReferenceError: module is not defined
    at eval (@oxc-project/runtime/src/helpers/taggedTemplateLiteral.js:8:1)
    at ESModulesEvaluator.runInlinedModule (vite/dist/node/module-runner.js:988:161)
    at ModuleRunner.directRequest (vite/dist/node/module-runner.js:1243:80)
    at async ModuleRunner.cachedRequest (vite/dist/node/module-runner.js:1150:73)
```

## Versions

- `vite@8.0.0-beta.18`
- `rolldown@1.0.0-rc.8`
- `@oxc-project/runtime@0.115.0`
- Node.js v24.12.0

## Root Cause Analysis

### Step 1: OXC's `taggedTemplateEscape` injects a runtime helper

When `transformWithOxc` processes code containing a tagged template literal with `</script>` in the string content, OXC rewrites the tagged template to escape the closing script tag for HTML safety. This happens **regardless of the `target` setting** — even `target: 'esnext'` triggers it.

**Input:**

```js
const result = html`<script>
  console.log("hi");
</script>`;
```

**Output after `transformWithOxc`:**

```js
var _templateObject;
import _taggedTemplateLiteral from "@oxc-project/runtime/helpers/taggedTemplateLiteral";
const result = html(
  _templateObject ||
    (_templateObject = _taggedTemplateLiteral([
      "<script>console.log('hi');<\/script>",
    ])),
);
```

Note: `</script>` is escaped to `<\/script>` in the output. The `_taggedTemplateLiteral` helper is needed to properly create the `TemplateStringsArray` with both `.raw` and cooked values after escaping.

### Step 2: The `vite:oxc` plugin resolves to the CJS version

In dev/serve mode, the `vite:oxc` plugin registers a `resolveId` hook for `@oxc-project/runtime/`:

```js
resolveId: {
  filter: { id: prefixRegex("@oxc-project/runtime/") },
  async handler(id, _importer, opts) {
    return await this.resolve(id, runtimeResolveBase, opts);
  },
  order: "pre"
}
```

This delegates to Vite's normal resolver with `runtimeResolveBase` pointing to Vite's own `package.json`. The resolution uses the environment's configured conditions.

### Step 3: The `"node"` condition matches before `"import"`

The `@oxc-project/runtime` package (`"type": "commonjs"`) has these exports:

```json
"./helpers/taggedTemplateLiteral": [
  {
    "node": "./src/helpers/taggedTemplateLiteral.js",
    "import": "./src/helpers/esm/taggedTemplateLiteral.js",
    "default": "./src/helpers/taggedTemplateLiteral.js"
  },
  "./src/helpers/taggedTemplateLiteral.js"
]
```

Vite's `DEFAULT_SERVER_CONDITIONS` are `["module", "node", <dev/prod>]`. The `"import"` condition is **not** in this list. So the resolver matches `"node"` first and resolves to the **CJS file**.

The CJS file uses `module.exports`:

```js
function _taggedTemplateLiteral(e, t) {
  /* ... */
}
((module.exports = _taggedTemplateLiteral),
  (module.exports.__esModule = true),
  (module.exports["default"] = module.exports));
```

### Step 4: The ESModulesEvaluator crashes

Vite's SSR module runner uses `ESModulesEvaluator` which runs all code as ESM. There is no `module` global in ESM scope, so `module.exports = ...` throws `ReferenceError: module is not defined`.

## Why build mode works

In build mode, the `vite:oxc` plugin does **not** register the `resolveId` hook — it's gated behind `config.command === "serve"`. Rolldown handles `@oxc-project/runtime` internally during bundling, with helpers inlined into its own dist bundle.

## Why only certain files are affected

The `taggedTemplateEscape` feature only triggers when a tagged template literal's string content contains `</script>`. This is a specific pattern — most code doesn't embed HTML `</script>` tags inside tagged template strings. In Astro's case, the Astro compiler embeds inline `<script is:inline>` content directly inside `render` tagged template literals, which triggers this issue.

Simple tagged template literals (even with expressions) do **not** trigger the helper:

```js
// These are fine — no helper injected:
html`<p>hello ${name}</p>`
html`<div>${renderComponent(...)}</div>`

// This triggers the helper — </script> in the template string:
html`<script data-is-inline>console.log('hi');</script>`
```

## Suggested Fixes

### Option A: Fix in `vite:oxc` plugin's `resolveId`

Rewrite the resolved path from `src/helpers/*.js` to `src/helpers/esm/*.js` when the consumer environment uses ESM evaluation.

### Option B: Add `"import"` to server conditions

Add `"import"` to `DEFAULT_SERVER_CONDITIONS` so the ESM version is resolved. This could have side effects for other packages.

### Option C: Externalize `@oxc-project/runtime` in the module runner

Mark `@oxc-project/runtime` as external in SSR environments so Node.js handles the CJS→ESM interop natively via its own `import()`.

### Option D: Change `@oxc-project/runtime` exports map

Have the `"node"` condition also check for ESM context, or restructure so the ESM version is the default for `"import"` + `"node"` consumers. This is more of an `@oxc-project/runtime` fix.
