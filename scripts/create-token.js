import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

mkdirSync('work', { recursive: true });
writeFileSync('work/hosted-secrets.json', JSON.stringify({ BUILD_TOKEN: randomBytes(32).toString('hex') }), { mode: 0o600, flag: 'wx' });
console.log('Created work/hosted-secrets.json. Keep it private; use its token in the hosted editor.');
