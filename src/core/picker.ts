import type {
    EliminatedItem,
    PickerItem,
    PickerOptions,
    PickerSettings,
    PickerStateSnapshot
} from './types';

/** PickerState 内部的各数组。 */
interface PickerStateArrays {
    eliminated: EliminatedItem[];
    survived: string[];
    current: string[];
    evaluating: string[];
    favorites: string[];
}

/** PickerState 的构造选项；数组元素统一为 item id。 */
interface PickerStateOptions<S extends PickerSettings> {
    items: string[];
    defaultSettings?: Partial<S>;
    getBatchSize?: (currentSize: number, settings: S) => number;
    shouldIncludeItem?: (identifier: string, settings: S) => boolean;
    getFilteredItems?: (settings: S) => string[];
}

/** 补齐默认值后的 Picker 选项。 */
interface ResolvedPickerOptions<T extends PickerItem, S extends PickerSettings> extends PickerOptions<T, S> {
    historyLength: number;
    defaultSettings: Partial<S>;
}

/* PICKER STATE 对象 */

export class PickerState<S extends PickerSettings = PickerSettings> {
    options: PickerStateOptions<S>;
    settings: S;
    items: string[] = [];
    arrays: PickerStateArrays = {
        eliminated: [],
        survived: [],
        current: [],
        evaluating: [],
        favorites: []
    };
    batchSize = 0;
    /** 仅作用于下一批的临时数量，不写入存档。 */
    private nextBatchSize: number | null = null;
    missingItems?: string[];
    extraItems?: string[];

    constructor(options: PickerStateOptions<S>) {
        this.options = options;
        this.settings = (options.defaultSettings ?? {}) as S;
    }

    /* 初始化与序列化 */

    getState(): PickerStateSnapshot<S> {
        /**
         * 返回与当前 PickerState 对应的脱水状态。
         * 这里使用深拷贝，否则 eliminatedBy 数组可能被后续操作修改，
         * 导致撤销/重做时状态损坏。
         */
        return {
            eliminated: this.arrays.eliminated.map((entry) => ({
                id: entry.id,
                eliminatedBy: [...entry.eliminatedBy]
            })),
            survived: [...this.arrays.survived],
            current: [...this.arrays.current],
            evaluating: [...this.arrays.evaluating],
            favorites: [...this.arrays.favorites],
            settings: deepCopy(this.settings) as S
        };
    }

    initialize(settings?: S | Partial<S>): void {
        /**
         * 按给定设置（未提供时使用默认设置）初始化 PickerState。
         */
        this.settings = (settings ?? this.options.defaultSettings ?? {}) as S;
        this.items = this.getFilteredItems();
        this.nextBatchSize = null;

        this.arrays = {
            eliminated: [],
            survived: [],
            current: this.items.slice(0),
            evaluating: [],
            favorites: []
        };
        this.batchSize = this.getBatchSize(this.arrays.current.length);

        shuffle(this.arrays.current);

        this.nextBatch();
    }

    restoreState(state: PickerStateSnapshot<S>): void {
        /**
         * 将 PickerState 设置为给定的脱水状态。
         */
        this.settings = mergeSettings(this.options.defaultSettings, state.settings);

        this.items = this.getFilteredItems();
        // 撤销/恢复后不保留一次性的批次覆盖
        this.nextBatchSize = null;

        this.arrays = {
            eliminated: state.eliminated.map((entry) => ({
                id: entry.id,
                eliminatedBy: [...entry.eliminatedBy]
            })),
            survived: [...state.survived],
            current: [...state.current],
            evaluating: [...state.evaluating],
            favorites: [...state.favorites]
        };
        this.batchSize = this.arrays.evaluating.length;

        this.validate();
    }

    reset(): void {
        /**
         * 将 PickerState 恢复为初始状态（设置保持不变）。
         */
        this.initialize(this.settings);
    }

    /* 公开设置器 */

    setSettings(settings: S): void {
        /**
         * 设置设置项。
         */
        this.settings = settings;
        this.items = this.getFilteredItems();
        this.nextBatchSize = null;

        this.validate();
        this.resetBatchSize();
    }

    setNextBatchSize(size: number | null): void {
        /**
         * 指定下一批的固定数量；只生效一次，不进入存档。
         */
        this.nextBatchSize = size;
    }

    getNextBatchSize(): number | null {
        /** 返回尚未生效的下一批覆盖值。 */
        return this.nextBatchSize;
    }

    setFavorites(favorites: string[]): void {
        /**
         * 用给定的收藏列表覆盖当前收藏列表。
         * 由于随后会执行 validate，即使实际内容被修正也没有问题。
         */
        this.arrays.favorites = favorites;
        this.validate();
    }

    /* 状态工具函数 */

    private shouldIncludeItem(identifier: string, settings: S): boolean {
        /**
         * 根据当前设置判断该 item 是否应包含在 picker 中。
         */
        const { getFilteredItems, shouldIncludeItem } = this.options;
        if (getFilteredItems) {
            return getFilteredItems(settings).includes(identifier);
        }
        if (shouldIncludeItem) {
            return shouldIncludeItem(identifier, settings);
        }
        return true;
    }

    getFilteredItems(): string[] {
        /**
         * 返回符合当前设置的 item id 列表。
         */
        const { getFilteredItems, items } = this.options;
        if (getFilteredItems) {
            return getFilteredItems(this.settings);
        }
        const result: string[] = [];
        for (const identifier of items) {
            if (this.shouldIncludeItem(identifier, this.settings)) {
                result.push(identifier);
            }
        }
        return result;
    }

    getBatchSize(currentSize: number): number {
        /**
         * 返回整轮共有 currentSize 项时，单次理想展示的项数。
         */
        const { getBatchSize } = this.options;
        if (getBatchSize) {
            return getBatchSize(currentSize, this.settings);
        }
        return Math.max(
            2,
            this.settings.minBatchSize || 2,
            Math.min(this.settings.maxBatchSize || 20, Math.ceil(currentSize / 5))
        );
    }

    resetBatchSize(): void {
        /**
         * 根据 current 与 survived 的规模重算批次大小，并同步调整 evaluating。
         */
        this.arrays.current.unshift(...this.arrays.evaluating);
        this.arrays.evaluating = this.arrays.current.splice(
            0,
            this.getBatchSize(this.arrays.current.length + this.arrays.survived.length)
        );
        this.batchSize = this.arrays.evaluating.length;
    }

    /* 状态校验 */

    validate(): void {
        /**
         * 校验并修正状态。
         */
        const expectedItems = this.getFilteredItems();

        const missingItems: string[] = [];
        const extraItems: string[] = [];
        const { survived, eliminated, evaluating, current, favorites } = this.arrays;
        const arrays: Array<Array<string | EliminatedItem>> = [favorites, survived, eliminated, current, evaluating];

        const verifyObject: Record<string, boolean> = {};

        for (const identifier of expectedItems) {
            verifyObject[identifier] = false;
        }

        // 逐个数组检查每一项，并：
        // - 修正错误
        // - 在 verify 对象中标记该项
        // - 通过标记检查每项是否只出现一次
        // - 移除不该出现的多余项
        // 反向遍历，这样 splice 不会影响尚未处理的部分。
        for (const array of arrays) {
            for (let j = array.length - 1; j >= 0; j--) {
                const entry = array[j];
                const identifier = typeof entry === 'string' ? entry : entry.id;
                if (identifier in verifyObject) {
                    // 这是预期内的 item
                    if (verifyObject[identifier]) {
                        // 已经找到过该 item，说明是重复项：
                        // 从当前数组移除，并恢复可能被它淘汰的 item。
                        array.splice(j, 1);
                        this.removeFromEliminated(identifier);
                    }
                    verifyObject[identifier] = true;
                } else {
                    // 这是预期外的 item，需要移除
                    array.splice(j, 1);
                    extraItems.push(identifier);
                }
            }
        }
        // 确保没有 item 淘汰自己；修复淘汰者出现后仍未正确归位的情况，
        // 并清理 eliminated 中的无关项。
        // 两个数组都反向遍历，避免 splice 打乱后续索引。
        for (let i = eliminated.length - 1; i >= 0; i--) {
            for (let j = eliminated[i].eliminatedBy.length - 1; j >= 0; j--) {
                if (eliminated[i].id === eliminated[i].eliminatedBy[j]) {
                    this.removeEliminatedBy(i, j);
                }
                if (
                    favorites.includes(eliminated[i].eliminatedBy[j]) ||
                    extraItems.includes(eliminated[i].eliminatedBy[j])
                ) {
                    this.removeEliminatedBy(i, j);
                }
            }
        }

        // 补回应该有、但不在任何数组中的 item
        for (const identifier of Object.keys(verifyObject)) {
            if (!verifyObject[identifier]) {
                missingItems.push(identifier);
                current.push(identifier);
            }
        }

        // 保存新增的缺失项，便于之后提示用户
        if (missingItems.length > 0) {
            this.missingItems = missingItems;
            // 打乱 current：刚补入的项不应全部堆在轮次末尾
            shuffle(current);
        }
        this.extraItems = extraItems;

        if (current.length === 0 && evaluating.length === 0 && survived.length > 0) {
            this.nextRound();
            return;
        }

        if (evaluating.length < 2) {
            // 给出应有的评估批次
            this.resetBatchSize();
        } else {
            this.batchSize = evaluating.length;
        }
    }

    /* 核心淘汰逻辑 */

    pick(picked: string[]): void {
        /**
         * 从当前 evaluating 批次中选出给定 items，被选的进入 survived，
         * 其余进入 eliminated（淘汰者即被选中的 items）。
         */
        const { evaluating, survived, eliminated } = this.arrays;

        for (let i = 0; i < evaluating.length; i++) {
            if (picked.length === 0 || indexOfIdentifier(evaluating[i], picked) !== -1) {
                // 被选中的 item 进入 survived
                survived.push(evaluating[i]);
            } else {
                // 未被选中，进入 eliminated，淘汰者为被选中的 items
                eliminated.push({ id: evaluating[i], eliminatedBy: picked.slice(0) });
            }
        }
        this.arrays.evaluating = [];
        this.nextBatch();
    }

    pass(): void {
        /**
         * 跳过当前批次，等同于全部选中。
         */
        this.pick(this.arrays.evaluating);
    }

    removeEliminatedBy(i: number, j: number): void {
        /**
         * 移除 eliminated 中第 i 项的 eliminatedBy 第 j 个淘汰者；
         * 若 eliminatedBy 因此为空，则把该项恢复到 survived。
         *
         * 该操作原地修改数组；若在循环中调用，循环必须反向遍历两个数组。
         */
        const { eliminated } = this.arrays;

        eliminated[i].eliminatedBy.splice(j, 1);
        if (eliminated[i].eliminatedBy.length === 0) {
            this.arrays.survived.push(eliminated.splice(i, 1)[0].id);
        }
    }

    removeFromEliminated(item: string): void {
        /**
         * 将给定 item 从所有 eliminatedBy 列表中移除，
         * 并把 eliminatedBy 变空的项恢复到 survived。
         */
        const { eliminated } = this.arrays;

        // 找出被该 item 淘汰的项
        for (let i = eliminated.length - 1; i >= 0; i--) {
            const idx = indexOfIdentifier(item, eliminated[i].eliminatedBy);
            if (idx !== -1) {
                // 该项被给定 item（部分）淘汰，移除它
                this.removeEliminatedBy(i, idx);
            }
        }
    }

    addToFavorites(item: string): void {
        /**
         * 将给定 item（id）加入收藏，并把被它淘汰的项恢复到 survived。
         */
        this.arrays.favorites.push(item);
        this.removeFromEliminated(item);
    }

    nextBatch(): void {
        /**
         * 进入下一批，必要时进入下一轮并维护收藏。
         */
        const { current } = this.arrays;
        // 一次性覆盖优先，否则使用本轮计算出的批次大小
        const size = this.nextBatchSize ?? this.batchSize;

        if (current.length < size && this.arrays.survived.length > 0) {
            // 开始下一轮
            this.nextRound();
            return;
        }
        this.nextBatchSize = null;
        this.arrays.evaluating = current.splice(0, size);
    }

    nextRound(): void {
        /**
         * 进入下一轮，将 survived 打乱后放回 current。
         */
        // survived 只剩一项时，它就是下一个收藏：
        // 加入收藏后用新的 survivors 开始下一轮。
        if (this.arrays.current.length === 0 && this.arrays.survived.length === 1) {
            const favorite = this.arrays.survived.pop();
            if (favorite !== undefined) {
                this.addToFavorites(favorite);
            }
            this.nextRound();
            return;
        }
        shuffle(this.arrays.survived);
        // 把 survivors 放到 current 末尾
        this.arrays.current = this.arrays.current.concat(
            this.arrays.survived.splice(0, this.arrays.survived.length)
        );
        // 为新轮次选一个合适的批次大小，然后展示下一批
        this.batchSize = this.getBatchSize(this.arrays.current.length);
        this.nextBatch();
    }
}

/* PICKER 对象 */

export class Picker<T extends PickerItem = PickerItem, S extends PickerSettings = PickerSettings> {
    private readonly itemMap: Record<string, T> = {};
    private readonly options: ResolvedPickerOptions<T, S>;
    private readonly state: PickerState<S>;
    private readonly history: Array<PickerStateSnapshot<S>> = [];
    private historyPos = -1;
    private initialFavorites: string[] = [];

    constructor(options: PickerOptions<T, S>) {
        if (!options.items) {
            console.error('No items specified for picker.');
            throw new Error('Picker requires an items array.');
        }

        // 构建 itemMap 并检查错误
        for (const item of options.items) {
            if (typeof item.id !== 'string') {
                console.error(
                    "You have an item without an ID! An ID is necessary for the picker's functionality to work.",
                    item
                );
                throw new Error('Picker items must have a string id.');
            }
            if (Object.prototype.hasOwnProperty.call(this.itemMap, item.id)) {
                console.error(
                    `You have more than one item with the same ID (${item.id})! Please ensure the IDs of your items are unique.`
                );
                throw new Error(`Duplicate item id: ${item.id}`);
            }
            this.itemMap[item.id] = item;
        }

        const defaultSettings = deepCopy(options.defaultSettings ?? {}) as Partial<S>;
        this.options = {
            ...options,
            historyLength: options.historyLength ?? 3,
            defaultSettings
        };

        /* PICKER 初始化 */

        const shouldIncludeItem = options.shouldIncludeItem;
        const pickerStateOptions: PickerStateOptions<S> = {
            items: options.items.map((item) => item.id),
            getBatchSize: options.getBatchSize,
            shouldIncludeItem: shouldIncludeItem
                ? (identifier, settings) => {
                    const item = this.itemMap[identifier];
                    return item !== undefined && shouldIncludeItem(item, settings);
                }
                : undefined,
            getFilteredItems: options.getFilteredItems,
            defaultSettings
        };

        let savedState = this.loadState();

        // 若有 modifyState，则修正读到的状态……
        if (savedState !== undefined && options.modifyState) {
            savedState = options.modifyState(savedState);
        }
        // ……但若最终结果不是合法状态，则丢弃它
        if (savedState !== undefined && !isStateSnapshot<S>(savedState)) {
            console.warn('Ignoring invalid saved state');
            savedState = undefined;
        }

        this.state = new PickerState<S>(pickerStateOptions);

        if (savedState !== undefined) {
            this.state.restoreState(savedState);
            options.onLoadState?.(this.state.missingItems ?? [], this.state.extraItems ?? []);
        } else {
            this.state.initialize(defaultSettings);
        }
        this.pushHistory();
    }

    /* 读取 */

    private getArray(name: 'favorites' | 'evaluating' | 'survived' | 'current'): T[] {
        /**
         * 获取状态中给定数组对应的完整 item 列表。
         */
        return this.mapItems(this.state.arrays[name]);
    }

    getFavorites(): T[] {
        /**
         * 获取当前收藏列表。
         */
        return this.getArray('favorites');
    }

    getEvaluating(): T[] {
        /**
         * 获取当前评估中的列表。
         */
        return this.getArray('evaluating');
    }

    getSettings(): S {
        /**
         * 获取状态当前的设置。
         */
        return this.state.settings;
    }

    getState(): PickerStateSnapshot<S> {
        /**
         * 获取当前状态的脱水快照（深拷贝，可安全交给 UI 持有）。
         */
        return this.state.getState();
    }

    /* 历史记录 */

    private pushHistory(): void {
        /**
         * 把当前状态加入历史数组。
         */
        this.history.splice(this.historyPos + 1, this.history.length, this.state.getState());
        if (this.history.length > this.options.historyLength + 1) {
            this.history.shift();
        }
        this.historyPos = this.history.length - 1;
        this.saveState();
    }

    canUndo(): boolean {
        /**
         * 是否可以撤销。
         */
        return this.historyPos > 0;
    }

    canRedo(): boolean {
        /**
         * 是否可以重做。
         */
        return this.historyPos < this.history.length - 1;
    }

    undo(): void {
        /**
         * 回退到历史中的上一个状态。
         */
        if (!this.canUndo()) {
            return;
        }
        const snapshot = this.history[--this.historyPos];
        this.state.restoreState(snapshot);
        this.saveState();
    }

    redo(): void {
        /**
         * 前进到历史中的下一个状态。
         */
        if (!this.canRedo()) {
            return;
        }
        const snapshot = this.history[++this.historyPos];
        this.state.restoreState(snapshot);
        this.saveState();
    }

    /* 状态持久化 */

    saveState(): void {
        /**
         * 将当前状态保存到 localStorage（若可用）。
         */
        const save = this.options.saveState;
        if (save) {
            save.call(this, this.state.getState());
            return;
        }
        if (typeof localStorage !== 'undefined' && this.options.localStorageKey) {
            localStorage.setItem(this.options.localStorageKey, JSON.stringify(this.state.getState()));
        }
    }

    loadState(): PickerStateSnapshot<S> | undefined {
        /**
         * 返回 localStorage 中保存的状态（若有）。
         */
        const load = this.options.loadState;
        if (load) {
            return load.call(this);
        }
        if (typeof localStorage === 'undefined' || !this.options.localStorageKey) {
            return undefined;
        }

        const raw = localStorage.getItem(this.options.localStorageKey);
        if (raw === null) {
            return undefined;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return undefined;
        }
        if (!isStateSnapshot<S>(parsed)) {
            return undefined;
        }
        // 深拷贝并补齐缺失的 settings，避免 UI 拿到后续会被修改的数组
        return {
            eliminated: parsed.eliminated.map((entry) => ({
                id: entry.id,
                eliminatedBy: [...entry.eliminatedBy]
            })),
            survived: [...parsed.survived],
            current: [...parsed.current],
            evaluating: [...parsed.evaluating],
            favorites: [...parsed.favorites],
            settings: deepCopy(parsed.settings ?? {}) as S
        };
    }

    isUntouched(): boolean {
        /**
         * 状态是否未被改动（完全干净，或只有与初始收藏一致的收藏）。
         */
        const arrays = this.state.arrays;
        const initialFavorites = this.initialFavorites;

        // eliminated/survived 中有内容即视为已改动
        if (arrays.eliminated.length > 0 || arrays.survived.length > 0) {
            return false;
        }

        // eliminated/survived 为空且没有收藏，视为未改动
        if (arrays.favorites.length === 0) {
            return true;
        }

        // 有收藏但 eliminated/survived 为空：判断收藏是否与初始收藏一致
        if (arrays.favorites.length !== initialFavorites.length) {
            return false;
        }
        for (let i = 0; i < arrays.favorites.length; i++) {
            if (initialFavorites[i] !== arrays.favorites[i]) {
                return false;
            }
        }
        return true;
    }

    hasItems(): boolean {
        /**
         * picker 是否有任何 item（过滤后）。
         */
        return this.state.items.length > 0;
    }

    /* 行为 */

    pick(ids: string[]): void {
        this.state.pick(ids);
        this.pushHistory();
    }

    pass(): void {
        this.state.pass();
        this.pushHistory();
    }

    reset(): void {
        this.state.reset();
        this.pushHistory();
    }

    setSettings(settings: S): void {
        this.state.setSettings(settings);
        this.pushHistory();
    }

    setNextBatchSize(size: number | null): void {
        /**
         * 指定下一批的固定数量，只生效一次，不影响已展示的批次。
         */
        this.state.setNextBatchSize(size);
    }

    getNextBatchSize(): number | null {
        /** 返回尚未生效的下一批覆盖值。 */
        return this.state.getNextBatchSize();
    }

    setFavorites(ids: string[]): void {
        this.state.setFavorites(ids);
        this.pushHistory();
    }

    /* PICKER 工具函数 */

    private mapItems(identifiers: string[]): T[] {
        /**
         * 把 id 数组映射为对应的完整 item 数组。
         */
        return identifiers.map((identifier) => this.itemMap[identifier]);
    }
}

/* 通用工具函数 */

/** 在 id 数组或带 id 属性的对象数组中查找 identifier 的下标（找不到返回 -1）。 */
function indexOfIdentifier(identifier: string, entries: string[] | EliminatedItem[]): number {
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (typeof entry === 'string' ? entry === identifier : entry.id === identifier) {
            return i;
        }
    }
    return -1;
}

/** 原地打乱数组顺序。 */
function shuffle<A>(array: A[]): A[] {
    let currentIndex = array.length;
    let temporaryValue: A;
    let randomIndex: number;

    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isEliminatedArray(value: unknown): value is EliminatedItem[] {
    return (
        Array.isArray(value) &&
        value.every(
            (entry) => isRecord(entry) && typeof entry.id === 'string' && isStringArray(entry.eliminatedBy)
        )
    );
}

/** 判断未知值是否为可安全交给 restoreState 的脱水状态。 */
function isStateSnapshot<S extends PickerSettings>(value: unknown): value is PickerStateSnapshot<S> {
    if (!isRecord(value)) {
        return false;
    }
    return (
        isEliminatedArray(value.eliminated) &&
        isStringArray(value.survived) &&
        isStringArray(value.current) &&
        isStringArray(value.evaluating) &&
        isStringArray(value.favorites) &&
        (value.settings === undefined || isRecord(value.settings))
    );
}

/** 返回给定值的深拷贝（仅用于纯数据）。 */
function deepCopy(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => deepCopy(entry));
    }
    if (isRecord(value)) {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(value)) {
            result[key] = deepCopy(value[key]);
        }
        return result;
    }
    return value;
}

/** 深拷贝并合并设置，后者的属性覆盖前者（对应原 copyObject 的行为）。 */
function mergeSettings<S extends PickerSettings>(
    base: Partial<S> | undefined,
    override: Partial<S> | undefined
): S {
    const result: Record<string, unknown> = {};
    for (const source of [base ?? {}, override ?? {}]) {
        const record = source as unknown as Record<string, unknown>;
        for (const key of Object.keys(record)) {
            result[key] = deepCopy(record[key]);
        }
    }
    return result as unknown as S;
}
