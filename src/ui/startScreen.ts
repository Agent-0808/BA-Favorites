import type { BaItem, BaSettings, ServerScope } from '../core/types';
import { CONFIG } from '../config';
import { matchesBaScope, type SchoolGroups, type SchoolOption } from '../data/ba';

export type StartMode = 'fresh' | 'continue';

export interface StartResult {
  splitSkins: boolean;
  settings: BaSettings;
  mode: StartMode;
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
  getSaveSummary: (splitSkins: boolean) => string | null;
  onStart: (result: StartResult) => void;
}

export interface StartScreen {
  show: () => void;
  hide: () => void;
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
  const studentSchoolsEl = byId('studentSchools');
  const npcSchoolsEl = byId('npcSchools');
  const studentCount = byId('studentCount');
  const npcCount = byId('npcCount');
  const batchSize = byId<HTMLSelectElement>('batchSize');
  const startSummary = byId('startSummary');
  const startBtn = byId<HTMLButtonElement>('startBtn');
  const continueBtn = byId<HTMLButtonElement>('continueBtn');
  const restartBtn = byId<HTMLButtonElement>('restartBtn');
  const serverRadios = [...root.querySelectorAll<HTMLInputElement>('input[name="serverScope"]')];

  let draft: BaSettings = options.initialSettings(options.initialSplitSkins);
  let items: BaItem[] = [];
  let groups: SchoolGroups = { students: [], npcs: [] };

  for (const size of CONFIG.batchSizeOptions) {
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = size === 0 ? '自动' : `${size} 张`;
    batchSize.append(option);
  }

  function syncControls(): void {
    splitSkins.checked = draft.splitSkins;
    includeStudents.checked = draft.includeStudents;
    includeNpcs.checked = draft.includeNpcs;
    for (const radio of serverRadios) {
      radio.checked = radio.value === draft.serverScope;
    }
    const size = CONFIG.batchSizeOptions.includes(draft.batchSize) ? draft.batchSize : 0;
    draft.batchSize = size;
    batchSize.value = String(size);
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
    const students = filtered.filter(item => !item.isNpc).length;
    const npcs = filtered.length - students;
    itemCount.textContent = `当前将参与排序：${filtered.length} 项（学生 ${students} · NPC ${npcs}）`;

    const save = options.getSaveSummary(draft.splitSkins);
    startSummary.textContent = save ?? '';
    continueBtn.hidden = !save;
    restartBtn.hidden = !save;
    startBtn.hidden = Boolean(save);
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

  for (const radio of serverRadios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      draft.serverScope = radio.value as ServerScope;
      refresh();
    });
  }

  batchSize.addEventListener('change', () => {
    draft.batchSize = Number(batchSize.value) || 0;
  });

  function start(mode: StartMode): void {
    options.onStart({
      splitSkins: draft.splitSkins,
      settings: { ...draft, studentSchools: [...draft.studentSchools], npcSchools: [...draft.npcSchools] },
      mode
    });
  }

  startBtn.addEventListener('click', () => start('fresh'));
  continueBtn.addEventListener('click', () => start('continue'));
  restartBtn.addEventListener('click', () => start('fresh'));

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
