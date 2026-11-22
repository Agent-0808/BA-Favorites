import type { BaItem } from '../core/types';

/** students.json 中的页面（皮肤/形态）条目。 */
export interface StudentPage {
  page_id: number;
  skin: string;
  avatar: string;
  is_install: boolean;
  is_install_cn: boolean;
  rarity: number;
  limited: boolean;
}

/** students.json 中的角色条目。 */
export interface Student {
  id: number;
  family_name: string;
  given_name: string;
  school_id: number;
  is_npc: boolean;
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

/** 把上游角色数据转换为 picker items（每个角色一项）。 */
export function toItems(students: Student[], schools: School[]): BaItem[] {
  const schoolNames = new Map(schools.map(school => [school.id, school.name || school.name_cn || `学校 ${school.id}`]));
  const items: BaItem[] = [];

  for (const student of students) {
    const pages = student.pages ?? [];
    const base = pickBasePage(pages);
    // 没有任何头像的条目无法在界面中展示。
    if (!base) continue;

    let rarity = 0;
    let limited = false;
    let isInstallCn = false;
    let isInstallJp = false;
    let hasCostumes = false;

    for (const page of pages) {
      rarity = Math.max(rarity, page.rarity ?? 0);
      limited ||= Boolean(page.limited);
      isInstallCn ||= Boolean(page.is_install_cn);
      isInstallJp ||= Boolean(page.is_install);
      hasCostumes ||= Boolean(page.skin);
    }

    items.push({
      id: `s${student.id}`,
      name: studentName(student),
      image: absoluteUrl(base.avatar),
      schoolId: student.school_id,
      schoolName: schoolNames.get(student.school_id) ?? `学校 ${student.school_id}`,
      rarity,
      limited,
      isInstallCn,
      isInstallJp,
      isNpc: Boolean(student.is_npc),
      hasCostumes
    });
  }

  return items;
}

/** 生成学校筛选选项，只包含实际有角色的学校。 */
export function toSchoolOptions(students: Student[], schools: School[]): SchoolOption[] {
  const schoolMap = new Map(schools.map(school => [school.id, school]));
  const usedIds = new Set<number>();

  for (const student of students) {
    if (pickBasePage(student.pages ?? [])) {
      usedIds.add(student.school_id);
    }
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

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return response.json() as Promise<T>;
}
