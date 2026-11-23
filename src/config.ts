import type { BaSettings } from './core/types';

export interface AppConfig {
  studentsUrl: string;
  schoolsUrl: string;
  localStorageKey: string;
  historyLength: number;
  /** 开始页可选的每批卡片数；0 表示自动。 */
  batchSizeOptions: number[];
  defaultSettings: BaSettings;
}

export const CONFIG: AppConfig = {
  studentsUrl: 'data/students.json',
  schoolsUrl: 'data/schools.json',
  localStorageKey: 'ba-favorite-picker-state',
  historyLength: 10,
  batchSizeOptions: [0, 2, 4, 10, 12, 16, 18, 20],
  defaultSettings: {
    minBatchSize: 2,
    maxBatchSize: 20,
    splitSkins: false,
    includeStudents: true,
    includeNpcs: true,
    studentSchools: [],
    npcSchools: [],
    serverScope: 'all',
    batchSize: 0
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
