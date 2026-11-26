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

    /** 按数量选接近正方的列数，并在首屏内缩放卡片。 */
    private layout(): void {
        const { grid } = this.elements;
        const count = this.items.length;
        if (count === 0) return;

        const gap = CONFIG.result.gap;
        const body = grid.parentElement;
        const header = this.elements.screen.querySelector<HTMLElement>('.app-header');
        if (!body) return;

        const bodyStyle = getComputedStyle(body);
        const paddingX = parseFloat(bodyStyle.paddingLeft) + parseFloat(bodyStyle.paddingRight);
        const paddingY = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
        // 用容器的宽度而不是网格自身，避免上一次设置的固定宽度影响下一次排版
        const availableWidth = body.clientWidth - paddingX;
        const availableHeight = window.innerHeight - (header?.offsetHeight ?? 0) - paddingY - 16;

        // 接近正方，但不能少到一张牌都放不下：窄屏时减少列数而不是缩小卡片
        const columns = Math.min(
            Math.ceil(Math.sqrt(count)),
            Math.max(1, Math.floor((availableWidth + gap) / (CONFIG.result.minTile + gap)))
        );
        const rows = Math.ceil(count / columns);

        // 名称行高度和间距从实际卡片读取，避免写死字号
        const firstItem = grid.querySelector<HTMLElement>('.fav-item');
        const name = firstItem?.querySelector<HTMLElement>('.fav-name');
        const firstTile = firstItem?.querySelector<HTMLElement>('.tile');
        const nameHeight = name?.offsetHeight ?? 17;
        const nameGap = name && firstTile ? name.offsetTop - firstTile.offsetTop - firstTile.offsetHeight : 5;

        const sizeByWidth = (availableWidth - gap * (columns - 1)) / columns;
        const sizeByHeight = (availableHeight - gap * (rows - 1) - rows * (nameHeight + nameGap))
            / (rows * TILE_ASPECT);
        const size = Math.floor(Math.min(sizeByWidth, sizeByHeight));
        const tileWidth = Math.max(CONFIG.result.minTile, Math.min(CONFIG.result.maxTile, size));

        // 固定宽度，确保每行正好 columns 个，而不是被更宽的容器排成更多列
        grid.style.setProperty('--tile-width', `${tileWidth}px`);
        grid.style.width = `${columns * tileWidth + gap * (columns - 1)}px`;
    }
}
