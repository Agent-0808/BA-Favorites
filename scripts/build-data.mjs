import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DATA_RULES, isRuleExcluded, roleKey } from './data-rules.mjs';

/**
 * 以上游 students.json 为基底，补充本站需要的字段，输出 public/data/students.json。
 *
 * 工作流：
 *   npm run update-data   # 下载上游 students.json 到 cache/upstream，并同步 schools.json
 *   npm run data:build    # 从 cache 补充 age / height / body_shape，并按 curation 标注 tier
 *
 * 上游 students.json 已包含多语言角色名与皮肤名，也已完成官方账号 / 彩蛋 / CBT 过滤，
 * 这里只做增量补充与人工名单过滤；冗余字段（spines、sd_model_image 等）原样保留。
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, 'public', 'data');
const cacheDir = join(dataDir, 'cache', 'students');
const baseFile = join(dataDir, 'cache', 'upstream', 'students.json');
const curationFile = join(dataDir, 'curation.json');
const outputFile = join(dataDir, 'students.json');

/** 上游爬虫的版本文件，用于发现上游结构变化；读不到时不影响构建。 */
const upstreamVersionFile = 'D:/Game/BlueArchive/tools/BA-characters-id/crawler/VERSION';
/** 当前数据补充所依据的上游版本。 */
const expectedCrawlerVersion = 'v5.1.0';

/** cache 文件必须提供的字段，缺失直接失败而不是静默产出 null。 */
const REQUIRED_FIELDS = ['id', 'skin_list', 'age', 'height', 'body_shape'];

const args = new Set(process.argv.slice(2));
const wantReport = args.has('--report');
const wantDiff = args.has('--diff');

const warnings = [];

function warn(message) {
    warnings.push(message);
}

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

async function readUpstreamVersion() {
    try {
        return (await readFile(upstreamVersionFile, 'utf8')).trim();
    } catch {
        return null;
    }
}

/** 在所有页面文件里取第一个非空值，值不一致时记录告警。 */
function collectField(files, field, roleId) {
    let value = null;
    for (const { file, data } of files) {
        const current = data[field];
        if (current === undefined || current === null || current === '') continue;
        if (value === null) value = current;
        else if (value !== current) {
            warn(`角色 ${roleId} 的 ${field} 不一致：${JSON.stringify(value)} / ${JSON.stringify(current)}（${file}）`);
        }
    }
    return value;
}

/** 数值字段：越界或缺失视为无效，统一写 null（不要 0 / 1 这类哨兵值）。 */
function cleanRange(value, [min, max]) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function cleanText(value) {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function validateCache(raw, file) {
    const data = raw?.data;
    if (!data || typeof data !== 'object') {
        return [`${file}: 缺少 data 对象`];
    }
    return REQUIRED_FIELDS.filter(field => data[field] === undefined || data[field] === null).map(
        field => `${file}: 缺少字段 data.${field}`
    );
}

function validateBase(base) {
    if (!Array.isArray(base)) {
        throw new Error(`${baseFile} 不是数组，请重新执行 npm run update-data`);
    }
    const problems = [];
    for (const student of base) {
        if (typeof student?.id !== 'number') problems.push('存在缺少数字 id 的条目');
        else if (!Array.isArray(student.pages)) problems.push(`角色 ${student.id} 缺少 pages 数组`);
    }
    if (problems.length > 0) {
        throw new Error(`上游 students.json 结构异常（${problems.length} 处）：\n${problems.slice(0, 20).join('\n')}`);
    }
}

function tierOf(roleId, curation) {
    return curation.mob.has(roleId)
        ? 'mob'
        : curation.other.has(roleId)
          ? 'other'
          : curation.nameonly.has(roleId)
            ? 'nameonly'
            : 'normal';
}

function formatMarkdownDiff(previous, next) {
    const prevById = new Map(previous.map(student => [student.id, student]));
    const nextById = new Map(next.map(student => [student.id, student]));
    const added = [...nextById.keys()].filter(id => !prevById.has(id));
    const removed = [...prevById.keys()].filter(id => !nextById.has(id));
    const changed = [...nextById.keys()].filter(
        id => prevById.has(id) && JSON.stringify(prevById.get(id)) !== JSON.stringify(nextById.get(id))
    );

    const name = (student) => `${student.family_name ?? ''}${student.given_name ?? ''}`;
    const lines = ['# students.json 变更', ''];
    lines.push(added.length ? `## 新增（${added.length}）` : '## 新增（0）');
    for (const id of added) lines.push(`- ➕ ${id} ${name(nextById.get(id))}`);
    lines.push('', removed.length ? `## 删除（${removed.length}）` : '## 删除（0）');
    for (const id of removed) lines.push(`- ➖ ${id} ${name(prevById.get(id))}`);
    lines.push('', changed.length ? `## 字段变化（${changed.length}）` : '## 字段变化（0）');
    for (const id of changed) {
        const before = prevById.get(id);
        const after = nextById.get(id);
        const pagesBefore = new Set((before.pages ?? []).map(page => page.page_id));
        const pagesAfter = new Set((after.pages ?? []).map(page => page.page_id));
        const pageAdds = [...pagesAfter].filter(page => !pagesBefore.has(page));
        const pageRemoves = [...pagesBefore].filter(page => !pagesAfter.has(page));
        const keys = Object.keys(after).filter(key => key !== 'pages');
        const fieldChanges = keys.filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
        const details = [
            ...fieldChanges.map(key => `${key}: ${JSON.stringify(before[key])} ➝ ${JSON.stringify(after[key])}`),
            pageAdds.length ? `新增页面 ${pageAdds.join(', ')}` : '',
            pageRemoves.length ? `移除页面 ${pageRemoves.join(', ')}` : '',
            pageAdds.length === 0 && pageRemoves.length === 0 && fieldChanges.length === 0 ? '页面字段变化' : ''
        ].filter(Boolean);
        lines.push(`- ➝ ${id} ${name(after)}：${details.join('；')}`);
    }
    return lines.join('\n');
}

async function main() {
    const crawlerVersion = await readUpstreamVersion();
    if (crawlerVersion && crawlerVersion !== expectedCrawlerVersion) {
        warn(`上游 crawler 版本为 ${crawlerVersion}，本脚本按 ${expectedCrawlerVersion} 编写，请核对字段结构`);
    }

    const curation = await readJson(curationFile);
    const excludeIds = new Set(curation.exclude ?? []);
    const buckets = [
        ['mob', new Set(curation.mob ?? [])],
        ['other', new Set(curation.other ?? [])],
        ['nameonly', new Set(curation.nameonly ?? [])]
    ];
    // 同一条目只能属于一个分类桶
    for (let i = 0; i < buckets.length; i++) {
        for (let j = i + 1; j < buckets.length; j++) {
            const [a, idsA] = buckets[i];
            const [b, idsB] = buckets[j];
            const overlap = [...idsA].filter(id => idsB.has(id));
            if (overlap.length > 0) {
                throw new Error(`curation.json 中 ${a} 与 ${b} 重复：${overlap.join(', ')}`);
            }
        }
    }
    const context = { mob: buckets[0][1], other: buckets[1][1], nameonly: buckets[2][1] };

    const base = await readJson(baseFile);
    validateBase(base);

    const files = (await readdir(cacheDir)).filter(file => file.endsWith('.json')).sort();
    if (files.length === 0) {
        throw new Error(`缓存目录为空：${cacheDir}`);
    }

    // 按角色归并 cache，用于补充角色级字段
    const groups = new Map();
    const problems = [];
    for (const file of files) {
        const raw = await readJson(join(cacheDir, file));
        const fileProblems = validateCache(raw, file);
        if (fileProblems.length > 0) {
            problems.push(...fileProblems);
            continue;
        }
        const key = roleKey(raw.data);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ file, data: raw.data });
    }
    if (problems.length > 0) {
        throw new Error(`缓存结构校验失败（${problems.length} 处）：\n${problems.slice(0, 20).join('\n')}`);
    }
    // 按页面 id 升序，保证“取第一个非空值”的结果稳定
    for (const group of groups.values()) group.sort((a, b) => a.data.id - b.data.id);

    const excluded = { rule: 0, curation: 0 };
    const students = [];

    for (const student of base) {
        const group = groups.get(student.id);
        // 基底已由上游按同一规则过滤；这里再兜底一次，避免基底版本不一致
        if (group && isRuleExcluded(student.id, group[0].data)) {
            excluded.rule++;
            continue;
        }
        if (excludeIds.has(student.id)) {
            excluded.curation++;
            continue;
        }

        const age = cleanRange(group ? collectField(group, 'age', student.id) : null, DATA_RULES.ageRange);
        const height = cleanRange(group ? collectField(group, 'height', student.id) : null, DATA_RULES.heightRange);
        const bodyShape = cleanText(group ? collectField(group, 'body_shape', student.id) : null);

        const { pages, ...rest } = student;
        students.push({
            ...rest,
            tier: tierOf(student.id, context),
            age,
            height,
            body_shape: bodyShape,
            pages
        });
    }

    // 基底与 cache 的角色差异：基底滞后时提示，但不擅自补角色
    const ruleFilteredCacheIds = [...groups.entries()]
        .filter(([id, group]) => !isRuleExcluded(id, group[0].data))
        .map(([id]) => id);
    const baseIds = new Set(base.map(student => student.id));
    const missingInBase = ruleFilteredCacheIds.filter(id => !baseIds.has(id));
    if (missingInBase.length > 0) {
        warn(`cache 中有 ${missingInBase.length} 个角色不在上游 students.json 中，基底可能滞后：${missingInBase.join(', ')}`);
    }
    const extraInBase = [...baseIds].filter(id => !groups.has(id));
    if (extraInBase.length > 0) {
        warn(`上游 students.json 中有 ${extraInBase.length} 个角色不在 cache 中：${extraInBase.join(', ')}`);
    }

    const outputIds = new Set(students.map(student => student.id));
    const missingCurationIds = [...excludeIds, ...buckets.flatMap(([, ids]) => [...ids])].filter(id => !outputIds.has(id));

    let previous = null;
    try {
        previous = await readJson(outputFile);
    } catch {
        previous = null;
    }

    await writeFile(outputFile, `${JSON.stringify(students, null, 2)}\n`, 'utf8');

    const pages = students.reduce((sum, student) => sum + student.pages.length, 0);
    const emptyAvatars = students.flatMap(student =>
        student.pages.filter(page => !page.avatar).map(page => `${student.id}/${page.page_id}`)
    );
    const tierCount = (tier) => students.filter(student => student.tier === tier).length;
    const visibleCount = students.filter(
        student => student.tier === 'normal' && student.pages.some(page => page.avatar)
    ).length;
    const ageCount = students.filter(student => student.age !== null).length;
    const heightCount = students.filter(student => student.height !== null).length;

    console.log(`已生成 public/data/students.json`);
    console.log(`上游 crawler 版本：${crawlerVersion ?? '未知（未能读取 VERSION）'}`);
    console.log(`上游基底 ${base.length} 个角色，cache 归并为 ${groups.size} 个角色`);
    console.log(`排除：规则=${excluded.rule}、curation=${excluded.curation}`);
    console.log(
        `输出：${students.length} 个角色、${pages} 个页面，其中 mob ${tierCount('mob')} 个、other ${tierCount('other')} 个、nameonly ${tierCount('nameonly')} 个，默认可见 ${visibleCount} 个`
    );
    console.log(`age 有效 ${ageCount} 个，height 有效 ${heightCount} 个`);
    if (emptyAvatars.length > 0) {
        console.log(`空头像页面 ${emptyAvatars.length} 个：${emptyAvatars.join(', ')}`);
    }
    if (missingCurationIds.length > 0) {
        console.log(`curation 中未匹配到输出数据的 id：${missingCurationIds.join(', ')}`);
    }

    if (warnings.length > 0) {
        console.log(`\n告警 ${warnings.length} 条：`);
        for (const message of wantReport ? warnings : warnings.slice(0, 20)) console.log(`- ${message}`);
        if (!wantReport && warnings.length > 20) console.log(`- ...（共 ${warnings.length} 条，加 --report 查看全部）`);
    }

    if (wantDiff) {
        if (!previous) {
            console.log('\n没有上一版 students.json，跳过 diff。');
        } else {
            console.log(`\n${formatMarkdownDiff(previous, students)}`);
        }
    }
}

await main();
