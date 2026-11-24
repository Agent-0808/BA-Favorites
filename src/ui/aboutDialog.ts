import { createDialog } from './dialog';

/** 弹窗正文中的一条链接。 */
interface AboutLink {
    label: string;
    href: string;
}

/** 段落内的一段文字或链接。 */
type AboutInline = string | AboutLink;

/** 区块：普通段落，或独立成行的链接。 */
type AboutBlock = { kind: 'text'; parts: AboutInline[] } | { kind: 'link'; link: AboutLink };

/** 弹窗正文的一个分区。 */
interface AboutSection {
    title: string;
    blocks: AboutBlock[];
}

const ABOUT_SECTIONS: AboutSection[] = [
    {
        title: '项目说明',
        blocks: [
            {
                kind: 'text',
                parts: [
                    '基于 ',
                    { label: 'Favorite Picker', href: 'https://github.com/antialiasis/favorite-picker' },
                    ' 改造的《蔚蓝档案》角色喜好排序工具：通过反复从一批角色中选出更喜欢的角色，逐轮淘汰，最终得到完整的喜好排名。'
                ]
            }
        ]
    },
    {
        title: '数据来源',
        blocks: [
            {
                kind: 'text',
                parts: [
                    '角色数据来自 ',
                    { label: 'BA-characters-internal-id', href: 'https://github.com/Agent-0808/BA-characters-internal-id' }
                ]
            }
        ]
    },
    {
        title: '相关链接',
        blocks: [
            { kind: 'link', link: { label: 'GitHub 仓库', href: 'https://github.com/Agent-0808/BA-Favorites' } },
            { kind: 'link', link: { label: '上游项目 Favorite Picker', href: 'https://github.com/antialiasis/favorite-picker' } }
        ]
    }
];

function createAboutLink(link: AboutLink, className?: string): HTMLAnchorElement {
    const anchor = document.createElement('a');
    if (className) anchor.className = className;
    anchor.href = link.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.textContent = link.label;
    return anchor;
}

function renderInline(parent: HTMLElement, parts: AboutInline[]): void {
    for (const part of parts) {
        parent.append(typeof part === 'string' ? part : createAboutLink(part));
    }
}

/** 「关于」弹窗正文：按数据描述渲染分区。 */
function buildAboutContent(): DocumentFragment {
    const fragment = document.createDocumentFragment();
    for (const section of ABOUT_SECTIONS) {
        const element = document.createElement('section');
        element.className = 'ba-dialog-section';

        const title = document.createElement('h3');
        title.className = 'ba-dialog-section-title';
        title.textContent = section.title;
        element.append(title);

        for (const block of section.blocks) {
            if (block.kind === 'text') {
                const paragraph = document.createElement('p');
                renderInline(paragraph, block.parts);
                element.append(paragraph);
            } else {
                const anchor = createAboutLink(block.link, 'ba-link-row');
                const arrow = document.createElement('span');
                arrow.className = 'ba-link-arrow';
                arrow.setAttribute('aria-hidden', 'true');
                arrow.textContent = '↗';
                anchor.append(arrow);
                element.append(anchor);
            }
        }

        fragment.append(element);
    }
    return fragment;
}

/** 「关于」弹窗：开始页与选择页共用。 */
export function setupAboutDialog(): void {
    const dialog = createDialog({ title: '关于', content: buildAboutContent() });
    for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-open-about]')) {
        btn.addEventListener('click', () => dialog.open());
    }
}
