import { cli } from '@jackwener/opencli/registry';
cli({
  site: 'producthunt',
  name: 'today',
  access: 'read',
  description: 'Product Hunt 今日上榜产品(排名/名称/标语/票数/评论数/话题/链接)',
  domain: 'www.producthunt.com',
  args: [{ name: 'limit', type: 'int', default: 20, help: '最多返回几个(默认 20)' }],
  columns: ['rank', 'name', 'tagline', 'votes', 'comments', 'topics', 'url'],
  pipeline: [
    { navigate: 'https://www.producthunt.com/' },
    { wait: { selector: '[data-test=homepage-section-today]', timeout: 15000 } },
    {
      evaluate: `(() => {
  const sec = document.querySelector('[data-test=homepage-section-today]') || document;
  const cards = [...sec.querySelectorAll('section[data-container]')];
  const num = (s) => { const m = String(s || '').replace(/[^0-9]/g, ''); return m ? parseInt(m, 10) : null; };
  return cards.map((c) => {
    const link = c.querySelector('a[href*="/products/"], a[href*="/posts/"]');
    if (!link) return null;
    const name = link.textContent.replace(/\\s+/g, ' ').trim().replace(/^[0-9]+\\.\\s*/, '');
    const url = link.href.split('?')[0];
    const vote = c.querySelector('[data-test=vote-button]');
    const votes = vote ? num(vote.innerText) : null;
    const topics = [...c.querySelectorAll('a[href*="/topics/"]')].map((a) => a.textContent.trim());
    let tagline = '', comments = null;
    for (const el of c.querySelectorAll('span, p, div')) {
      if (el.children.length) continue;
      if (el.closest('a')) continue;
      if (el.closest('[data-test=vote-button]')) continue;
      const t = el.textContent.replace(/\\s+/g, ' ').trim();
      if (!t || t === '•') continue;
      if (/^[0-9][0-9,]*$/.test(t)) { if (comments == null) comments = num(t); continue; }
      if (!tagline) tagline = t;
    }
    return { name, tagline, votes, comments, topics: topics.join(', '), url };
  }).filter(Boolean);
})()`,
    },
    {
      map: {
        rank: '${{ index + 1 }}',
        name: '${{ item.name }}',
        tagline: '${{ item.tagline }}',
        votes: '${{ item.votes }}',
        comments: '${{ item.comments }}',
        topics: '${{ item.topics }}',
        url: '${{ item.url }}',
      },
    },
    { limit: '${{ args.limit }}' },
  ],
});
