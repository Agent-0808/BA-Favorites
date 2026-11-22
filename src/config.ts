import type { BaSettings } from './core/types';

export interface AppConfig {
  studentsUrl: string;
  schoolsUrl: string;
  localStorageKey: string;
  historyLength: number;
  defaultSettings: BaSettings;
}

export const CONFIG: AppConfig = {
  studentsUrl: 'data/students.json',
  schoolsUrl: 'data/schools.json',
  localStorageKey: 'ba-favorite-picker-state',
  historyLength: 10,
  defaultSettings: {
    minBatchSize: 2,
    maxBatchSize: 20,
    playableOnly: false,
    cnInstalledOnly: false,
    schools: []
  }
};
