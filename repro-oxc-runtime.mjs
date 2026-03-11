/**
 * Minimal reproduction: @oxc-project/runtime CJS helpers crash Vite 8 SSR module runner
 *
 * OXC's `taggedTemplateEscape` rewrites tagged template literals containing `</script>`
 * to use `@oxc-project/runtime/helpers/taggedTemplateLiteral`. This is correct for HTML
 * safety, but the helper resolves to the CJS version in SSR environments (because the
 * "node" export condition matches before "import"), and Vite's ESModulesEvaluator cannot
 * run CJS code (no `module` global), causing `ReferenceError: module is not defined`.
 *
 * Run: node repro-oxc-runtime.mjs
 */

import { createServer } from 'vite';

const server = await createServer({
	configFile: false,
	root: import.meta.dirname,
});

try {
	// Import a .ts file that contains a tagged template with </script> inside.
	// OXC transforms this by injecting @oxc-project/runtime/helpers/taggedTemplateLiteral.
	// The SSR module runner then fails because it resolves to the CJS version.
	const mod = await server.environments.ssr.runner.import('./src/ssr-test.ts');
	console.log('SUCCESS:', mod.result);
} catch (err) {
	console.error('FAILED:', err.message);
	console.error('\nFull error:');
	console.error(err.stack);
} finally {
	await server.close();
}
