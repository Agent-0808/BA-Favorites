/** picker 数据项的最小结构；自定义字段会原样保留。 */
export interface PickerItem {
  id: string;
  name?: string;
  image?: string;
  [key: string]: unknown;
}

/** picker 设置；minBatchSize / maxBatchSize 为内置设置，其余为页面自定义设置。 */
export interface PickerSettings {
  minBatchSize?: number;
  maxBatchSize?: number;
  [key: string]: unknown;
}

export interface EliminatedItem {
  id: string;
  eliminatedBy: string[];
}

/** 可序列化的 picker 状态。 */
export interface PickerStateSnapshot<S extends PickerSettings = PickerSettings> {
  eliminated: EliminatedItem[];
  survived: string[];
  current: string[];
  evaluating: string[];
  favorites: string[];
  settings: S;
}

export interface PickerOptions<T extends PickerItem = PickerItem, S extends PickerSettings = PickerSettings> {
  items: T[];
  localStorageKey?: string;
  defaultSettings?: Partial<S>;
  historyLength?: number;
  getBatchSize?: (currentSize: number, settings: S) => number;
  shouldIncludeItem?: (item: T, settings: S) => boolean;
  getFilteredItems?: (settings: S) => string[];
  modifyState?: (state: PickerStateSnapshot<S>) => PickerStateSnapshot<S>;
  onLoadState?: (missingItems: string[], extraItems: string[]) => void;
  saveState?: (state: PickerStateSnapshot<S>) => void;
  loadState?: () => PickerStateSnapshot<S> | undefined;
}

/** 碧蓝档案角色条目。 */
export interface BaItem extends PickerItem {
  name: string;
  image: string;
  schoolId: number;
  schoolName: string;
  rarity: number;
  limited: boolean;
  isInstallCn: boolean;
  isInstallJp: boolean;
  isNpc: boolean;
  hasCostumes: boolean;
}

/** 页面自定义设置。 */
export interface BaSettings extends PickerSettings {
  nonNpcOnly: boolean;
  jpInstalledOnly: boolean;
  schools: number[];
}
