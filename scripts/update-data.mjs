import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';

// 同步上游快照：
// - cache.zip 解压到 public/data/cache/（students/、spines/、schools.json、state.json）
// - students.json 作为构建基底存到 cache/upstream，由 scripts/build-data.mjs 补充字段
// - schools.json 供应用直接使用
const BASE_URL = 'https://agent-0808.github.io/BA-characters-internal-id/data';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheRoot = join(root, 'public', 'data', 'cache');
const outputDir = join(root, 'public', 'data');

async function download(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`下载失败 ${url}: HTTP ${response.status}`);
    }
    return response;
}

// 先全部下载成功，再落盘，避免中途失败破坏本地缓存
const [cacheResponse, studentsResponse, schoolsResponse] = await Promise.all([
    download(`${BASE_URL}/cache.zip`),
    download(`${BASE_URL}/students.json`),
    download(`${BASE_URL}/schools.json`)
]);
const cacheZip = new Uint8Array(await cacheResponse.arrayBuffer());
const studentsText = await studentsResponse.text();
const schoolsText = await schoolsResponse.text();

// 清掉旧的 page / spine 缓存，避免上游减少页面后残留
for (const dir of ['students', 'spines']) {
    await rm(join(cacheRoot, dir), { recursive: true, force: true });
}

const entries = unzipSync(cacheZip);
const prefix = 'cache/';
let extracted = 0;
for (const [name, data] of Object.entries(entries)) {
    if (!name.startsWith(prefix) || name.endsWith('/')) continue;
    const target = join(cacheRoot, name.slice(prefix.length));
    if (!target.startsWith(cacheRoot)) {
        throw new Error(`cache.zip 中存在越界路径：${name}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    extracted++;
}
console.log(`已解压 cache.zip（${extracted} 个文件）到 public/data/cache/`);

await mkdir(join(cacheRoot, 'upstream'), { recursive: true });
await writeFile(join(cacheRoot, 'upstream', 'students.json'), studentsText, 'utf8');
console.log('已更新 public/data/cache/upstream/students.json');

await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, 'schools.json'), schoolsText, 'utf8');
console.log('已更新 public/data/schools.json');
