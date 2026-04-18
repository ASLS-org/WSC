import fs from 'fs';

const version = process.argv[2];

const packages = [
  'bindings/js/sdk/package.json',
  'implementations/js/client/package.json',
];

// eslint-disable-next-line no-restricted-syntax
for (const p of packages) {
  const json = JSON.parse(fs.readFileSync(p, 'utf-8'));
  json.version = version;
  fs.writeFileSync(p, JSON.stringify(json, null, 2));
}

console.log('Version set:', version);
