/* eslint-disable no-console */
// eslint-disable-next-line import/no-extraneous-dependencies
import { build } from 'esbuild';
import { rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

async function run() {
  console.log('🧹 Cleaning dist...');
  await rm(dist, { recursive: true, force: true });

  console.log('⚡ Building server...');

  await build({
    entryPoints: ['./src/server.js'],
    outfile: './dist/server.js',
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    external: [
      '@roamhq/wrtc',
      'systeminformation',
    ],
  });

  console.log('📄 Updating package.json...');

  const pkg = JSON.parse(
    await readFile('./package.json', 'utf-8'),
  );

  pkg.main = './server.js';
  pkg.exports = {
    '.': './server.js',
  };

  await writeFile(
    './dist/package.json',
    JSON.stringify(pkg, null, 2),
  );

  console.log('✅ Build complete!');
}

run().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
