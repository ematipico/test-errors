import { defineConfig, type Plugin } from 'vite';

const VIRTUAL_MODULE_ID = 'virtual:my-module';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

const COMMENT_RE = /\/\/\s*astro-head-inject/;

/**
 * Reproduction: Vite 8 (Rolldown) strips JS comments from `mod.code` in
 * `generateBundle` that Vite 7 (Rollup) preserved.
 *
 * This breaks any plugin that relies on detecting comment-based markers
 * in module code during the build output phase.
 *
 * Real-world impact: Astro's head propagation system used
 * `// astro-head-inject` comments to mark modules for head injection.
 * See: https://github.com/withastro/astro/pull/15819
 */
function myPlugin(): Plugin {
	return {
		name: 'my-plugin',

		resolveId(id) {
			if (id === VIRTUAL_MODULE_ID) {
				return RESOLVED_VIRTUAL_MODULE_ID;
			}
		},

		load(id) {
			if (id === RESOLVED_VIRTUAL_MODULE_ID) {
				return `// astro-head-inject\nexport const msg = "hello from virtual module";\n`;
			}
		},

		transform(code, id) {
			if (!id.includes('marker') && !id.includes('my-module')) return;
			const shortId = id.split('/').pop() ?? id;
			const has = COMMENT_RE.test(code);
			console.log(`[transform] ${shortId}: comment found = ${has}`);
			console.log(`  source: ${JSON.stringify(code)}`);
		},

		generateBundle(_opts, bundle) {
			for (const [, output] of Object.entries(bundle)) {
				if (output.type !== 'chunk') continue;
				for (const [id, mod] of Object.entries(output.modules)) {
					if (!id.includes('marker') && !id.includes('my-module')) continue;
					const shortId = id.split('/').pop() ?? id;
					const has = COMMENT_RE.test(mod.code ?? '');
					console.log(`[generateBundle] ${shortId}: comment found = ${has}`);
					console.log(`  mod.code: ${JSON.stringify(mod.code)}`);
				}
			}
		},
	};
}

export default defineConfig({
	plugins: [myPlugin()],
});
