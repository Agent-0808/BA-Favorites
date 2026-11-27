import type { BaItem, BaSettings, ServerScope } from '../core/types';
import { CONFIG } from '../config';
import { matchesBaScope, type SchoolGroups, type SchoolOption } from '../data/ba';
import { getSchoolColor } from '../utils/schoolColors';

export type StartMode = 'fresh' | 'continue';

export interface StartResult {
  splitSkins: boolean;
  settings: BaSettings;
  mode: StartMode;
}

/** 开始页展示的存档摘要。 */
export interface SaveSummary {
  splitSkins: boolean;
  favorites: number;
  remaining: number;
  eliminated: number;
  /** 存档配置的一行描述。 */
  configText: string;
  /** 相对时间；旧存档没有时间戳时为空。 */
  savedAtText: string;
  /** 合并默认值后的完整设置，继续时按它恢复。 */
  settings: BaSettings;
}

/** 开始页依赖的数据与回调，由 main 提供。 */
export interface StartScreenOptions {
  /** 按是否拆分皮肤构建 items 与学校分组。 */
  buildScope: (splitSkins: boolean) => { items: BaItem[]; groups: SchoolGroups };
  /** 初始是否开启皮肤拆分。 */
  initialSplitSkins: boolean;
  /** 读取指定模式下的初始设置（默认值 + 已保存设置）。 */
  initialSettings: (splitSkins: boolean) => BaSettings;
  /** 返回指定模式下的存档摘要；没有存档时返回 null。 */
  getSaveSummary: (splitSkins: boolean) => SaveSummary | null;
  /** 删除指定模式的存档。 */
  onDeleteSave: (splitSkins: boolean) => void;
  onStart: (result: StartResult) => void;
}

export interface StartScreen {
  show: () => void;
  hide: () => void;
}

function cloneSettings(settings: BaSettings): BaSettings {
  return {
    ...settings,
    studentSchools: [...settings.studentSchools],
    npcSchools: [...settings.npcSchools]
  };
}

function sameIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a);
  return b.every(id => ids.has(id));
}

/** 表单里的可编辑配置是否与存档配置不同。 */
function settingsDiffer(draft: BaSettings, saved: BaSettings): boolean {
  return (
    draft.splitSkins !== saved.splitSkins ||
    draft.includeStudents !== saved.includeStudents ||
    draft.includeNpcs !== saved.includeNpcs ||
    draft.serverScope !== saved.serverScope ||
    !sameIds(draft.studentSchools, saved.studentSchools) ||
    !sameIds(draft.npcSchools, saved.npcSchools)
  );
}

/** 创建开始页：角色范围配置、存档选择与开始按钮。 */
export function createStartScreen(root: HTMLElement, options: StartScreenOptions): StartScreen {
  function byId<T extends HTMLElement>(id: string): T {
    const element = root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`缺少开始页元素 #${id}`);
    return element;
  }

  const splitSkins = byId<HTMLInputElement>('splitSkins');
  const itemCount = byId('itemCount');
  const includeStudents = byId<HTMLInputElement>('includeStudents');
  const includeNpcs = byId<HTMLInputElement>('includeNpcs');
  const clearStudentSchools = byId<HTMLButtonElement>('clearStudentSchools');
  const clearNpcSchools = byId<HTMLButtonElement>('clearNpcSchools');
  const studentSchoolsEl = byId('studentSchools');
  const npcSchoolsEl = byId('npcSchools');
  const studentCount = byId('studentCount');
  const npcCount = byId('npcCount');
  const batchSize = byId<HTMLSelectElement>('batchSize');
  const fixedBatchSize = byId<HTMLInputElement>('fixedBatchSize');
  const batchHint = byId('batchHint');
  const savePanel = byId('savePanel');
  const saveMode = byId('saveMode');
  const saveTime = byId('saveTime');
  const saveFavorites = byId('saveFavorites');
  const saveRemaining = byId('saveRemaining');
  const saveEliminated = byId('saveEliminated');
  const saveConfig = byId('saveConfig');
  const saveDiff = byId('saveDiff');
  const restoreSaveBtn = byId<HTMLButtonElement>('restoreSaveBtn');
  const saveOther = byId('saveOther');
  const saveOtherMode = byId('saveOtherMode');
  const switchModeBtn = byId<HTMLButtonElement>('switchModeBtn');
  const startBtn = byId<HTMLButtonElement>('startBtn');
  const continueBtn = byId<HTMLButtonElement>('continueBtn');
  const deleteSaveBtn = byId<HTMLButtonElement>('deleteSaveBtn');
  const serverRadios = [...root.querySelectorAll<HTMLInputElement>('input[name="serverScope"]')];

  let draft: BaSettings = options.initialSettings(options.initialSplitSkins);
  let items: BaItem[] = [];
  let groups: SchoolGroups = { students: [], npcs: [] };
  let currentSave: SaveSummary | null = null;

  for (const size of CONFIG.batchSizeOptions) {
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = `${size} 张`;
    batchSize.append(option);
  }

  function updateBatchHint(): void {
    batchHint.textContent = draft.fixedBatchSize
      ? `每批固定 ${draft.batchSize} 张，不随剩余人数收缩`
      : `按剩余人数自动收缩，最多 ${draft.batchSize} 张`;
  }

  function syncControls(): void {
    splitSkins.checked = draft.splitSkins;
    includeStudents.checked = draft.includeStudents;
    includeNpcs.checked = draft.includeNpcs;
    for (const radio of serverRadios) {
      radio.checked = radio.value === draft.serverScope;
    }
    const size = CONFIG.batchSizeOptions.includes(draft.batchSize)
      ? draft.batchSize
      : CONFIG.defaultSettings.batchSize;
    draft.batchSize = size;
    batchSize.value = String(size);
    fixedBatchSize.checked = draft.fixedBatchSize;
    updateBatchHint();
  }

  function renderChips(
    container: HTMLElement,
    schools: SchoolOption[],
    getSelected: () => number[],
    disabled: boolean,
    onChange: (ids: number[]) => void
  ): void {
    container.innerHTML = '';
    container.classList.toggle('is-disabled', disabled);

    if (schools.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'start-hint';
      empty.textContent = '暂无学校';
      container.append(empty);
      return;
    }

    for (const school of schools) {
      const chip = document.createElement('label');
      chip.className = 'school-chip';

      // 学校配色由 schoolColors.ts 提供，写入 CSS 变量供样式使用
      const color = getSchoolColor(school.id);
      chip.style.setProperty('--school-bg', color.bg);
      chip.style.setProperty('--school-text', color.text);

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = String(school.id);
      input.checked = getSelected().includes(school.id);
      input.addEventListener('change', () => {
        // 每次都读取最新选择，避免闭包持有旧数组
        const ids = new Set(getSelected());
        if (input.checked) ids.add(school.id);
        else ids.delete(school.id);
        onChange([...ids]);
      });
      chip.append(input);

      if (school.logo) {
        const logo = document.createElement('img');
        logo.src = school.logo;
        logo.alt = '';
        logo.loading = 'lazy';
        chip.append(logo);
      }

      const name = document.createElement('span');
      name.textContent = school.name;
      chip.append(name);

      container.append(chip);
    }
  }

  function refresh(): void {
    const filtered = items.filter(item => matchesBaScope(item, draft));
    itemCount.textContent = String(filtered.length);

    const save = options.getSaveSummary(draft.splitSkins);
    currentSave = save;
    savePanel.hidden = !save;
    if (save) {
      const differs = settingsDiffer(draft, save.settings);
      saveMode.textContent = save.splitSkins ? '皮肤拆分' : '普通';
      saveTime.textContent = save.savedAtText;
      saveFavorites.textContent = String(save.favorites);
      saveRemaining.textContent = String(save.remaining);
      saveEliminated.textContent = String(save.eliminated);
      saveConfig.textContent = save.configText;
      saveDiff.hidden = !differs;
      // 配置不一致时禁止直接继续，避免悄悄丢弃当前表单修改
      continueBtn.disabled = differs;
    }

    // 另一模式也有存档时给出入口，避免切换勾选后误以为存档消失
    const other = options.getSaveSummary(!draft.splitSkins);
    saveOther.hidden = !other;
    if (other) {
      saveOtherMode.textContent = other.splitSkins ? '皮肤拆分' : '普通';
    }
  }

  function rebuild(): void {
    const scope = options.buildScope(draft.splitSkins);
    items = scope.items;
    groups = scope.groups;

    // 重新计算学校集合后，丢弃已经不存在的选择
    draft.studentSchools = draft.studentSchools.filter(id => groups.students.some(school => school.id === id));
    draft.npcSchools = draft.npcSchools.filter(id => groups.npcs.some(school => school.id === id));

    studentCount.textContent = `${groups.students.length} 所学校`;
    npcCount.textContent = `${groups.npcs.length} 所学校`;

    renderChips(studentSchoolsEl, groups.students, () => draft.studentSchools, !draft.includeStudents, ids => {
      draft.studentSchools = ids;
      refresh();
    });
    renderChips(npcSchoolsEl, groups.npcs, () => draft.npcSchools, !draft.includeNpcs, ids => {
      draft.npcSchools = ids;
      refresh();
    });

    refresh();
  }

  splitSkins.addEventListener('change', () => {
    // 切换模式只重建学校与计数，保留当前已选范围
    draft.splitSkins = splitSkins.checked;
    syncControls();
    rebuild();
  });

  includeStudents.addEventListener('change', () => {
    draft.includeStudents = includeStudents.checked;
    rebuild();
  });

  includeNpcs.addEventListener('change', () => {
    draft.includeNpcs = includeNpcs.checked;
    rebuild();
  });

  // 只清空学校勾选，不改动学生 / NPC 的总开关
  clearStudentSchools.addEventListener('click', () => {
    draft.studentSchools = [];
    rebuild();
  });

  clearNpcSchools.addEventListener('click', () => {
    draft.npcSchools = [];
    rebuild();
  });

  for (const radio of serverRadios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      draft.serverScope = radio.value as ServerScope;
      refresh();
    });
  }

  batchSize.addEventListener('change', () => {
    draft.batchSize = Number(batchSize.value) || CONFIG.defaultSettings.batchSize;
    updateBatchHint();
    refresh();
  });

  fixedBatchSize.addEventListener('change', () => {
    draft.fixedBatchSize = fixedBatchSize.checked;
    updateBatchHint();
    refresh();
  });

  startBtn.addEventListener('click', () => {
    if (currentSave && !confirm('开始排序会覆盖当前模式的上次进度，确定继续吗？')) return;
    options.onStart({
      splitSkins: draft.splitSkins,
      settings: cloneSettings(draft),
      mode: 'fresh'
    });
  });

  continueBtn.addEventListener('click', () => {
    if (!currentSave) return;
    // 继续时按存档配置恢复，避免表单修改意外改变已有进度；
    // 批大小不影响已有进度，改用表单里的当前值
    options.onStart({
      splitSkins: currentSave.splitSkins,
      settings: {
        ...cloneSettings(currentSave.settings),
        batchSize: draft.batchSize,
        fixedBatchSize: draft.fixedBatchSize
      },
      mode: 'continue'
    });
  });

  deleteSaveBtn.addEventListener('click', () => {
    if (!confirm('确定删除当前模式的上次进度吗？删除后无法恢复。')) return;
    options.onDeleteSave(draft.splitSkins);
    refresh();
  });

  restoreSaveBtn.addEventListener('click', () => {
    draft = options.initialSettings(draft.splitSkins);
    syncControls();
    rebuild();
  });

  switchModeBtn.addEventListener('click', () => {
    // 直接载入另一模式的存档配置并切换
    draft = options.initialSettings(!draft.splitSkins);
    splitSkins.checked = draft.splitSkins;
    syncControls();
    rebuild();
  });

  syncControls();
  rebuild();

  return {
    show: () => {
      root.hidden = false;
    },
    hide: () => {
      root.hidden = true;
    }
  };
}
