import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE_URL = 'https://agent-0808.github.io/BA-characters-internal-id/data';
const FILES = ['students.json', 'schools.json'];

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(root, 'public', 'data');

await mkdir(outputDir, { recursive: true });

for (const file of FILES) {
    const url = `${BASE_URL}/${file}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`下载失败 ${url}: HTTP ${response.status}`);
    }
    const text = await response.text();
    await writeFile(join(outputDir, file), text, 'utf8');
    console.log(`已更新 public/data/${file}`);
}
