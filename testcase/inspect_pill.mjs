import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve('./api/_lib/.env.local');
if (!fs.existsSync(envPath)) throw new Error('env 없음');

const content = fs.readFileSync(envPath, 'utf8');

const pillKey = content.split('\n').find(l => l.trim().startsWith('DATA_API_KEY'))?.split('=')[1]?.trim();
const encKey = publicApiKey = pillKey ? encodeURIComponent(pillKey) : '';

console.log('DATA_API_KEY(처리 전):', pillKey);
console.log('DATA_API_KEY(URL 인코딩):', encKey);
console.log('길이:', pillKey?.length);

const url = new URL('https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList');
url.searchParams.set('serviceKey', pillKey);
url.searchParams.set('itemName', '타이레놀');
url.searchParams.set('type', 'json');
url.searchParams.set('pageNo', '1');
url.searchParams.set('numOfRows', '5');

console.log('호출 URL:', url.toString());
console.log('--- fetch ---');
const res = await fetch(url.toString());
console.log('status:', res.status);
const text = await res.text();
console.log('body(앞 800자):', text.slice(0, 800));
