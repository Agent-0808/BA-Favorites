import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { CONFIG } from './config';
import { Picker } from './core/picker';
import type { BaItem, BaSettings } from './core/types';
import { fetchJson, toItems, toSchoolOptions, type School, type Student } from './data/ba';
import { PickerView } from './ui/pickerView';
import { createSchoolFilter } from './ui/schoolFilter';

function byId<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`缺少页面元素 #${id}`);
    return element as T;
}

async function boot(): Promise<void> {
    const loading = byId('loading');
    const error = byId('error');

    try {
        const [students, schools] = await Promise.all([
            fetchJson<Student[]>(CONFIG.studentsUrl),
            fetchJson<School[]>(CONFIG.schoolsUrl).catch(() => [] as School[])
        ]);

        const items = toItems(students, schools);
        const schoolOptions = toSchoolOptions(students, schools);

        const picker = new Picker<BaItem, BaSettings>({
            items,
            localStorageKey: CONFIG.localStorageKey,
            historyLength: CONFIG.historyLength,
            defaultSettings: CONFIG.defaultSettings,
            shouldIncludeItem: (item, settings) => {
                if (settings.nonNpcOnly && item.isNpc) return false;
                if (settings.jpInstalledOnly && !item.isInstallJp) return false;
                const schoolIds = settings.schools ?? [];
                if (schoolIds.length > 0 && !schoolIds.includes(item.schoolId)) return false;
                return true;
            }
        });

        const nonNpcOnly = byId<HTMLInputElement>('nonNpcOnly');
        const jpInstalledOnly = byId<HTMLInputElement>('jpInstalledOnly');

        let view: PickerView;

        function applySettings(patch: Partial<BaSettings>): void {
            picker.setSettings({ ...picker.getSettings(), ...patch });
            view.update();
        }

        function syncControls(settings: BaSettings): void {
            nonNpcOnly.checked = Boolean(settings.nonNpcOnly);
            jpInstalledOnly.checked = Boolean(settings.jpInstalledOnly);
            filter.setSelected(settings.schools ?? []);
        }

        const filter = createSchoolFilter({
            root: byId('schoolFilter'),
            button: byId<HTMLButtonElement>('schoolFilterBtn'),
            dropdown: byId('schoolDropdown'),
            count: byId('schoolFilterCount'),
            schools: schoolOptions,
            selected: picker.getSettings().schools ?? [],
            onChange: schoolIds => applySettings({ schools: schoolIds })
        });

        nonNpcOnly.addEventListener('change', () => {
            applySettings({ nonNpcOnly: nonNpcOnly.checked });
        });

        jpInstalledOnly.addEventListener('change', () => {
            applySettings({ jpInstalledOnly: jpInstalledOnly.checked });
        });

        byId<HTMLButtonElement>('resetBtn').addEventListener('click', () => {
            if (!confirm('确定要清空所有进度并重新开始吗？')) return;
            picker.reset();
            syncControls(picker.getSettings());
            view.update();
        });

        view = new PickerView(picker, {
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

        syncControls(picker.getSettings());
        loading.hidden = true;
    } catch (err) {
        console.error(err);
        loading.hidden = true;
        error.hidden = false;
        error.textContent = `数据加载失败：${err instanceof Error ? err.message : String(err)}`;
    }
}

void boot();
