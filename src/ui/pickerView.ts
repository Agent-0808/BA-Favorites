import Sortable from 'sortablejs';
import { CONFIG } from '../config';
import type { Picker } from '../core/picker';
import type { BaItem, BaSettings, PickerStateSnapshot } from '../core/types';
import type { ResultPage } from './resultPage';

export interface PickerViewElements {
    evaluating: HTMLElement;
    favorites: HTMLElement;
    favoritesMeta: HTMLElement;
    toggleFavoritesBtn: HTMLButtonElement;
    resultBtn: HTMLButtonElement;
    pickBtn: HTMLButtonElement;
    passBtn: HTMLButtonElement;
    undoBtn: HTMLButtonElement;
    redoBtn: HTMLButtonElement;
    progressFill: HTMLElement;
    progressText: HTMLElement;
    nextBatchSize: HTMLSelectElement;
    statFavorites: HTMLElement;
    statRemaining: HTMLElement;
    statEliminated: HTMLElement;
}

/**
 * picker 的页面视图：渲染候选网格、已选列表、进度和按钮状态。
 * 选中态属于视图自身，不写入 picker 状态。
 */
export class PickerView {
    private readonly selected = new Set<string>();
    /** 底部最爱区是否展开显示全部排名。 */
    private favoritesExpanded = false;

    constructor(
        private readonly picker: Picker<BaItem, BaSettings>,
        private readonly elements: PickerViewElements,
        private readonly resultPage: ResultPage
    ) {
        this.initNextBatchOptions();
        this.bindEvents();
        this.initSortable();
        this.update();
    }

    /** “下一批”下拉框：0 表示跟随设置，其余为一次性固定数量。 */
    private initNextBatchOptions(): void {
        const select = this.elements.nextBatchSize;
        const follow = document.createElement('option');
        follow.value = '0';
        follow.textContent = '跟随设置';
        select.append(follow);

        for (const size of CONFIG.batchSizeOptions) {
            const option = document.createElement('option');
            option.value = String(size);
            option.textContent = `${size} 张`;
            select.append(option);
        }
    }

    update(): void {
        const state = this.picker.getState();
        const evaluating = this.picker.getEvaluating();
        const favorites = this.picker.getFavorites();

        // 清理已经不在候选中的选中项
        const evaluatingIds = new Set(evaluating.map(item => item.id));
        for (const id of [...this.selected]) {
            if (!evaluatingIds.has(id)) this.selected.delete(id);
        }

        this.renderEvaluating(evaluating);
        this.renderFavorites(favorites);
        this.renderProgress(state, evaluating.length, favorites.length);
        this.updateButtons(evaluating.length);
        this.elements.resultBtn.disabled = favorites.length === 0;
        this.elements.nextBatchSize.value = String(this.picker.getNextBatchSize() ?? 0);
        this.fitNames();
        this.layoutFavorites();
    }

    /**
     * 名称单行自适应：字号从默认值逐级缩小到 9px，
     * 仍放不下则由 CSS 的 text-overflow 省略号截断。
     */
    private fitNames(): void {
        const MIN_FONT_SIZE = 9;
        const names = [
            ...this.elements.evaluating.querySelectorAll<HTMLElement>('.tile-name'),
            ...this.elements.favorites.querySelectorAll<HTMLElement>('.fav-name')
        ];
        for (const el of names) {
            // 每次重绘先恢复默认字号，避免沿用上一次的缩小结果
            el.style.fontSize = '';
            let size = parseFloat(getComputedStyle(el).fontSize);
            while (el.scrollWidth > el.clientWidth && size > MIN_FONT_SIZE) {
                size -= 1;
                el.style.fontSize = `${size}px`;
            }
        }
    }

    private bindEvents(): void {
        const { pickBtn, passBtn, undoBtn, redoBtn, nextBatchSize, resultBtn } = this.elements;

        resultBtn.addEventListener('click', () => {
            this.resultPage.open(this.picker.getFavorites());
        });

        pickBtn.addEventListener('click', () => {
            if (this.selected.size === 0) return;
            this.picker.pick([...this.selected]);
            this.selected.clear();
            this.update();
        });

        passBtn.addEventListener('click', () => {
            this.picker.pass();
            this.selected.clear();
            this.update();
        });

        undoBtn.addEventListener('click', () => {
            this.picker.undo();
            this.selected.clear();
            this.update();
        });

        redoBtn.addEventListener('click', () => {
            this.picker.redo();
            this.selected.clear();
            this.update();
        });

        nextBatchSize.addEventListener('change', () => {
            const size = Number(nextBatchSize.value) || 0;
            this.picker.setNextBatchSize(size > 0 ? size : null);
        });

        this.elements.toggleFavoritesBtn.addEventListener('click', () => {
            this.favoritesExpanded = !this.favoritesExpanded;
            this.layoutFavorites();
        });

        // 列数随窗口宽度变化，重新计算最爱区可见行数
        window.addEventListener('resize', () => this.layoutFavorites());
    }

    private initSortable(): void {
        Sortable.create(this.elements.favorites, {
            animation: 120,
            draggable: '.fav-item',
            ghostClass: 'dragging',
            onEnd: () => {
                const ids = [...this.elements.favorites.querySelectorAll<HTMLElement>('.fav-item')]
                    .map(node => node.dataset.id)
                    .filter((id): id is string => Boolean(id));
                this.picker.setFavorites(ids);
                this.update();
            }
        });
    }

    private renderEvaluating(items: BaItem[]): void {
        const container = this.elements.evaluating;
        container.innerHTML = '';

        if (items.length === 0) {
            const notice = document.createElement('div');
            notice.className = 'tile-notice';
            notice.textContent = this.picker.hasItems()
                ? '你已选出全部角色！'
                : '当前筛选条件下没有角色，请调整筛选后重试。';
            container.append(notice);
            return;
        }

        for (const item of items) {
            const tile = this.createTile(item, true);
            if (this.selected.has(item.id)) tile.classList.add('selected');
            container.append(tile);
        }
    }

    private renderFavorites(items: BaItem[]): void {
        const container = this.elements.favorites;
        container.innerHTML = '';

        items.forEach((item, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'fav-item';
            wrapper.dataset.id = item.id;

            const tile = this.createTile(item, false);

            // 半透明条带：粉色爱心 + 排名
            const love = document.createElement('span');
            love.className = 'tile-love';
            const heart = document.createElement('span');
            heart.className = 'heart';
            heart.textContent = '♥';
            heart.setAttribute('aria-hidden', 'true');
            const rank = document.createElement('span');
            rank.textContent = String(index + 1);
            love.append(heart, rank);
            tile.append(love);

            const name = document.createElement('span');
            name.className = 'fav-name';
            name.textContent = item.name;
            name.title = item.name;

            wrapper.append(tile, name);
            container.append(wrapper);
        });
    }

    /**
     * 底部最爱区按实际列数限制高度：收起时只露 previewRows 行，
     * 展开时最多露 maxRows 行，超出部分内部滚动。
     */
    private layoutFavorites(): void {
        const { favorites: grid, favoritesMeta, toggleFavoritesBtn } = this.elements;
        const items = [...grid.querySelectorAll<HTMLElement>('.fav-item')];
        favoritesMeta.textContent = `${items.length} 个`;

        if (items.length === 0) {
            grid.style.maxHeight = '';
            grid.classList.remove('is-expanded');
            toggleFavoritesBtn.hidden = true;
            return;
        }

        // 首行元素数量即列数；取最高的一张，避免名称缩字后行高不一致
        const first = items[0];
        const columns = items.filter(entry => entry.offsetTop === first.offsetTop).length;
        const totalRows = Math.ceil(items.length / columns);
        const rowGap = parseFloat(getComputedStyle(grid).rowGap) || 0;
        const rowHeight = Math.max(...items.map(entry => entry.offsetHeight));
        const previewRows = CONFIG.favorites.previewRows;
        const visibleRows = this.favoritesExpanded
            ? Math.min(totalRows, CONFIG.favorites.maxRows)
            : Math.min(totalRows, previewRows);

        grid.classList.toggle('is-expanded', this.favoritesExpanded);
        grid.style.maxHeight = `${Math.ceil(rowHeight * visibleRows + rowGap * (visibleRows - 1))}px`;
        if (!this.favoritesExpanded) grid.scrollTop = 0;

        toggleFavoritesBtn.hidden = totalRows <= previewRows;
        toggleFavoritesBtn.textContent = this.favoritesExpanded ? '收起' : `展开全部 · ${items.length}`;
        toggleFavoritesBtn.setAttribute('aria-expanded', String(this.favoritesExpanded));
    }

    private createTile(item: BaItem, selectable: boolean): HTMLElement {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.id = item.id;
        tile.title = item.name;

        const image = document.createElement('img');
        image.src = item.image;
        image.alt = item.name;
        image.loading = 'lazy';
        image.draggable = false;

        tile.append(image);

        if (selectable) {
            // 候选瓦片在图片底部显示名称；最爱瓦片的名称在图片外
            const name = document.createElement('span');
            name.className = 'tile-name';
            name.textContent = item.name;
            tile.append(name);

            tile.addEventListener('click', () => {
                if (this.selected.has(item.id)) {
                    this.selected.delete(item.id);
                    tile.classList.remove('selected');
                } else {
                    this.selected.add(item.id);
                    tile.classList.add('selected');
                }
                this.updateButtons(this.picker.getEvaluating().length);
            });
        }

        return tile;
    }

    private renderProgress(
        state: PickerStateSnapshot<BaSettings>,
        evaluatingCount: number,
        favoritesCount: number
    ): void {
        const remaining = state.evaluating.length + state.current.length + state.survived.length;
        const eliminated = state.eliminated.length;
        const total = remaining + eliminated + favoritesCount;
        const done = total - remaining;
        const batchSize = Math.max(1, evaluatingCount);
        const batchesLeft = Math.ceil(remaining / batchSize);

        this.elements.progressFill.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';
        this.elements.progressText.textContent = remaining > 0
            ? `已筛选 ${done} / ${total} · 还剩 ${remaining} 位候选 · 约需 ${batchesLeft} 次选择`
            : `已筛选 ${done} / ${total} · 本轮已全部完成`;

        this.elements.statFavorites.textContent = String(favoritesCount);
        this.elements.statRemaining.textContent = String(remaining);
        this.elements.statEliminated.textContent = String(eliminated);
    }

    private updateButtons(evaluatingCount: number): void {
        this.elements.pickBtn.disabled = this.selected.size === 0 || evaluatingCount === 0;
        this.elements.passBtn.disabled = evaluatingCount === 0;
        this.elements.undoBtn.disabled = !this.picker.canUndo();
        this.elements.redoBtn.disabled = !this.picker.canRedo();
    }
}
