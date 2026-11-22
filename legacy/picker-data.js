'use strict';

/**
 * PickerData: 将 BA-characters-internal-id 的 students.json 转换为 picker 所需的 item 列表。
 * 数据格式参考：https://github.com/Agent-0808/BA-characters-internal-id/blob/data/README.md
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PickerData = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    /**
     * @typedef {Object} StudentPage
     * @property {number} page_id
     * @property {string} skin
     * @property {string} avatar
     * @property {boolean} is_install_cn
     * @property {number} rarity
     * @property {boolean} limited
     */

    /**
     * @typedef {Object} Student
     * @property {number} id
     * @property {string} family_name
     * @property {string} given_name
     * @property {number} school_id
     * @property {boolean} is_npc
     * @property {StudentPage[]} pages
     */

    /**
     * @typedef {Object} PickerItem
     * @property {string} id
     * @property {string} name
     * @property {string} image
     * @property {number} schoolId
     * @property {string} schoolName
     * @property {number} rarity
     * @property {boolean} limited
     * @property {boolean} isInstallCn
     * @property {boolean} isNpc
     * @property {boolean} hasCostumes
     */

    /**
     * 补全协议相对 URL（数据中的头像地址形如 //static.kivo.wiki/...）。
     * @param {string} url
     * @returns {string}
     */
    function absoluteUrl(url) {
        if (!url) return '';
        return url.indexOf('//') === 0 ? 'https:' + url : url;
    }

    /**
     * 显示名称默认使用 kivo 源数据（family_name / given_name，简体中文民间译名）。
     * @param {Student} student
     * @returns {string}
     */
    function studentName(student) {
        var name = (student.family_name || '') + (student.given_name || '');
        return name || ('角色 ' + student.id);
    }

    /**
     * 取基础形态页（skin 为空且有头像）；若没有，则退化为第一个有头像的页。
     * @param {StudentPage[]} pages
     * @returns {StudentPage|null}
     */
    function pickBasePage(pages) {
        var i;
        for (i = 0; i < pages.length; i++) {
            if (!pages[i].skin && pages[i].avatar) return pages[i];
        }
        for (i = 0; i < pages.length; i++) {
            if (pages[i].avatar) return pages[i];
        }
        return null;
    }

    /**
     * 建立 school_id → 学校名 的映射（默认使用数据源中的 name）。
     * @param {Array<Object>} schools
     * @returns {Object<number, string>}
     */
    function schoolNameMap(schools) {
        var map = {};
        (schools || []).forEach(function (school) {
            map[school.id] = school.name || school.name_cn || ('学校 ' + school.id);
        });
        return map;
    }

    /**
     * 把上游学生数据转换为 picker items（按角色粒度，每个角色一项）。
     * @param {Student[]} students
     * @param {Array<Object>} [schools]
     * @returns {PickerItem[]}
     */
    function parseStudents(students, schools) {
        var names = schoolNameMap(schools);
        var items = [];

        (students || []).forEach(function (student) {
            var pages = student.pages || [];
            var base = pickBasePage(pages);
            // 没有任何头像的条目无法在界面中展示，直接跳过。
            if (!base) return;

            var rarity = 0;
            var limited = false;
            var isInstallCn = false;
            var hasCostumes = false;

            pages.forEach(function (page) {
                rarity = Math.max(rarity, page.rarity || 0);
                limited = limited || !!page.limited;
                isInstallCn = isInstallCn || !!page.is_install_cn;
                hasCostumes = hasCostumes || !!page.skin;
            });

            items.push({
                id: 's' + student.id,
                name: studentName(student),
                image: absoluteUrl(base.avatar),
                schoolId: student.school_id,
                schoolName: names[student.school_id] || ('学校 ' + student.school_id),
                rarity: rarity,
                limited: limited,
                isInstallCn: isInstallCn,
                isNpc: !!student.is_npc,
                hasCostumes: hasCostumes
            });
        });

        return items;
    }

    /**
     * 生成学校筛选项，只包含实际有角色的学校。
     * @param {Student[]} students
     * @param {Array<Object>} [schools]
     * @returns {Array<{id: number, name: string}>}
     */
    function makeSchoolOptions(students, schools) {
        var names = schoolNameMap(schools);
        var used = {};

        (students || []).forEach(function (student) {
            if (pickBasePage(student.pages || [])) {
                used[student.school_id] = true;
            }
        });

        return Object.keys(used)
            .map(Number)
            .sort(function (a, b) { return a - b; })
            .map(function (id) {
                return { id: id, name: names[id] || ('学校 ' + id) };
            });
    }

    /**
     * @param {string} url
     * @returns {Promise<any>}
     */
    function fetchJson(url) {
        return fetch(url, { cache: 'no-cache' }).then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response.json();
        });
    }

    /**
     * @param {File} file
     * @returns {Promise<any>}
     */
    function readJsonFile(file) {
        return file.text().then(function (text) {
            return JSON.parse(text);
        });
    }

    return {
        parseStudents: parseStudents,
        makeSchoolOptions: makeSchoolOptions,
        fetchJson: fetchJson,
        readJsonFile: readJsonFile
    };
}));
