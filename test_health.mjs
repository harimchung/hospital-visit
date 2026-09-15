// test_health.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local 로드
const envPath = path.resolve(__dirname, 'api/_lib/.env.local');
if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, 'utf8');
  text.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  });
} else {
  console.log('env 파일 없음: ' + envPath);
}

const health = await import('./api/health.js');
const res = await health.GET();
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
