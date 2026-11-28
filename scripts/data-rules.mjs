/**
 * 构建脚本与本地预览脚本共用的数据规则。
 * 规则与上游 crawler/output.py 对齐。
 */

/** 与上游对齐的筛选与清洗规则。 */
export const DATA_RULES = {
    /** 官方/制作组账号。 */
    excludeSchools: [30],
    /** 彩蛋条目：16 老师、348 苡蛇花遁。 */
    excludeIds: [16, 348],
    /** CBT 内测角色。 */
    excludeMainRelations: [81],
    ageRange: [10, 30],
    heightRange: [120, 220]
};

/** 角色键：skin_list 中最小页面 id，缺失时退回文件自身的 id。 */
export function roleKey(data) {
    const ids = (data.skin_list ?? []).map(page => page.id).filter(id => typeof id === 'number');
    return ids.length > 0 ? Math.min(...ids) : data.id;
}

/** 上游硬排除：官方账号、彩蛋、CBT 角色。 */
export function isRuleExcluded(roleId, data) {
    return (
        DATA_RULES.excludeSchools.includes(data.school) ||
        DATA_RULES.excludeIds.includes(roleId) ||
        DATA_RULES.excludeMainRelations.includes(data.main_relation)
    );
}
