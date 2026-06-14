import { cli } from '@jackwener/opencli/registry';
cli({
  site: 'producthunt',
  name: 'search',
  access: 'read',
  description: 'Product Hunt 搜索产品(名称 / 标语 / product_id)。注:聚光搜索结果不含 slug/URL',
  domain: 'www.producthunt.com',
  args: [
    { name: 'query', type: 'string', required: true, positional: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 15, help: '最多返回几个(默认 15)' },
  ],
  columns: ['name', 'tagline', 'product_id'],
  pipeline: [
    { navigate: 'https://www.producthunt.com/search?q=${{ args.query }}' },
    { wait: { selector: '[data-test^="spotlight-result-product-"]', timeout: 15000 } },
    {
      evaluate: `(() => {
  const res = [...document.querySelectorAll('[data-test^="spotlight-result-product-"]')];
  return res.map((r) => {
    const id = (r.getAttribute('data-test') || '').replace('spotlight-result-product-', '');
    const thumb = r.querySelector('[data-test$="-thumbnail"]');
    let name = thumb ? (thumb.getAttribute('data-test') || '').replace(/-thumbnail$/, '') : '';
    const full = r.innerText.replace(/\\s+/g, ' ').trim();
    if (!name) name = (full.split(/ {2,}/)[0] || full).slice(0, 50);
    let tagline = name && full.startsWith(name) ? full.slice(name.length).trim() : full;
    tagline = tagline.replace(/[0-9,]+ reviews?$/, '').trim();
    return { name, tagline: tagline.slice(0, 100), product_id: id };
  }).filter((r) => r.name);
})()`,
    },
    { limit: '${{ args.limit }}' },
  ],
});
