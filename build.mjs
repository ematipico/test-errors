import { build } from 'vite';

try {
	await build();
	console.log('\nBuild succeeded');
} catch (e) {
	console.error('Build failed:', e.message);
	process.exit(1);
}
