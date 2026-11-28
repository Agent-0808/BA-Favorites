import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isRuleExcluded, roleKey } from './data-rules.mjs';

/**
 * 本地查看全部数据被分到了哪一类，便于维护 curation.json。
 * 数据来自本地 cache（public/data/cache/students/，不入库），生成 HTML 预览页。
 *
 * 用法：npm run data:view
 * 输出：dist/data-view.html（构建产物，随 dist 一起被清理）
 */

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(scriptDir);
const dataDir = join(root, 'public', 'data');
const cacheDir = join(dataDir, 'cache', 'students');
const outFile = join(root, 'dist', 'data-view.html');

/** 展示顺序与标题。 */
const SECTIONS = [
    { key: 'student', title: '学生', hint: 'is_npc 为 false，默认参与排序' },
    { key: 'npc', title: '常规 NPC', hint: '类似学生，默认参与排序' },
    { key: 'mob', title: '杂鱼酱（路人学生）', hint: '无名路人，需在开始页开启「包含杂鱼酱」' },
    { key: 'other', title: '其他（机器人 / Boss 等）', hint: '默认排除，可在开始页开启「包含其他角色」' },
    { key: 'nameonly', title: '只有名字', hint: '仅出现名字、尚未登场，默认隐藏' },
    { key: 'rule', title: '按规则排除', hint: '官方账号 / 彩蛋 / CBT，不进入数据' },
    { key: 'exclude', title: '名单排除', hint: 'curation.exclude，手工移除' }
];

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

function absoluteUrl(url) {
    if (!url) return '';
    return url.startsWith('//') ? `https:${url}` : url;
}

function pickAvatar(data) {
    const pages = data.skin_list ?? [];
    return (pages.find(page => !page.skin && page.avatar) ?? pages.find(page => page.avatar))?.avatar ?? '';
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function renderCard(role, category, inStudents) {
    const tags = [role.isNpc ? 'NPC' : '学生'];
    if (!inStudents) tags.push('未收录');
    const avatar = role.avatar
        ? `<img src="${escapeHtml(role.avatar)}" alt="" loading="lazy">`
        : '<div class="no-avatar">无头像</div>';
    const search = `${role.id} ${role.name} ${role.schoolName}`.toLowerCase();
    return `<figure class="card" data-category="${category}" data-search="${escapeHtml(search)}">
  <div class="thumb">${avatar}</div>
  <figcaption>
    <span class="id">#${role.id}</span>
    <span class="name">${escapeHtml(role.name)}</span>
    <span class="school">${escapeHtml(role.schoolName)}</span>
    <span class="tags">${tags.map(tag => `<em>${tag}</em>`).join('')}</span>
  </figcaption>
</figure>`;
}

function renderSection(section, roles, studentsById) {
    if (roles.length === 0) {
        return `<section data-section="${section.key}">
  <h2>${section.title} <span class="count" data-count="0">0</span></h2>
  <p class="hint">${section.hint}</p>
  <p class="empty">暂无角色</p>
</section>`;
    }
    const cards = roles.map(role => renderCard(role, section.key, studentsById.has(role.id))).join('\n');
    return `<section data-section="${section.key}">
  <h2>${section.title} <span class="count" data-count="${roles.length}">${roles.length}</span></h2>
  <p class="hint">${section.hint}</p>
  <div class="grid">${cards}</div>
</section>`;
}

const curation = await readJson(join(dataDir, 'curation.json'));
const schools = await readJson(join(dataDir, 'schools.json'));
const students = await readJson(join(dataDir, 'students.json'));
const studentsById = new Set(students.map(student => student.id));
const schoolNames = new Map(schools.map(school => [school.id, school.name || school.name_cn || `学校 ${school.id}`]));
const excludeIds = new Set(curation.exclude ?? []);
const mobIds = new Set(curation.mob ?? []);
const otherIds = new Set(curation.other ?? []);
const nameonlyIds = new Set(curation.nameonly ?? []);

const roles = new Map();
let cacheFiles;
try {
    cacheFiles = (await readdir(cacheDir)).filter(file => file.endsWith('.json'));
} catch {
    throw new Error(`读取不到缓存目录：${cacheDir}，请先同步上游 cache`);
}
for (const file of cacheFiles) {
    const { data } = await readJson(join(cacheDir, file));
    const id = roleKey(data);
    if (roles.has(id)) continue;
    roles.set(id, {
        id,
        name: `${data.family_name ?? ''}${data.given_name ?? ''}` || `角色 ${id}`,
        schoolName: schoolNames.get(data.school) ?? `学校 ${data.school}`,
        avatar: absoluteUrl(pickAvatar(data)),
        isNpc: Boolean(data.is_npc),
        data
    });
}

/** 分类优先级与构建脚本一致：名单排除 > 上游规则 > other > mob > nameonly > NPC > 学生。 */
function classify(role) {
    if (excludeIds.has(role.id)) return 'exclude';
    if (isRuleExcluded(role.id, role.data)) return 'rule';
    if (otherIds.has(role.id)) return 'other';
    if (mobIds.has(role.id)) return 'mob';
    if (nameonlyIds.has(role.id)) return 'nameonly';
    return role.isNpc ? 'npc' : 'student';
}

const groups = new Map(SECTIONS.map(section => [section.key, []]));
for (const role of roles.values()) {
    groups.get(classify(role)).push(role);
}
for (const list of groups.values()) list.sort((a, b) => a.id - b.id);

const summary = SECTIONS.map(section => `${section.title} ${groups.get(section.key).length}`).join(' / ');
const sectionsHtml = SECTIONS.map(section => renderSection(section, groups.get(section.key), studentsById)).join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>数据分类预览</title>
<style>
  :root { color-scheme: dark; --bg:#101a2c; --card:#1b2941; --text:#eaf2ff; --muted:#8ea4c8; --accent:#4ca7ff; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: var(--bg); color: var(--text); font-family: system-ui, "Microsoft YaHei", sans-serif; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 30px 0 4px; color: var(--accent); display: flex; gap: 8px; align-items: baseline; }
  .count { font-size: 12px; color: var(--muted); font-weight: 500; }
  .meta { font-size: 12px; color: var(--muted); }
  .hint { margin: 0 0 10px; font-size: 12px; color: var(--muted); }
  .empty { color: var(--muted); font-size: 13px; }
  .search { margin-top: 14px; padding: 8px 12px; width: min(320px, 100%); border-radius: 8px; border: 1px solid #2a3d5c; background: #0b1220; color: var(--text); font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 12px; }
  .card { margin: 0; background: var(--card); border-radius: 10px; overflow: hidden; }
  .card[hidden] { display: none; }
  .thumb { aspect-ratio: 1; background: #0b1220; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .no-avatar { height: 100%; display: grid; place-items: center; font-size: 12px; color: var(--muted); }
  figcaption { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
  .id { color: var(--muted); font-size: 11px; }
  .name { font-weight: 700; }
  .school { color: var(--muted); }
  .tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
  .tags em { font-style: normal; font-size: 10px; padding: 1px 5px; border-radius: 4px; background: #2a3d5c; color: #bcd3f5; }
</style>
</head>
<body>
<h1>数据分类预览</h1>
<div class="meta">共 ${roles.size} 个角色，当前 students.json ${students.length} 个；${summary}</div>
<input class="search" id="search" type="search" placeholder="按 id / 名字 / 学校筛选">
${sectionsHtml}
<script>
const input = document.getElementById('search');
input.addEventListener('input', () => {
  const query = input.value.trim().toLowerCase();
  for (const section of document.querySelectorAll('section[data-section]')) {
    let shown = 0;
    for (const card of section.querySelectorAll('.card')) {
      const match = query === '' || card.dataset.search.includes(query);
      card.hidden = !match;
      if (match) shown++;
    }
    section.querySelector('[data-count]').textContent = shown;
    const grid = section.querySelector('.grid');
    let empty = section.querySelector('.filtered-empty');
    if (!empty) {
      empty = document.createElement('p');
      empty.className = 'empty filtered-empty';
      empty.textContent = '没有匹配的角色';
      section.append(empty);
    }
    empty.hidden = shown > 0;
    if (grid) grid.hidden = shown === 0;
  }
});
</script>
</body>
</html>
`;

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, html, 'utf8');
console.log(`已生成 ${outFile}`);
console.log(summary);
