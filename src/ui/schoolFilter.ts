import type { SchoolOption } from '../data/ba';

export interface SchoolFilterElements {
    root: HTMLElement;
    button: HTMLButtonElement;
    dropdown: HTMLElement;
    count: HTMLElement;
}

export interface SchoolFilter extends SchoolFilterElements {
    schools: SchoolOption[];
    setSelected(ids: number[]): void;
}

interface CreateSchoolFilterOptions extends SchoolFilterElements {
    schools: SchoolOption[];
    selected: number[];
    onChange(selected: number[]): void;
}

/**
 * 学校多选下拉：复选框列表 + 已选数量 + 清除全部，点击外部关闭。
 */
export function createSchoolFilter(options: CreateSchoolFilterOptions): SchoolFilter {
    const { root, button, dropdown, count, schools, onChange } = options;
    const selected = new Set<number>(options.selected);

    function updateUI(): void {
        count.textContent = selected.size > 0 ? String(selected.size) : '';
        dropdown.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => {
            input.checked = selected.has(Number(input.dataset.schoolId));
        });
    }

    function notify(): void {
        updateUI();
        onChange([...selected]);
    }

    function render(): void {
        dropdown.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'school-dropdown-header';
        const title = document.createElement('span');
        title.textContent = '按学校筛选';
        const clear = document.createElement('span');
        clear.className = 'school-clear';
        clear.textContent = '清除全部';
        clear.addEventListener('click', () => {
            selected.clear();
            notify();
        });
        header.append(title, clear);
        dropdown.append(header);

        for (const school of schools) {
            const label = document.createElement('label');
            label.className = 'school-option';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.schoolId = String(school.id);
            input.addEventListener('change', () => {
                if (input.checked) {
                    selected.add(school.id);
                } else {
                    selected.delete(school.id);
                }
                notify();
            });

            if (school.logo) {
                const logo = document.createElement('img');
                logo.src = school.logo;
                logo.alt = '';
                logo.loading = 'lazy';
                label.append(input, logo);
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'school-logo-placeholder';
                label.append(input, placeholder);
            }

            const name = document.createElement('span');
            name.textContent = school.name;
            label.append(name);
            dropdown.append(label);
        }

        updateUI();
    }

    function setDropdownOpen(open: boolean): void {
        dropdown.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
    }

    button.addEventListener('click', event => {
        event.stopPropagation();
        setDropdownOpen(dropdown.hidden);
    });

    document.addEventListener('click', event => {
        const target = event.target as Node;
        if (!root.contains(target)) {
            setDropdownOpen(false);
        }
    });

    render();

    return {
        root,
        button,
        dropdown,
        count,
        schools,
        setSelected(ids: number[]): void {
            selected.clear();
            for (const id of ids) selected.add(id);
            updateUI();
        }
    };
}
