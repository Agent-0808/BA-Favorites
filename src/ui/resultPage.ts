import { CONFIG } from '../config';
import type { BaItem } from '../core/types';

export interface ResultPageElements {
    screen: HTMLElement;
    pickerScreen: HTMLElement;
    grid: HTMLElement;
    count: HTMLElement;
    backBtn: HTMLButtonElement;
}

/** 瓦片的宽高比，与 CSS 的 aspect-ratio 保持一致。 */
const TILE_ASPECT = 456 / 404;

/**
 * “结果”页：只读展示已排好的最爱，返回后继续原来的排序进度。
 * 目前只有方格布局，之后会在这里增加金字塔和分享链接。
 */
export class ResultPage {
    private items: BaItem[] = [];
    private isOpen = false;

    constructor(
        private readonly elements: ResultPageElements,
        private readonly onBack: () => void,
        backLabel = '返回排序'
    ) {
        elements.backBtn.textContent = backLabel;
        elements.backBtn.addEventListener('click', () => {
            if (this.isOpen) this.close();
        });
        window.addEventListener('resize', () => {
            if (this.isOpen) this.layout();
        });
    }

    open(items: BaItem[]): void {
        if (items.length === 0) return;
        this.items = items;
        this.isOpen = true;
        this.elements.pickerScreen.hidden = true;
        this.elements.screen.hidden = false;
        this.render();
        this.layout();
        window.scrollTo({ top: 0 });
    }

    close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.elements.screen.hidden = true;
        this.elements.pickerScreen.hidden = false;
        this.onBack();
    }

    private render(): void {
        const { grid, count } = this.elements;
        grid.innerHTML = '';
        count.textContent = String(this.items.length);

        this.items.forEach((item, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'fav-item';

            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.dataset.id = item.id;
            tile.title = item.name;

            const image = document.createElement('img');
            image.src = item.image;
            image.alt = item.name;
            image.draggable = false;
            tile.append(image);

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
            grid.append(wrapper);
        });
    }

    /** 枚举可行列数，按宽高比、空位和是否超出首屏评分，取最优。 */
    private layout(): void {
        const { grid } = this.elements;
        const count = this.items.length;
        if (count === 0) return;

        const body = grid.parentElement;
        const header = this.elements.screen.querySelector<HTMLElement>('.app-header');
        if (!body) return;

        // 手机竖屏用更小的间距和下限，避免只能排两列
        const compact = window.matchMedia('(max-width: 600px)').matches;
        const gap = compact ? CONFIG.result.compactGap : CONFIG.result.gap;
        const minTile = compact ? CONFIG.result.compactMinTile : CONFIG.result.minTile;
        const { maxTile, targetRatio, emptyWeight, overflowWeight } = CONFIG.result;
        const bodyStyle = getComputedStyle(body);
        const paddingX = parseFloat(bodyStyle.paddingLeft) + parseFloat(bodyStyle.paddingRight);
        const paddingY = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
        // 用容器的宽度而不是网格自身，避免上一次设置的固定宽度影响下一次排版
        const availableWidth = body.clientWidth - paddingX;
        const availableHeight = window.innerHeight - (header?.offsetHeight ?? 0) - paddingY - 16;

        // 名称行高度和间距从实际卡片读取，避免写死字号
        const firstItem = grid.querySelector<HTMLElement>('.fav-item');
        const name = firstItem?.querySelector<HTMLElement>('.fav-name');
        const firstTile = firstItem?.querySelector<HTMLElement>('.tile');
        const nameHeight = name?.offsetHeight ?? 17;
        const nameGap = name && firstTile ? name.offsetTop - firstTile.offsetTop - firstTile.offsetHeight : 5;
        const nameRowHeight = nameHeight + nameGap;

        const maxCols = Math.max(1, Math.floor((availableWidth + gap) / (minTile + gap)));
        const limit = Math.min(count, maxCols);
        // 宽屏下只要排得下，就不选“竖长条”（例如 3 个排成 1×3）
        const preferLandscape = maxCols * maxCols >= count;
        let best: { cols: number; tile: number; empty: number; score: number } | null = null;

        for (let cols = 1; cols <= limit; cols++) {
            const rows = Math.ceil(count / cols);
            const tileByWidth = (availableWidth - gap * (cols - 1)) / cols;
            const tileByHeight = (availableHeight - gap * (rows - 1) - rows * nameRowHeight)
                / (rows * TILE_ASPECT);
            const tile = Math.max(minTile, Math.min(maxTile, tileByWidth, tileByHeight));

            const blockWidth = cols * tile + gap * (cols - 1);
            const blockHeight = rows * (tile * TILE_ASPECT + nameRowHeight) + gap * (rows - 1);
            const empty = cols * rows - count;
            const overflow = Math.max(0, blockHeight - availableHeight) / availableHeight;
            const score = Math.abs(blockWidth / blockHeight - targetRatio)
                + emptyWeight * (empty / count)
                + overflowWeight * overflow
                + (preferLandscape && cols < rows ? 10 : 0);

            const better = !best
                || score < best.score - 1e-9
                || (Math.abs(score - best.score) < 1e-9
                    && (empty < best.empty || (empty === best.empty && tile > best.tile)));
            if (better) best = { cols, tile, empty, score };
        }

        if (!best) return;

        const tileWidth = Math.floor(best.tile);
        const blockWidth = Math.floor(best.cols * tileWidth + gap * (best.cols - 1));
        // 间距与宽度共用同一来源，确保列数不会被 CSS 的 gap 挤成别的数目
        grid.style.setProperty('--result-gap', `${gap}px`);
        grid.style.setProperty('--tile-width', `${tileWidth}px`);
        grid.style.width = `${blockWidth}px`;
    }
}
