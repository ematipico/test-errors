import { defineConfig, type Plugin } from 'vite';

const VIRTUAL_MODULE_ID = 'virtual:my-module';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

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
				// Return code with a comment, a directive, and a variable marker
				return `
// my-special-comment
"use my-special-directive";
const $$my_marker_unused = true;
export const $$my_marker_exported = true;
globalThis.$$my_marker_global = true;
export const msg = "hello from virtual module";
`;
			}
		},

		generateBundle(_opts, bundle) {
			for (const [, output] of Object.entries(bundle)) {
				if (output.type !== 'chunk') continue;
				for (const [id, mod] of Object.entries(output.modules)) {
					if (!id.includes('my-module')) continue;

					console.log('\n=== Module:', id, '===');
					console.log('Code:\n' + mod.code);
					console.log('\nSurvival check:');
					console.log(
						"  Comment '// my-special-comment':",
						mod.code?.includes('my-special-comment') ? '✅ SURVIVED' : '❌ STRIPPED',
					);
					console.log(
						"  Directive 'use my-special-directive':",
						mod.code?.includes('my-special-directive') ? '✅ SURVIVED' : '❌ STRIPPED',
					);
					console.log(
						"  Unused const '$$my_marker_unused':",
						mod.code?.includes('$$my_marker_unused') ? '✅ SURVIVED' : '❌ STRIPPED',
					);
					console.log(
						"  Exported const '$$my_marker_exported':",
						mod.code?.includes('$$my_marker_exported') ? '✅ SURVIVED' : '❌ STRIPPED',
					);
					console.log(
						"  globalThis assignment '$$my_marker_global':",
						mod.code?.includes('$$my_marker_global') ? '✅ SURVIVED' : '❌ STRIPPED',
					);
				}
			}
		},
	};
}

export default defineConfig({
	plugins: [myPlugin()],
});
