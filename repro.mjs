/**
 * Minimal reproduction for:
 * "[vite] An error happened during full reload"
 * "Error: transport was disconnected, cannot call fetchModule"
 *
 * ## Root cause
 *
 * In Vite 8, when a module in a RunnableDevEnvironment has no HMR boundary
 * (i.e. it doesn't call `import.meta.hot.accept`), Vite's updateModules()
 * sends a `full-reload` message to that environment's hot channel.
 *
 * The RunnableDevEnvironment's module runner receives this `full-reload` and:
 * 1. Clears its evaluated module cache
 * 2. Re-imports all entrypoint modules via runner.import()
 *
 * If the dev server is closed (e.g. test teardown) while step 2 is in flight,
 * the transport is disconnected and runner.import() throws:
 *   "transport was disconnected, cannot call fetchModule"
 *
 * This error is caught and logged by Vite — it does not crash the process.
 * However, on slow CI machines (Windows), the re-import attempt adds latency
 * on every HMR event, causing the test suite to exceed its time budget.
 *
 * ## Reproduction steps
 *
 * 1. Create a RunnableDevEnvironment with a module that has no HMR boundary
 * 2. Import that module via the runner (populate evaluatedModules)
 * 3. Edit a file that the module depends on → triggers full-reload to the env
 * 4. Close the server while the runner is re-importing entrypoints
 *
 * ## Expected behavior
 *
 * server.close() should either:
 * a) Prevent the runner from re-importing if the transport is about to close, OR
 * b) Not log an error when the transport closes during an in-flight re-import
 *
 * ## Vite version: 8.0.1
 */

import { createServer, createRunnableDevEnvironment, isRunnableDevEnvironment } from 'vite';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const triggeredFile = resolve(__dirname, 'src/main.js');

// Intercept console.log to detect the module runner error.
// The module runner's hmrLogger.error uses console.log (not console.error),
// prefixing all messages with "[vite]".
let errorDetected = false;
const origLog = console.log;
console.log = (...args) => {
	const msg = args.map(String).join(' ');
	if (
		msg.includes('transport was disconnected') ||
		msg.includes('error happened during full reload')
	) {
		errorDetected = true;
	}
	origLog(...args);
};

const customLogger = {
	info: () => {},
	warn: () => {},
	warnOnce: () => {},
	error: (msg) => {
		if (
			msg.includes('transport was disconnected') ||
			msg.includes('error happened during full reload')
		) {
			errorDetected = true;
		}
		process.stderr.write(msg + '\n');
	},
	clearScreen: () => {},
	hasErrorLogged: () => false,
	hasWarned: false,
};

const server = await createServer({
	root: __dirname,
	customLogger,
	logLevel: 'silent',
	server: { port: 5199, hmr: { port: 5200 } },
	environments: {
		// Custom runnable environment — same pattern used by Astro for SSR
		ssr: {
			dev: {
				createEnvironment(name, config) {
					return createRunnableDevEnvironment(name, config);
				},
			},
		},
	},
	plugins: [
		{
			// Make transforms slow to simulate a slow CI machine and widen the race window
			name: 'repro:slow-transform',
			transform: {
				handler: async (code) => {
					await new Promise((r) => setTimeout(r, 200));
					return code;
				},
			},
		},
	],
});

await server.listen();

const ssrEnv = server.environments.ssr;
if (!isRunnableDevEnvironment(ssrEnv)) {
	console.log('SSR env is not runnable — cannot reproduce');
	await server.close();
	process.exit(0);
}

// Import the module via the runner to populate evaluatedModules
// (simulates what happens on the first SSR page request)
await ssrEnv.runner.import('/src/main.js');
console.log(
	'[repro] runner has',
	ssrEnv.runner.evaluatedModules.idToModuleMap.size,
	'evaluated module(s)',
);

// Edit the file — Vite will detect no HMR boundary and send full-reload
// to the ssr environment's hot channel, triggering the runner to re-import
console.log('[repro] editing file to trigger full-reload...');
writeFileSync(triggeredFile, `// changed at ${Date.now()}\nexport const message = 'hello';\n`);

// Wait for the watcher to fire and the runner to start re-importing,
// then close before the slow transform completes
await new Promise((r) => setTimeout(r, 100));
console.log('[repro] closing server (simulating test teardown)...');
await server.close();

// Allow any async errors to surface
await new Promise((r) => setTimeout(r, 500));

// Restore the file
writeFileSync(triggeredFile, `export const message = 'hello';\n`);

if (errorDetected) {
	console.log(
		'\n[REPRODUCED] Bug confirmed: "transport was disconnected" during full-reload re-import',
	);
	console.log('See repro.mjs for full details.');
	process.exit(1);
} else {
	console.log('[repro] No error detected (try adjusting the setTimeout delays)');
	process.exit(0);
}
