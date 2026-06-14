import { cli } from '@jackwener/opencli/registry';
cli({
  site: 'producthunt',
  name: 'product',
  access: 'read',
  description: 'Product Hunt 单个产品详情(名称/标语/官网/票数/话题)。传产品 slug(如 vercel)',
  domain: 'www.producthunt.com',
  args: [
    {
      name: 'slug',
      type: 'string',
      required: true,
      positional: true,
      help: '产品 slug,如 vercel(取自 today 结果 url 的末段 /products/<slug>)',
    },
  ],
  columns: ['name', 'tagline', 'website', 'votes', 'topics', 'url'],
  pipeline: [
    { navigate: 'https://www.producthunt.com/products/${{ args.slug }}' },
    { wait: { selector: 'h1', timeout: 15000 } },
    {
      evaluate: `(() => {
  const q = (s) => document.querySelector(s);
  const meta = (n) => (q('meta[property="' + n + '"], meta[name="' + n + '"]') || {}).content || '';
  const num = (s) => { const m = String(s || '').replace(/[^0-9]/g, ''); return m ? parseInt(m, 10) : null; };
  const web = q('[data-test=visit-website-button]');
  const vote = q('[data-test=vote-button]');
  const topics = [...new Set([...document.querySelectorAll('a[href*="/topics/"]')].map((a) => a.textContent.trim()))];
  return [{
    name: ((q('h1') || {}).innerText || '').replace(/\\s+/g, ' ').trim(),
    tagline: meta('og:description'),
    website: web ? (web.href || web.getAttribute('href') || '') : '',
    votes: vote ? num(vote.innerText) : null,
    topics: topics.join(', '),
    url: location.href.split('?')[0],
  }];
})()`,
    },
  ],
});
