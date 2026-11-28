import type { BaSettings } from './core/types';

/** 底部“我的最爱”的展示配置。 */
export interface FavoritePanelConfig {
  /** 收起时显示的行数。 */
  previewRows: number;
  /** 展开后最多显示的行数，超出则内部滚动。 */
  maxRows: number;
}

/** “结果”页的方格布局配置。 */
export interface ResultConfig {
  /** 卡片宽度的上限。 */
  maxTile: number;
  /** 卡片宽度的下限，低于此值时允许滚动。 */
  minTile: number;
  /** 卡片间距。 */
  gap: number;
  /** 窄屏（≤600px）下的卡片间距。 */
  compactGap: number;
  /** 窄屏（≤600px）下的卡片宽度下限。 */
  compactMinTile: number;
  /** 整体宽高比目标：1 接近正方，越大越横向。 */
  targetRatio: number;
  /** 每空一个卡片位置的扣分权重。 */
  emptyWeight: number;
  /** 超出首屏高度的扣分权重。 */
  overflowWeight: number;
}

export interface AppConfig {
  studentsUrl: string;
  schoolsUrl: string;
  localStorageKey: string;
  historyLength: number;
  /** 开始页与选择页可选的每批数量；自动收缩时作为上限。 */
  batchSizeOptions: number[];
  /** 自动批次按剩余人数的几分之一收缩。 */
  batchDivisor: number;
  favorites: FavoritePanelConfig;
  result: ResultConfig;
  defaultSettings: BaSettings;
}

export const CONFIG: AppConfig = {
  studentsUrl: 'data/students.json',
  schoolsUrl: 'data/schools.json',
  localStorageKey: 'ba-favorite-picker-state',
  historyLength: 10,
  batchSizeOptions: [2, 4, 6, 8, 10, 12, 16, 18, 20],
  batchDivisor: 5,
  favorites: {
    previewRows: 2,
    maxRows: 3
  },
  result: {
    maxTile: 140,
    minTile: 100,
    gap: 20,
    compactGap: 12,
    compactMinTile: 96,
    targetRatio: 1.1,
    emptyWeight: 8,
    overflowWeight: 8
  },
  defaultSettings: {
    minBatchSize: 2,
    maxBatchSize: 20,
    splitSkins: false,
    includeStudents: true,
    includeNpcs: true,
    includeNpcStudents: true,
    includeMobs: true,
    includeOthers: false,
    includeNameOnly: false,
    studentSchools: [],
    npcSchools: [],
    serverScope: 'all',
    batchSize: 20,
    fixedBatchSize: false
  }
};

/** 蔚蓝档案点击特效配置（ba-click-fx）；暂无设置页，直接使用这里的默认值。 */
export interface ClickFxConfig {
  enabled: boolean;
  themeColor: string;
  clickEnabled: boolean;
  trailEnabled: boolean;
  /** true：仅移动鼠标也显示拖尾（无需按下）。 */
  trailAlways: boolean;
  /** 整体不透明度 0~1。 */
  opacity: number;
  /** 特效整体缩放。 */
  scale: number;
}

export const CLICK_FX_CONFIG: ClickFxConfig = {
  enabled: true,
  themeColor: '#4ca7ff',
  clickEnabled: true,
  trailEnabled: true,
  trailAlways: false,
  opacity: 0.15,
  scale: 1
};
