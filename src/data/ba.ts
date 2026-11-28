import type { BaItem, BaSettings } from '../core/types';

/** students.json 中的页面（皮肤/形态）条目。 */
export interface StudentPage {
  page_id: number;
  skin: string;
  skin_cn?: string;
  avatar: string;
  is_install: boolean;
  is_install_cn: boolean;
  is_install_global: boolean;
  rarity: number;
  limited: boolean;
}

/** students.json 中的角色条目。 */
export interface Student {
  id: number;
  family_name: string;
  given_name: string;
  family_name_cn?: string;
  given_name_cn?: string;
  school_id: number;
  is_npc: boolean;
  /** 角色分类：normal 常规、mob 杂鱼酱、other 机器人 / Boss 等、nameonly 只有名字。 */
  tier?: 'normal' | 'mob' | 'other' | 'nameonly';
  age?: number | null;
  height?: number | null;
  body_shape?: string | null;
  pages: StudentPage[];
}

/** schools.json 条目（只使用本项目需要的字段）。 */
export interface School {
  id: number;
  name: string;
  name_cn?: string;
  logo?: string;
}

export interface SchoolOption {
  id: number;
  name: string;
  logo: string;
}

/** 按角色类别分组的学校选项。 */
export interface SchoolGroups {
  students: SchoolOption[];
  npcs: SchoolOption[];
}

/** 页面级展示状态。 */
interface PageFlags {
  rarity: number;
  limited: boolean;
  isInstallCn: boolean;
  isInstallJp: boolean;
  isInstallGlobal: boolean;
}

/** 补全协议相对 URL（数据中的头像/徽标形如 //static.kivo.wiki/...）。 */
function absoluteUrl(url: string | undefined): string {
  if (!url) return '';
  return url.startsWith('//') ? `https:${url}` : url;
}

/** 显示名称默认使用 kivo 源数据（family_name / given_name）。 */
function studentName(student: Student): string {
  const name = `${student.family_name ?? ''}${student.given_name ?? ''}`;
  return name || `角色 ${student.id}`;
}

/** 取基础形态页（skin 为空且有头像）；否则退化为第一个有头像的页。 */
function pickBasePage(pages: StudentPage[]): StudentPage | null {
  return (
    pages.find(page => !page.skin && page.avatar) ??
    pages.find(page => page.avatar) ??
    null
  );
}

function pageFlags(page: StudentPage): PageFlags {
  return {
    rarity: page.rarity ?? 0,
    limited: Boolean(page.limited),
    isInstallCn: Boolean(page.is_install_cn),
    isInstallJp: Boolean(page.is_install),
    isInstallGlobal: Boolean(page.is_install_global)
  };
}

/** 合并同一角色的所有形态，用于按角色排序。 */
function mergePageFlags(pages: StudentPage[]): PageFlags {
  const flags: PageFlags = {
    rarity: 0,
    limited: false,
    isInstallCn: false,
    isInstallJp: false,
    isInstallGlobal: false
  };
  for (const page of pages) {
    const current = pageFlags(page);
    flags.rarity = Math.max(flags.rarity, current.rarity);
    flags.limited ||= current.limited;
    flags.isInstallCn ||= current.isInstallCn;
    flags.isInstallJp ||= current.isInstallJp;
    flags.isInstallGlobal ||= current.isInstallGlobal;
  }
  return flags;
}

function buildItem(
  student: Student,
  page: StudentPage,
  schoolNames: Map<number, string>,
  id: string,
  name: string,
  flags: PageFlags,
  hasCostumes: boolean
): BaItem {
  return {
    id,
    name,
    image: absoluteUrl(page.avatar),
    schoolId: student.school_id,
    schoolName: schoolNames.get(student.school_id) ?? `学校 ${student.school_id}`,
    ...flags,
    isNpc: Boolean(student.is_npc),
    tier: student.tier ?? 'normal',
    hasCostumes
  };
}

/** 把上游角色数据转换为 picker items；splitSkins 为真时每个形态一项。 */
export function toItems(students: Student[], schools: School[], splitSkins = false): BaItem[] {
  const schoolNames = new Map(schools.map(school => [school.id, school.name || school.name_cn || `学校 ${school.id}`]));
  const items: BaItem[] = [];

  for (const student of students) {
    const pages = student.pages ?? [];

    if (splitSkins) {
      for (const page of pages) {
        // 没有任何头像的页无法在界面中展示。
        if (!page.avatar) continue;
        const name = page.skin ? `${studentName(student)}(${page.skin})` : studentName(student);
        items.push(buildItem(student, page, schoolNames, `p${page.page_id}`, name, pageFlags(page), Boolean(page.skin)));
      }
      continue;
    }

    const base = pickBasePage(pages);
    // 没有任何头像的条目无法在界面中展示。
    if (!base) continue;

    items.push(
      buildItem(
        student,
        base,
        schoolNames,
        `s${student.id}`,
        studentName(student),
        mergePageFlags(pages),
        pages.some(page => Boolean(page.skin))
      )
    );
  }

  return items;
}

/** 生成学生 / NPC 两栏的学校选项，只包含各自实际有角色的学校。 */
export function toSchoolGroups(items: BaItem[], schools: School[]): SchoolGroups {
  const schoolMap = new Map(schools.map(school => [school.id, school]));

  function toOptions(isNpc: boolean): SchoolOption[] {
    const usedIds = new Set<number>();
    for (const item of items) {
      if (item.isNpc === isNpc) usedIds.add(item.schoolId);
    }

    return [...usedIds]
      .sort((a, b) => a - b)
      .map(id => {
        const school = schoolMap.get(id);
        return {
          id,
          name: school?.name || school?.name_cn || `学校 ${id}`,
          logo: absoluteUrl(school?.logo)
        };
      });
  }

  return { students: toOptions(false), npcs: toOptions(true) };
}

/** 判断 item 是否落在当前角色范围内（路人、学生/NPC 总开关、学校、实装范围）。 */
export function matchesBaScope(item: BaItem, settings: BaSettings): boolean {
  // 杂鱼酱、机器人 / Boss、“只有名字”的角色默认隐藏，仅在显式开启后参与
  if (item.tier === 'mob' && !settings.includeMobs) return false;
  if (item.tier === 'other' && !settings.includeOthers) return false;
  if (item.tier === 'nameonly' && !settings.includeNameOnly) return false;

  if (item.isNpc) {
    if (!settings.includeNpcs) return false;
    // 常规 NPC学生 可单独关闭，杂鱼酱 / 其他 / 只有名字 由下面的分类开关控制
    if (item.tier === 'normal' && !settings.includeNpcStudents) return false;
    const schoolIds = settings.npcSchools ?? [];
    if (schoolIds.length > 0 && !schoolIds.includes(item.schoolId)) return false;
  } else {
    if (!settings.includeStudents) return false;
    const schoolIds = settings.studentSchools ?? [];
    if (schoolIds.length > 0 && !schoolIds.includes(item.schoolId)) return false;
  }

  switch (settings.serverScope) {
    case 'jp':
      return item.isInstallJp;
    case 'cn':
      return item.isInstallCn;
    case 'global':
      return item.isInstallGlobal;
    default:
      return true;
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return response.json() as Promise<T>;
}
