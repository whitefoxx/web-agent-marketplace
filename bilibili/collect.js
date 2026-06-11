// ../browser-agent/opencli/clis/bilibili/collect.js
import { cli, Strategy } from "@jackwener/opencli/registry";
import { ArgumentError, AuthRequiredError, CommandExecutionError } from "@jackwener/opencli/errors";
import https from "node:https";

function resolveBvid(input) {
  const trimmed = String(input).trim();
  if (/^BV[A-Za-z0-9]+$/i.test(trimmed)) {
    return Promise.resolve(trimmed);
  }
  try {
    const parsed = new URL(trimmed);
    if (/(\.|^)bilibili\.com$/i.test(parsed.hostname)) {
      const match = parsed.pathname.match(/\/(?:video|bangumi\/play)\/(BV[A-Za-z0-9]+)/i);
      if (match) {
        return Promise.resolve(match[1]);
      }
    }
  } catch {
  }
  const shortCode = trimmed.replace(/^https?:\/\//, "").replace(/^(www\.)?b23\.tv\//, "");
  if (!/^[A-Za-z0-9]+$/.test(shortCode)) {
    return Promise.reject(new Error(`Cannot resolve BV ID from invalid b23.tv short code: ${trimmed}`));
  }
  const url = "https://b23.tv/" + shortCode;
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const location = res.headers.location;
      if (location) {
        const match = location.match(/\/video\/(BV[A-Za-z0-9]+)/);
        if (match) {
          res.resume();
          resolve(match[1]);
          return;
        }
      }
      res.resume();
      reject(new Error(`Cannot resolve BV ID from short URL: ${trimmed}`));
    });
    req.on("error", reject);
    req.setTimeout(4e3, () => {
      req.destroy();
      reject(new Error(`Timeout resolving short URL: ${trimmed}`));
    });
  });
}
var MIXIN_KEY_ENC_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52];
function payloadData(payload) {
  return payload?.data ?? payload;
}
async function getNavData(page) {
  return page.evaluate(`
    async () => {
      const res = await fetch('https://api.bilibili.com/x/web-interface/nav', { credentials: 'include' });
      return await res.json();
    }
  `);
}
async function getWbiKeys(page) {
  const nav = await getNavData(page);
  const wbiImg = nav?.data?.wbi_img ?? {};
  const imgUrl = wbiImg.img_url ?? "";
  const subUrl = wbiImg.sub_url ?? "";
  const imgKey = imgUrl.split("/").pop()?.split(".")[0] ?? "";
  const subKey = subUrl.split("/").pop()?.split(".")[0] ?? "";
  return { imgKey, subKey };
}
function getMixinKey(imgKey, subKey) {
  const raw = imgKey + subKey;
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i] || "").join("").slice(0, 32);
}
async function md5(text) {
  const { createHash } = await import("node:crypto");
  return createHash("md5").update(text).digest("hex");
}
async function wbiSign(page, params) {
  const { imgKey, subKey } = await getWbiKeys(page);
  const mixinKey = getMixinKey(imgKey, subKey);
  const wts = Math.floor(Date.now() / 1e3);
  const sorted = {};
  const allParams = { ...params, wts: String(wts) };
  for (const key of Object.keys(allParams).sort()) {
    sorted[key] = String(allParams[key]).replace(/[!'()*]/g, "");
  }
  const query = new URLSearchParams(sorted).toString().replace(/\+/g, "%20");
  const wRid = await md5(query + mixinKey);
  sorted.w_rid = wRid;
  return sorted;
}
async function apiGet(page, path, opts = {}) {
  const baseUrl = "https://api.bilibili.com";
  let params = opts.params ?? {};
  if (opts.signed) {
    params = await wbiSign(page, params);
  }
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString().replace(/\+/g, "%20");
  const url = `${baseUrl}${path}?${qs}`;
  return fetchJson(page, url);
}
async function fetchJson(page, url) {
  const urlJs = JSON.stringify(url);
  return page.evaluate(`
    async () => {
      const res = await fetch(${urlJs}, { credentials: "include" });
      return await res.json();
    }
  `);
}
async function apiPost(page, path, opts = {}) {
  const params = opts.params ?? {};
  const stringified = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const paramsJs = JSON.stringify(stringified);
  const urlJs = JSON.stringify(`https://api.bilibili.com${path}`);
  return page.evaluate(`
    async () => {
      const csrf = (document.cookie.match(/bili_jct=([^;]+)/) || [])[1] || "";
      const body = new URLSearchParams(${paramsJs});
      body.set("csrf", csrf);
      const res = await fetch(${urlJs}, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { code: -1, message: "Non-JSON response (HTTP " + res.status + "): " + text.slice(0, 200) };
      }
    }
  `);
}
async function getSelfUid(page) {
  const nav = await getNavData(page);
  const mid = nav?.data?.mid;
  if (!mid)
    throw new AuthRequiredError("bilibili.com");
  return String(mid);
}
function isAuthLikeBilibiliError(code, message) {
  return code === -101 || code === -111 || code === -403 || /csrf|登录|账号|权限|forbidden|permission|login/i.test(String(message ?? ""));
}
function requireOkPayload(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Object.hasOwn(payload, "code")) {
    throw new CommandExecutionError(`Bilibili ${label} API returned a malformed payload`);
  }
  if (payload.code !== 0) {
    const message = payload.message ?? "unknown error";
    if (isAuthLikeBilibiliError(payload.code, message)) {
      throw new AuthRequiredError("bilibili.com", `Bilibili ${label} API requires login or permission: ${message} (${payload.code})`);
    }
    throw new CommandExecutionError(`Bilibili ${label} API failed: ${message} (${payload.code})`);
  }
  return payload.data;
}

// ../browser-agent/opencli/clis/bilibili/collect.js
cli({
  site: "bilibili",
  name: "collect",
  access: "write",
  description: "收藏 / 取消收藏 B站视频(官方 API,需登录;同一工具正反向:--action add|remove)",
  domain: "www.bilibili.com",
  strategy: Strategy.COOKIE,
  args: [
    { name: "bvid", required: true, positional: true, help: "Video BV ID / URL / b23.tv short link" },
    { name: "action", default: "add", help: 'add(收藏) or remove(取消收藏)' },
    { name: "fid", type: "int", help: "目标收藏夹 media_id;省略=默认收藏夹" },
    { name: "execute", type: "boolean", help: "Actually perform the write. Without it the command refuses to write." }
  ],
  columns: ["bvid", "aid", "action", "fid", "status"],
  func: async (page, kwargs) => {
    if (!page) {
      throw new CommandExecutionError("Browser session required for bilibili collect");
    }
    const action = String(kwargs.action ?? "add").toLowerCase();
    if (action !== "add" && action !== "remove") {
      throw new ArgumentError(`bilibili collect --action must be "add" or "remove", got: ${action}`);
    }
    if (!kwargs.execute) {
      throw new ArgumentError(`Refusing to ${action} favorite: pass --execute to actually ${action === "add" ? "collect" : "remove"} this video`);
    }
    let bvid;
    try {
      bvid = await resolveBvid(kwargs.bvid);
    } catch (error) {
      throw new ArgumentError(`Cannot resolve Bilibili BV ID from input: ${String(kwargs.bvid ?? "")}`, error instanceof Error ? error.message : String(error));
    }
    const view = await apiGet(page, "/x/web-interface/view", { params: { bvid } });
    const viewData = requireOkPayload(view, "view");
    const aid = viewData?.aid;
    if (!aid) {
      throw new CommandExecutionError(`Cannot resolve aid for bvid: ${bvid}`);
    }
    let fid = kwargs.fid != null ? Number(kwargs.fid) : null;
    if (!fid) {
      const uid = await getSelfUid(page);
      const foldersPayload = await apiGet(page, "/x/v3/fav/folder/created/list-all", {
        params: { up_mid: uid },
        signed: true
      });
      const folders = payloadData(foldersPayload)?.list ?? [];
      if (!folders.length) {
        throw new CommandExecutionError("No bilibili favorite folder found for this account");
      }
      const def = folders.find((f) => Number(f.attr) === 0) ?? folders[0];
      fid = def.id;
    }
    const params = {
      rid: aid,
      type: 2,
      platform: "web",
      ...action === "add" ? { add_media_ids: String(fid) } : { del_media_ids: String(fid) }
    };
    const payload = await apiPost(page, "/x/v3/fav/resource/deal", { params });
    requireOkPayload(payload, action === "add" ? "favorite add" : "favorite remove");
    return [{
      bvid,
      aid: String(aid),
      action,
      fid: String(fid),
      status: action === "add" ? "collected" : "removed"
    }];
  }
});
var __test__ = {
  resolveBvid,
  getMixinKey,
  requireOkPayload,
  isAuthLikeBilibiliError
};
export {
  __test__
};
