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
import { PickerView } from './ui/pickerView';
import { createStartScreen, type StartResult } from './ui/startScreen';

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
    favorites?: unknown;
    current?: unknown;
    survived?: unknown;
    evaluating?: unknown;
    settings?: Record<string, unknown>;
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
        studentSchools: [...(saved.studentSchools ?? defaults.studentSchools)],
        npcSchools: [...(saved.npcSchools ?? defaults.npcSchools)],
        serverScope: saved.serverScope ?? defaults.serverScope,
        batchSize: saved.batchSize ?? defaults.batchSize
    };
}

function getSaveSummary(splitSkins: boolean): string | null {
    const saved = readSavedState(splitSkins);
    if (!saved) return null;

    const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);
    const favorites = count(saved.favorites);
    const remaining = count(saved.current) + count(saved.survived) + count(saved.evaluating);
    return `上次进度：已选出 ${favorites} · 剩余 ${remaining} 项`;
}

function getBatchSize(currentSize: number, settings: BaSettings): number {
    if (settings.batchSize > 0) return settings.batchSize;
    return Math.max(
        2,
        settings.minBatchSize || 2,
        Math.min(settings.maxBatchSize || 20, Math.ceil(currentSize / 5))
    );
}

function scopeSummary(items: BaItem[], settings: BaSettings): string {
    const filtered = items.filter(item => matchesBaScope(item, settings));
    const students = filtered.filter(item => !item.isNpc).length;
    return `当前范围：学生 ${students} · NPC ${filtered.length - students} · 共 ${filtered.length} 项`;
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

            const picker = new Picker<BaItem, BaSettings>({
                items,
                localStorageKey: storageKey(result.splitSkins),
                historyLength: CONFIG.historyLength,
                defaultSettings: result.settings,
                getBatchSize,
                shouldIncludeItem: matchesBaScope
            });

            // 继续上次时，用开始页当前配置重新校验已有进度
            if (result.mode === 'continue') picker.setSettings(result.settings);

            const view = new PickerView(picker, {
                evaluating: byId('evaluating'),
                favorites: byId('favorites'),
                pickBtn: byId<HTMLButtonElement>('pickBtn'),
                passBtn: byId<HTMLButtonElement>('passBtn'),
                undoBtn: byId<HTMLButtonElement>('undoBtn'),
                redoBtn: byId<HTMLButtonElement>('redoBtn'),
                progressFill: byId('progressFill'),
                progressText: byId('progressText'),
                statFavorites: byId('statFavorites'),
                statRemaining: byId('statRemaining'),
                statEliminated: byId('statEliminated')
            });

            function updateScopeSummary(): void {
                byId('scopeSummary').textContent = scopeSummary(items, picker.getSettings());
            }

            byId<HTMLButtonElement>('resetBtn').addEventListener('click', () => {
                if (!confirm('确定要清空所有进度并重新开始吗？')) return;
                picker.reset();
                view.update();
                updateScopeSummary();
            });

            // 配置集中在开始页，返回时利用存档重新进入配置流程
            byId<HTMLButtonElement>('backBtn').addEventListener('click', () => location.reload());

            updateScopeSummary();
            startScreen.hide();
            byId('pickerScreen').hidden = false;
        }

        const startScreen = createStartScreen(byId('startScreen'), {
            buildScope,
            // 只有皮肤模式存在存档时，默认进入皮肤模式
            initialSplitSkins: !readSavedState(false) && Boolean(readSavedState(true)),
            initialSettings,
            getSaveSummary,
            onStart: openPicker
        });

        startScreen.show();
        loading.hidden = true;
    } catch (err) {
        console.error(err);
        loading.hidden = true;
        error.hidden = false;
        error.textContent = `数据加载失败：${err instanceof Error ? err.message : String(err)}`;
    }
}

void boot();
