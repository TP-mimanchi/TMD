// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import HtmlToMarkdown from '../../state/htmlToMarkdown';
import { normalizePastedHTML } from '../paste';

// Bare-URL links need two separate paths: callers can keep the old plain URL
// fallback when auto-link can still recognize it, but preserve the anchor when
// the paste context would otherwise lose link semantics.

function setOnline(value: boolean) {
    Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

afterEach(() => {
    setOnline(true);
});

describe('normalizePastedHTML — bare URL link normalization', () => {
    it('keeps a link whose href is not a URL even when text === href', async () => {
        const out = await normalizePastedHTML('<a href="foo">foo</a>');
        // Non-URL href: the link must survive, not collapse into a bare span.
        expect(out).toContain('href="foo"');
    });

    it('keeps a link whose text differs from its href', async () => {
        const out = await normalizePastedHTML('<a href="http://example.com/">click</a>');
        expect(out).toContain('href="http://example.com/"');
    });

    it('unlinks a bare URL link (text === href) when no page title resolves', async () => {
        // Offline → getPageTitle returns '' immediately → fallback span path.
        // URL_REG needs a path segment after the host, so use `/page`.
        setOnline(false);
        const out = await normalizePastedHTML(
            '<a href="http://example.com/page">http://example.com/page</a>',
        );
        expect(out).not.toContain('<a ');
        expect(out).toContain('http://example.com/page');
    });

    it('keeps a bare URL link when the caller requests preservation', async () => {
        setOnline(false);
        const url = 'http://example.com/page';
        const out = await normalizePastedHTML(`<a href="${url}">${url}</a>`, {
            preserveBareUrlLinks: true,
        });
        const markdown = new HtmlToMarkdown({ bulletListMarker: '-' }).generate(out);

        expect(out).toContain(`href="${url}"`);
        expect(markdown).toContain(`[${url}](${url})`);
    });
});

describe('normalizePastedHTML — empty anchor normalization', () => {
    it('removes empty heading permalink anchors', async () => {
        const out = await normalizePastedHTML(
            '<h2>用户权限<a href="https://example.com/doc#permissions"></a></h2>',
        );
        const markdown = new HtmlToMarkdown({ bulletListMarker: '-' }).generate(out);

        expect(markdown).toBe('## 用户权限');
        expect(markdown).not.toContain('[](');
    });

    it('preserves linked images', async () => {
        const out = await normalizePastedHTML(
            '<a href="https://example.com/full"><img src="https://example.com/thumb.png" alt="截图"></a>',
        );
        const markdown = new HtmlToMarkdown({ bulletListMarker: '-' }).generate(out);

        expect(out).toContain('<a href="https://example.com/full">');
        expect(markdown).toContain('[![截图](https://example.com/thumb.png)](https://example.com/full)');
    });
});

describe('normalizePastedHTML — lazy image normalization', () => {
    it('promotes a Blog Garden data-src image to a Markdown image', async () => {
        const url = 'https://img2024.cnblogs.com/blog/3798513/202608/inline-01.png';
        const out = await normalizePastedHTML(
            `<img alt="inline-01.png" loading="lazy" data-src="${url}" class="lazyload">`,
        );
        const markdown = new HtmlToMarkdown({ bulletListMarker: '-' }).generate(out);

        expect(out).toContain(`src="${url}"`);
        expect(out).not.toContain('data-src');
        expect(markdown).toBe(`![inline-01.png](${url})`);
    });

    it('keeps an ordinary src image unchanged', async () => {
        const url = 'https://example.com/image.png';
        const out = await normalizePastedHTML(`<img alt="截图" src="${url}">`);
        const markdown = new HtmlToMarkdown({ bulletListMarker: '-' }).generate(out);

        expect(markdown).toBe(`![截图](${url})`);
    });

    it('does not promote an unsafe lazy image URL', async () => {
        const out = await normalizePastedHTML(
            '<img alt="bad" class="lazyload" data-src="javascript:alert(1)">',
        );

        expect(out).not.toContain('javascript:');
    });
});
