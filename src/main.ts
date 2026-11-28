import './styles/tokens.css';
import './styles/base.css';
import './styles/buttons.css';
import './styles/components.css';
import './styles/start.css';

import { BAClickFX } from 'ba-click-fx';
import { CLICK_FX_CONFIG, CONFIG } from './config';
import { Picker } from './core/picker';
import type { BaItem, BaSettings } from './core/types';
import { fetchJson, matchesBaScope, toItems, toSchoolGroups, type School, type SchoolGroups, type Student } from './data/ba';
import { setupAboutDialog } from './ui/aboutDialog';
import { ResultPage } from './ui/resultPage';
import { PickerView } from './ui/pickerView';
import { createStartScreen, type SaveSummary, type StartResult } from './ui/startScreen';

// 蔚蓝档案点击特效：暂无设置页，直接使用默认配置
if (CLICK_FX_CONFIG.enabled) {
    new BAClickFX({
        themeColor: CLICK_FX_CONFIG.themeColor,
        clickEnabled: CLICK_FX_CONFIG.clickEnabled,
        trailEnabled: CLICK_FX_CONFIG.trailEnabled,
        trailAlways: CLICK_FX_CONFIG.trailAlways,
        opacity: CLICK_FX_CONFIG.opacity,
        scale: CLICK_FX_CONFIG.scale
    });
}

function byId<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`缺少页面元素 #${id}`);
    return element as T;
}

/** 皮肤拆分模式使用独立存档，避免两种模式的进度互相干扰。 */
function storageKey(splitSkins: boolean): string {
    return splitSkins ? `${CONFIG.localStorageKey}:skins` : CONFIG.localStorageKey;
}

interface SavedStateLike {
    eliminated?: unknown;
    favorites?: unknown;
    current?: unknown;
    survived?: unknown;
    evaluating?: unknown;
    settings?: Record<string, unknown>;
    /** 最近一次写入存档的时间戳；旧存档可能没有。 */
    savedAt?: unknown;
}

function readSavedState(splitSkins: boolean): SavedStateLike | null {
    try {
        const raw = localStorage.getItem(storageKey(splitSkins));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === 'object' ? (parsed as SavedStateLike) : null;
    } catch {
        return null;
    }
}

function clearSavedState(splitSkins: boolean): void {
    try {
        localStorage.removeItem(storageKey(splitSkins));
    } catch {
        // localStorage 不可用时忽略
    }
}

/** 默认设置叠加指定模式下已保存的设置。 */
function initialSettings(splitSkins: boolean): BaSettings {
    const saved = (readSavedState(splitSkins)?.settings ?? {}) as Partial<BaSettings>;
    const defaults = CONFIG.defaultSettings;
    return {
        minBatchSize: saved.minBatchSize ?? defaults.minBatchSize,
        maxBatchSize: saved.maxBatchSize ?? defaults.maxBatchSize,
        splitSkins,
        includeStudents: saved.includeStudents ?? defaults.includeStudents,
        includeNpcs: saved.includeNpcs ?? defaults.includeNpcs,
        includeNpcStudents: saved.includeNpcStudents ?? defaults.includeNpcStudents,
        includeMobs: saved.includeMobs ?? defaults.includeMobs,
        includeOthers: saved.includeOthers ?? defaults.includeOthers,
        includeNameOnly: saved.includeNameOnly ?? defaults.includeNameOnly,
        studentSchools: [...(saved.studentSchools ?? defaults.studentSchools)],
        npcSchools: [...(saved.npcSchools ?? defaults.npcSchools)],
        serverScope: saved.serverScope ?? defaults.serverScope,
        // 旧存档里的 0 表示“自动”，现在统一视为默认上限
        batchSize: saved.batchSize || defaults.batchSize,
        fixedBatchSize: saved.fixedBatchSize ?? defaults.fixedBatchSize
    };
}

const SERVER_SCOPE_LABELS: Record<BaSettings['serverScope'], string> = {
    all: '不限',
    jp: '仅日服',
    global: '仅国际服',
    cn: '仅国服'
};

/** 把设置压缩成一行存档摘要，用于开始页的存档卡片。 */
function describeSettings(settings: BaSettings): string {
    const scope = (enabled: boolean, ids: number[], label: string): string => {
        if (!enabled) return `不含${label}`;
        return ids.length === 0 ? `${label}全部` : `${label} ${ids.length} 所`;
    };
    const cap = settings.batchSize > 0 ? settings.batchSize : settings.maxBatchSize || 20;
    return [
        SERVER_SCOPE_LABELS[settings.serverScope],
        scope(settings.includeStudents, settings.studentSchools, '学生'),
        scope(settings.includeNpcs, settings.npcSchools, 'NPC'),
        settings.includeNpcs && !settings.includeNpcStudents ? '不含NPC学生' : '',
        settings.includeMobs ? '含杂鱼' : '',
        settings.includeOthers ? '含其他' : '',
        settings.includeNameOnly ? '含只有名字' : '',
        settings.fixedBatchSize ? `每批固定 ${cap} 张` : `每批上限 ${cap}`
    ].filter(Boolean).join(' · ');
}

/** 距今多久；超过一周直接显示日期。 */
function formatRelativeTime(timestamp: number): string {
    const diff = Math.max(0, Date.now() - timestamp);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return '刚刚';
    if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
    if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
    return new Date(timestamp).toLocaleDateString('zh-CN');
}

function getSaveSummary(splitSkins: boolean): SaveSummary | null {
    const saved = readSavedState(splitSkins);
    if (!saved) return null;

    const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);
    const favorites = count(saved.favorites);
    const survived = count(saved.survived);
    const eliminated = count(saved.eliminated);

    // 只是打开过选择页、还没做任何取舍时不提示继续
    if (favorites === 0 && survived === 0 && eliminated === 0) return null;

    const settings = initialSettings(splitSkins);
    return {
        splitSkins,
        favorites,
        remaining: count(saved.current) + survived + count(saved.evaluating),
        eliminated,
        configText: describeSettings(settings),
        savedAtText: typeof saved.savedAt === 'number' ? formatRelativeTime(saved.savedAt) : '',
        settings
    };
}

/** 当前窗口下候选网格能排下的列数，用于让批次铺满整行。 */
function getColumnCount(): number {
    // 数值与 base.css 的 .app 宽度上限、body/.layout 内边距和瓦片尺寸保持一致
    const viewport = window.innerWidth;
    const compact = viewport <= 600;
    const tileWidth = compact ? 96 : 120;
    const gap = 14;
    // clientWidth 不含滚动条，避免出现滚动条时少算一列
    const appWidth = Math.min(1240, document.documentElement.clientWidth - (compact ? 16 : 30));
    const contentWidth = appWidth - (compact ? 28 : 48);
    return Math.max(1, Math.floor((contentWidth + gap) / (tileWidth + gap)));
}

/**
 * 每批数量：固定模式直接取设置值，否则随剩余人数收缩并以设置为上限；
 * 自动模式在够一行时向下取整到整行，避免 9+1 这类短行。
 */
function getBatchSize(currentSize: number, settings: BaSettings): number {
    const minSize = settings.minBatchSize || 2;
    const cap = settings.batchSize > 0 ? settings.batchSize : settings.maxBatchSize || 20;
    if (settings.fixedBatchSize) return Math.max(minSize, cap);

    let size = Math.max(minSize, Math.min(cap, Math.ceil(currentSize / CONFIG.batchDivisor)));
    const columns = getColumnCount();
    if (size >= columns) size = Math.floor(size / columns) * columns;
    return Math.max(minSize, size);
}

async function boot(): Promise<void> {
    const loading = byId('loading');
    const error = byId('error');

    try {
        const [students, schools] = await Promise.all([
            fetchJson<Student[]>(CONFIG.studentsUrl),
            fetchJson<School[]>(CONFIG.schoolsUrl).catch(() => [] as School[])
        ]);

        function buildScope(splitSkins: boolean): { items: BaItem[]; groups: SchoolGroups } {
            const items = toItems(students, schools, splitSkins);
            return { items, groups: toSchoolGroups(items, schools) };
        }

        function openPicker(result: StartResult): void {
            const { items } = buildScope(result.splitSkins);
            if (result.mode === 'fresh') clearSavedState(result.splitSkins);

            // 存档额外记录写入时间，供开始页显示“上次进度”有多久
            const key = storageKey(result.splitSkins);
            const picker = new Picker<BaItem, BaSettings>({
                items,
                localStorageKey: key,
                historyLength: CONFIG.historyLength,
                defaultSettings: result.settings,
                getBatchSize,
                shouldIncludeItem: matchesBaScope,
                saveState: (state) => {
                    try {
                        localStorage.setItem(key, JSON.stringify({ ...state, savedAt: Date.now() }));
                    } catch {
                        // localStorage 不可用时忽略
                    }
                }
            });

            // 继续上次时按开始页传入的存档配置恢复，避免表单修改改变已有进度
            if (result.mode === 'continue') picker.setSettings(result.settings);

            let view: PickerView;
            const resultPage = new ResultPage({
                screen: byId('resultScreen'),
                pickerScreen: byId('pickerScreen'),
                grid: byId('resultGrid'),
                count: byId('resultCount'),
                backBtn: byId<HTMLButtonElement>('backToPickerBtn')
            }, () => view.update());

            view = new PickerView(picker, {
                evaluating: byId('evaluating'),
                favorites: byId('favorites'),
                favoritesMeta: byId('favoritesMeta'),
                toggleFavoritesBtn: byId<HTMLButtonElement>('toggleFavoritesBtn'),
                resultBtn: byId<HTMLButtonElement>('resultBtn'),
                pickBtn: byId<HTMLButtonElement>('pickBtn'),
                passBtn: byId<HTMLButtonElement>('passBtn'),
                undoBtn: byId<HTMLButtonElement>('undoBtn'),
                redoBtn: byId<HTMLButtonElement>('redoBtn'),
                progressFill: byId('progressFill'),
                progressText: byId('progressText'),
                nextBatchSize: byId<HTMLSelectElement>('nextBatchSize'),
                statFavorites: byId('statFavorites'),
                statRemaining: byId('statRemaining'),
                statEliminated: byId('statEliminated')
            }, resultPage);

            byId<HTMLButtonElement>('resetBtn').addEventListener('click', () => {
                if (!confirm('确定要清空所有进度并重新开始吗？')) return;
                picker.reset();
                view.update();
            });

            // 配置集中在开始页，返回时利用存档重新进入配置流程
            byId<HTMLButtonElement>('backBtn').addEventListener('click', () => location.reload());

            startScreen.hide();
            byId('pickerScreen').hidden = false;
            // 初始渲染发生在选择页隐藏时，显示后重绘一次，让长名称按实际宽度缩小字号
            view.update();
        }

        const startScreen = createStartScreen(byId('startScreen'), {
            buildScope,
            // 只有皮肤模式存在存档时，默认进入皮肤模式
            initialSplitSkins: !readSavedState(false) && Boolean(readSavedState(true)),
            initialSettings,
            getSaveSummary,
            onDeleteSave: (splitSkins) => clearSavedState(splitSkins),
            onStart: openPicker
        });

        startScreen.show();
        loading.hidden = true;

        // 调试预览：?debug_preview=9 直接展示等距抽样的结果页，不创建 picker，也不读写存档
        const previewCount = Math.floor(Number(new URLSearchParams(location.search).get('debug_preview')));
        if (Number.isFinite(previewCount) && previewCount > 0) {
            const { items: allItems } = buildScope(false);
            const count = Math.min(previewCount, allItems.length);
            if (count === 0) return;

            const step = allItems.length / count;
            const sample = Array.from({ length: count }, (_, index) => allItems[Math.floor(index * step)]);

            const preview = new ResultPage({
                screen: byId('resultScreen'),
                pickerScreen: byId('startScreen'),
                grid: byId('resultGrid'),
                count: byId('resultCount'),
                backBtn: byId<HTMLButtonElement>('backToPickerBtn')
            }, () => startScreen.show(), '返回设置');

            startScreen.hide();
            preview.open(sample);
        }
    } catch (err) {
        console.error(err);
        loading.hidden = true;
        error.hidden = false;
        error.textContent = `数据加载失败：${err instanceof Error ? err.message : String(err)}`;
    }
}

setupAboutDialog();
void boot();
