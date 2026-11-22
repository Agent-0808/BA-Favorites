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
  batchSizeOptions: [0, 4, 8, 12, 16, 20],
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
