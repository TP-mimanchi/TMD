// @vitest-environment happy-dom

import type { Muya as MuyaType } from '../../muya';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../muya';

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
    document.getSelection()?.removeAllRanges();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string): MuyaType {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

describe('empty link visibility', () => {
    it('hides heading permalinks outside the active cursor token', () => {
        const muya = bootMuya('## 用户权限[](https://example.com/doc#permissions)\n');
        const link = muya.domNode.querySelector<HTMLAnchorElement>('a.mu-no-text-link')!;

        expect(link).toBeDefined();
        expect(link.classList.contains('mu-hide')).toBe(true);
        expect(link.previousElementSibling?.classList.contains('mu-hide')).toBe(true);
        expect(link.nextElementSibling?.classList.contains('mu-hide')).toBe(true);
    });
});
