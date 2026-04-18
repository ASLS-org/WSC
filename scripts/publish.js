import { execSync } from 'child_process';

const pkgs = [
  'bindings/js/sdk',
  'implementations/js/client',
];

// eslint-disable-next-line no-restricted-syntax
for (const p of pkgs) {
  console.log(`Publishing ${p}`);
  execSync(`npm publish ${p}`, { stdio: 'inherit' });
}
