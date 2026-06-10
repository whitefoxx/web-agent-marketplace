// ../browser-agent/opencli/clis/douban/marks.js
import { cli, Strategy } from "@jackwener/opencli/registry";

// ../browser-agent/opencli/clis/douban/utils.js
import { ArgumentError, CliError, EmptyResultError } from "@jackwener/opencli/errors";
// ../browser-agent/opencli/clis/_shared/common.js

// ../browser-agent/opencli/clis/douban/utils.js
async function getSelfUid(page) {
  // F-15: resolve uid via an IN-PAGE fetch, NOT page.goto("/mine"). marks paginates
  // with a goto-loop below; mixing a goto here with those gotos makes the
  // /mine→/people redirect ping-pong against pagination across the re-exec
  // trampoline (each reinject restarts the func from the top, losing loop state)
  // → "exceeded 5 navigate-reinject cycles" (§10.21). Doing everything via fetch
  // keeps the whole command to ZERO main-tab navigations → one clean execution.
  // /mine 302-redirects to /people/<uid>/, so the resolved response URL carries it.
  const uid = await page.evaluate(`
    (async () => {
      try {
        const r = await fetch('https://movie.douban.com/mine', { credentials: 'include' });
        const m = (r.url || '').match(/people\\/([^/]+)/);
        if (m && m[1] && m[1] !== 'mine') return m[1];
        const txt = await r.text();
        const m2 = txt.match(/people\\/([A-Za-z0-9_-]+)\\//);
        return m2 ? m2[1] : '';
      } catch (e) {
        return '';
      }
    })()
  `);
  if (!uid || typeof uid !== "string") {
    throw new Error("Not logged in to Douban. Please login in Chrome first.");
  }
  return uid;
}

// ../browser-agent/opencli/clis/douban/marks.js
cli({
  site: "douban",
  name: "marks",
  access: "read",
  description: "导出个人观影标记",
  domain: "movie.douban.com",
  strategy: Strategy.COOKIE,
  args: [
    {
      name: "status",
      default: "collect",
      choices: ["collect", "wish", "do", "all"],
      help: "标记类型: collect(看过), wish(想看), do(在看), all(全部)"
    },
    { name: "limit", type: "int", default: 50, help: "导出数量， 0 表示全部" },
    { name: "uid", help: "用户ID，不填则使用当前登录账号" }
  ],
  columns: ["title", "year", "myRating", "myStatus", "myDate", "myComment", "url"],
  func: async (page, kwargs) => {
    const { status = "collect", limit = 50, uid: providedUid } = kwargs;
    const uid = providedUid || await getSelfUid(page);
    const statuses = status === "all" ? ["collect", "wish", "do"] : [status];
    const allMarks = [];
    for (const s of statuses) {
      const remaining = limit > 0 ? limit - allMarks.length : 0;
      if (limit > 0 && remaining <= 0)
        break;
      const marks = await fetchMarks(page, uid, s, remaining);
      allMarks.push(...marks);
    }
    return allMarks.slice(0, limit > 0 ? limit : void 0);
  }
});
async function fetchMarks(page, uid, status, limit) {
  const marks = [];
  let offset = 0;
  const pageSize = 15;
  while (true) {
    const url = `https://movie.douban.com/people/${uid}/${status}?start=${offset}&sort=time&rating=all&filter=all&mode=grid`;
    // F-15: fetch + parse the page IN-PAGE (no page.goto) so pagination makes zero
    // main-tab navigations and the func runs to completion in one execution.
    const pageMarks = await page.evaluate(`
      (async () => {
        const resp = await fetch(${JSON.stringify(url)}, { credentials: 'include' });
        if (!resp.ok) return [];
        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const results = [];

        const items = doc.querySelectorAll('.item');

        items.forEach(item => {
          const titleLink = item.querySelector('.info a[href*="/subject/"]');
          if (!titleLink) return;
          
          const titleEl = titleLink.querySelector('em');
          const titleText = titleEl?.textContent?.trim() || titleLink.textContent?.trim() || '';
          const title = titleText.split('/')[0].trim();
          const href = titleLink.href || '';
          
          const idMatch = href.match(/subject\\/(\\d+)/);
          const movieId = idMatch ? idMatch[1] : '';
          
          if (!movieId || !title) return;
          
          const ratingSpan = item.querySelector('span[class*="rating"]');
          let myRating = null;
          if (ratingSpan) {
            const cls = ratingSpan.className || '';
            const ratingMatch = cls.match(/rating(\\d)-t/);
            if (ratingMatch) {
              myRating = parseInt(ratingMatch[1], 10) * 2;
            }
          }
          
          const dateSpan = item.querySelector('.date');
          const myDate = dateSpan?.textContent?.trim() || '';
          
          const commentSpan = item.querySelector('.comment');
          const myComment = commentSpan?.textContent?.trim() || '';
          
          const introSpan = item.querySelector('.intro');
          let year = '';
          if (introSpan) {
            const introText = introSpan.textContent || '';
            const yearMatch = introText.match(/(\\d{4})/);
            year = yearMatch ? yearMatch[1] : '';
          }
          
          results.push({
            movieId,
            title,
            year,
            myRating,
            myStatus: '${status}',
            myComment,
            myDate,
            url: href || 'https://movie.douban.com/subject/' + movieId
          });
        });
        
        return results;
      })()
    `);
    if (!pageMarks || pageMarks.length === 0)
      break;
    marks.push(...pageMarks);
    if (pageMarks.length < pageSize)
      break;
    if (limit > 0 && marks.length >= limit)
      break;
    offset += pageSize;
    await new Promise((resolve) => setTimeout(resolve, 1e3));
  }
  return marks;
}
