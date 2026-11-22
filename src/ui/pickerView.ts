import Sortable from 'sortablejs';
import type { Picker } from '../core/picker';
import type { BaItem, BaSettings, PickerStateSnapshot } from '../core/types';

export interface PickerViewElements {
    evaluating: HTMLElement;
    favorites: HTMLElement;
    pickBtn: HTMLButtonElement;
    passBtn: HTMLButtonElement;
    undoBtn: HTMLButtonElement;
    redoBtn: HTMLButtonElement;
    progressFill: HTMLElement;
    progressText: HTMLElement;
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

    constructor(
        private readonly picker: Picker<BaItem, BaSettings>,
        private readonly elements: PickerViewElements
    ) {
        this.bindEvents();
        this.initSortable();
        this.update();
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
    }

    private bindEvents(): void {
        const { pickBtn, passBtn, undoBtn, redoBtn } = this.elements;

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
