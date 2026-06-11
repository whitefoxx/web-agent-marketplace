// ../browser-agent/opencli/clis/zhihu/unlike.js
import { CliError, CommandExecutionError } from "@jackwener/opencli/errors";
import { cli, Strategy } from "@jackwener/opencli/registry";

// ../browser-agent/opencli/clis/zhihu/target.js
var USER_RE = /^user:([A-Za-z0-9_-]+)$/;
var QUESTION_RE = /^question:(\d+)$/;
var ANSWER_RE = /^answer:(\d+):(\d+)$/;
var ARTICLE_RE = /^article:(\d+)$/;
var USER_PATH_RE = /^\/people\/([A-Za-z0-9_-]+)\/?$/;
var QUESTION_PATH_RE = /^\/question\/(\d+)\/?$/;
var ANSWER_PATH_RE = /^\/question\/(\d+)\/answer\/(\d+)\/?$/;
var ARTICLE_PATH_RE = /^\/p\/(\d+)\/?$/;
var EMPTY_AUTHORITY_RE = /^https:\/\/(?::)?@/i;
function isAllowedZhihuUrl(url) {
  return url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "";
}
function parseTarget(input) {
  const value = String(input).trim();
  if (EMPTY_AUTHORITY_RE.test(value)) {
    throw new CliError("INVALID_INPUT", "Zhihu write commands require a normal HTTPS Zhihu URL without malformed authority", "Example: https://www.zhihu.com/question/123456");
  }
  if (value.startsWith("answer:") && !ANSWER_RE.test(value)) {
    throw new CliError("INVALID_INPUT", "Invalid answer target, expected answer:<questionId>:<answerId>", "Example: opencli zhihu unlike answer:123:456 --execute");
  }
  let match = value.match(USER_RE);
  if (match) {
    return { kind: "user", slug: match[1], url: `https://www.zhihu.com/people/${match[1]}` };
  }
  match = value.match(QUESTION_RE);
  if (match) {
    return { kind: "question", id: match[1], url: `https://www.zhihu.com/question/${match[1]}` };
  }
  match = value.match(ANSWER_RE);
  if (match) {
    return {
      kind: "answer",
      questionId: match[1],
      id: match[2],
      url: `https://www.zhihu.com/question/${match[1]}/answer/${match[2]}`
    };
  }
  match = value.match(ARTICLE_RE);
  if (match) {
    return { kind: "article", id: match[1], url: `https://zhuanlan.zhihu.com/p/${match[1]}` };
  }
  try {
    const url = new URL(value);
    if (!isAllowedZhihuUrl(url)) {
      throw new Error("unsupported zhihu url variant");
    }
    if (url.hostname === "www.zhihu.com") {
      const userMatch = url.pathname.match(USER_PATH_RE);
      if (userMatch) {
        const slug = userMatch[1];
        return { kind: "user", slug, url: `https://www.zhihu.com/people/${slug}` };
      }
      const questionMatch = url.pathname.match(QUESTION_PATH_RE);
      if (questionMatch) {
        return { kind: "question", id: questionMatch[1], url: `https://www.zhihu.com/question/${questionMatch[1]}` };
      }
      const answerMatch = url.pathname.match(ANSWER_PATH_RE);
      if (answerMatch) {
        return {
          kind: "answer",
          questionId: answerMatch[1],
          id: answerMatch[2],
          url: `https://www.zhihu.com/question/${answerMatch[1]}/answer/${answerMatch[2]}`
        };
      }
    }
    if (url.hostname === "zhuanlan.zhihu.com") {
      const articleMatch = url.pathname.match(ARTICLE_PATH_RE);
      if (articleMatch) {
        return { kind: "article", id: articleMatch[1], url: `https://zhuanlan.zhihu.com/p/${articleMatch[1]}` };
      }
    }
  } catch {
  }
  throw new CliError("INVALID_INPUT", "Zhihu write commands require a Zhihu URL or typed target like question:123 or answer:123:456", "Example: opencli zhihu unlike answer:123:456 --execute");
}
function assertAllowedKinds(command, target) {
  const allowed = {
    unlike: ["answer", "article"]
  };
  if (!allowed[command]?.includes(target.kind)) {
    throw new CliError("UNSUPPORTED_TARGET", `zhihu ${command} does not support ${target.kind} targets`);
  }
  return target;
}

// ../browser-agent/opencli/clis/zhihu/write-shared.js
var RESULT_ROW_RESERVED_KEYS = /* @__PURE__ */ new Set(["status", "outcome", "message", "target_type", "target"]);
function requireExecute(kwargs) {
  if (!kwargs.execute) {
    throw new CliError("INVALID_INPUT", "This Zhihu write command requires --execute");
  }
}
function buildResultRow(message, targetType, target, outcome, extra = {}) {
  for (const key of Object.keys(extra)) {
    if (RESULT_ROW_RESERVED_KEYS.has(key)) {
      throw new CliError("INVALID_INPUT", `Result extra field cannot overwrite reserved key: ${key}`);
    }
  }
  return [{ status: "success", outcome, message, target_type: targetType, target, ...extra }];
}

// ../browser-agent/opencli/clis/zhihu/unlike.js
cli({
  site: "zhihu",
  name: "unlike",
  access: "write",
  description: "取消赞:移除你对某条知乎回答/文章的赞(reverse of zhihu__like; POST voters type=neutral)",
  domain: "zhihu.com",
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: "target", positional: true, required: true, help: "Zhihu target URL or typed target (answer/article)" },
    { name: "execute", type: "boolean", help: "Actually perform the write action" }
  ],
  columns: ["status", "outcome", "message", "target_type", "target"],
  func: async (page, kwargs) => {
    if (!page)
      throw new CommandExecutionError("Browser session required for zhihu unlike");
    requireExecute(kwargs);
    const rawTarget = String(kwargs.target);
    const target = assertAllowedKinds("unlike", parseTarget(rawTarget));
    await page.goto("https://www.zhihu.com");
    await page.wait(2);
    const apiResult = await page.evaluate(`(async () => {
            var targetKind = ${JSON.stringify(target.kind)};
            var targetId = ${JSON.stringify(target.id)};
            var resourceType = targetKind === 'answer' ? 'answers' : 'articles';
            var url = 'https://www.zhihu.com/api/v4/' + resourceType + '/' + targetId + '/voters';
            var resp = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'neutral' }),
            });
            var data = await resp.json();
            if (!resp.ok) return { ok: false, message: data.error ? data.error.message : 'unknown error' };
            if (data && data.success === false) return { ok: false, message: 'Zhihu unlike API reported success=false' };
            return { ok: true, voting: data.voting, voteup_count: data.voteup_count };
        })()`);
    if (!apiResult?.ok) {
      throw new CliError("COMMAND_EXEC", apiResult?.message || "Failed to unlike");
    }
    return buildResultRow(`Unliked ${target.kind} ${target.id}`, target.kind, rawTarget, "applied", { voteup_count: apiResult.voteup_count });
  }
});
