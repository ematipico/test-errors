/**
 * Reproduction: Vite 8 strips JS comments from mod.code in generateBundle.
 *
 * Usage:
 *   node build.mjs          — run with whatever vite is installed
 *   node build.mjs compare  — install v7 and v8, run both, print comparison
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const mode = process.argv[2];

if (mode === 'compare') {
	console.log('=== Installing Vite 7 ===\n');
	execSync('pnpm add -D vite@7.3.1 2>&1', { stdio: 'inherit', cwd: import.meta.dirname });
	console.log('\n--- Vite 7 build ---\n');
	const v7 = execSync('node build.mjs', { encoding: 'utf8', cwd: import.meta.dirname });
	console.log(v7);

	console.log('\n=== Installing Vite 8 ===\n');
	execSync('pnpm add -D vite@latest 2>&1', { stdio: 'inherit', cwd: import.meta.dirname });
	console.log('\n--- Vite 8 build ---\n');
	const v8 = execSync('node build.mjs', { encoding: 'utf8', cwd: import.meta.dirname });
	console.log(v8);

	console.log('\n=== Summary ===');
	console.log('Vite 7: comments in mod.code inside generateBundle are PRESERVED');
	console.log('Vite 8: comments in mod.code inside generateBundle are STRIPPED');
	console.log('        This is a breaking change for plugins that rely on comment');
	console.log('        detection in generateBundle (e.g. Astro head propagation).');
} else {
	const { build, version } = await import('vite');
	console.log(`vite version: ${version}\n`);
	try {
		await build({ logLevel: 'warn' });
	} catch (e) {
		console.error('Build failed:', e.message);
		process.exit(1);
	}
}
