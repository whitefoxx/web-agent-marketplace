import { cli } from '@jackwener/opencli/registry';
cli({
  site: 'producthunt',
  name: 'comments',
  access: 'read',
  description: 'Product Hunt 某产品的评论(作者 / @handle / 内容)。传产品 slug(如 vercel)',
  domain: 'www.producthunt.com',
  args: [
    {
      name: 'slug',
      type: 'string',
      required: true,
      positional: true,
      help: '产品 slug,如 vercel',
    },
    { name: 'limit', type: 'int', default: 30, help: '最多返回几条(默认 30)' },
  ],
  columns: ['author', 'handle', 'text'],
  pipeline: [
    { navigate: 'https://www.producthunt.com/products/${{ args.slug }}' },
    { wait: { selector: '[data-test=comments-feed]', timeout: 15000 } },
    {
      evaluate: `(async () => {
  // Comments lazy-load on scroll — scroll + poll until the feed populates.
  for (let i = 0; i < 12; i++) {
    if (document.querySelector('[data-test=comments-feed] [data-test^="comment-"]')) break;
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 700));
  }
  const feed = document.querySelector('[data-test=comments-feed]');
  if (!feed) return [];
  const cs = [...feed.querySelectorAll('[data-test]')].filter((e) => /^comment-[0-9]+$/.test(e.getAttribute('data-test')));
  return cs.map((c) => {
    const links = [...c.querySelectorAll('a[href^="/@"]')];
    const named = links.find((a) => a.textContent.trim()) || links[0];
    const handle = named ? (named.getAttribute('href') || '').replace(/^\\//, '') : '';
    const author = named ? named.textContent.replace(/\\s+/g, ' ').trim() : '';
    const body = c.querySelector('.prose, [class*="prose"], [class*="htmlText"], [data-test=comment-body]');
    let text = body ? body.innerText.replace(/\\s+/g, ' ').trim() : '';
    if (!text) {
      const full = c.innerText.replace(/\\s+/g, ' ').trim();
      text = author && full.startsWith(author) ? full.slice(author.length).trim() : full;
    }
    return { author, handle, text: text.slice(0, 600) };
  }).filter((r) => r.text);
})()`,
    },
    { limit: '${{ args.limit }}' },
  ],
});
