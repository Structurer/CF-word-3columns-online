// Cloudflare Pages Functions: /api/words
// -----------------------------------------------------------
// 存储模式：【Cloudflare KV（强制持久化）+ Pages 静态文件（作为首次初始化种子）】
// - 读：KV 优先，KV 为空时从静态 /Vocabulary.json 读取并自动回写 KV（一次性种子）
// - 写：仅写入 KV。KV 未绑定时返回明确错误，避免"假保存"
// - 不再使用内存缓存作为持久化回退（旧 memoryCache 仅保留种子后的单次加速）
// -----------------------------------------------------------

const KV_KEY = "vocabulary_data";

const DEFAULT_DATA = {
  toReviewWords: [],
  masteredWords: [],
  untrainedWords: [],
  vocabularyName: "词汇表",
};

// 仅用于"种子数据写入KV之后"到"本实例下次请求"之间的加速缓存
// 注意：跨实例/冷启动不会保留，真实数据始终以 KV 为准
let _seededCache = null;

function convertOldFormat(oldData) {
  const toReviewWords = oldData.map((wordItem) => ({
    word: wordItem.word || "",
    translations: wordItem.translations || [],
    phrases: wordItem.phrases || [],
    nextReviewDate: "",
    correctCount: 0,
    wrongCount: 0,
  }));
  return {
    toReviewWords,
    masteredWords: [],
    untrainedWords: [],
    vocabularyName: "词汇表",
  };
}

function normalizeData(data) {
  if (Array.isArray(data)) return convertOldFormat(data);
  if (typeof data === "object" && data !== null) {
    return {
      toReviewWords: Array.isArray(data.toReviewWords) ? data.toReviewWords : [],
      masteredWords: Array.isArray(data.masteredWords) ? data.masteredWords : [],
      untrainedWords: Array.isArray(data.untrainedWords) ? data.untrainedWords : [],
      vocabularyName: typeof data.vocabularyName === "string" ? data.vocabularyName : "词汇表",
    };
  }
  return { ...DEFAULT_DATA };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/**
 * 从 Pages 静态文件 /Vocabulary.json 读取种子数据（仅首次 KV 为空时调用一次）
 */
async function loadSeedFromStatic(context) {
  try {
    const assetUrl = new URL("/Vocabulary.json", context.request.url).toString();
    let res = null;
    if (context.env?.ASSETS) {
      try { res = await context.env.ASSETS.fetch(assetUrl); } catch (_) { res = null; }
    }
    if (!res || !res.ok) {
      try { res = await fetch(assetUrl); } catch (_) { res = null; }
    }
    if (!res || !res.ok) return null;
    const data = JSON.parse(await res.text());
    const count = Array.isArray(data) ? data.length : data?.toReviewWords?.length || 0;
    console.log("[KV-SEED] Loaded " + count + " words from static /Vocabulary.json");
    return data;
  } catch (e) {
    console.warn("[KV-SEED] Failed to load static Vocabulary.json:", e.message);
    return null;
  }
}

/**
 * 获取 KV 客户端（缺失时返回 null）
 */
function getKv(context) {
  const kv = context.env?.VOCABULARY_KV;
  if (!kv) return null;
  if (typeof kv.get !== "function" || typeof kv.put !== "function") return null;
  return kv;
}

/**
 * 读取数据（KV -> 静态种子 -> 空默认）
 */
async function readData(context) {
  const kv = getKv(context);

  if (kv) {
    try {
      const raw = await kv.get(KV_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
      // KV 存在但为空：尝试从静态种子加载并写回 KV 做初始化
      const staticData = await loadSeedFromStatic(context);
      if (staticData) {
        const normalized = normalizeData(staticData);
        try {
          await kv.put(KV_KEY, JSON.stringify(normalized));
          console.log("[KV-SEED] Successfully wrote seed data into KV (persisted)");
        } catch (e) {
          console.error("[KV-SEED] Failed to persist seed into KV:", e.message);
        }
        _seededCache = normalized;
        return normalized;
      }
    } catch (e) {
      console.error("KV read error:", e);
    }
  }

  // 没有 KV：仍然可以从静态种子读（只读模式），但 writeData 时会报错
  if (_seededCache) return _seededCache;
  const staticData = await loadSeedFromStatic(context);
  if (staticData) {
    const normalized = normalizeData(staticData);
    _seededCache = normalized;
    return normalized;
  }
  return null;
}

/**
 * 写入数据（仅 KV。无 KV 返回明确错误字符串）
 * @returns {string|null} 成功返回 null，失败返回错误信息
 */
async function writeData(context, data) {
  const kv = getKv(context);
  if (!kv) {
    return "缺少 Cloudflare KV 绑定（VOCABULARY_KV）。请在 wrangler.toml 或 Pages Dashboard 中配置 KV 命名空间后重试。参考命令：npx wrangler kv namespace create vocabulary-kv 然后运行 npm run setup-kv";
  }
  try {
    await kv.put(KV_KEY, JSON.stringify(data));
    _seededCache = data;
    return null;
  } catch (e) {
    console.error("KV write error:", e);
    return "KV 写入失败：" + e.message;
  }
}

// ============= 路由处理器 =============

export async function onRequestGet(context) {
  try {
    console.log("GET /api/words");
    const kv = getKv(context);
    let data = await readData(context);
    data = data ? normalizeData(data) : { ...DEFAULT_DATA };

    // 标识数据来源：'kv' = 真正来自 KV；'seed' = 来自静态种子（KV 未配置时的回退）
    const storageMode = kv ? "kv" : "seed";
    data._storageMode = storageMode;

    console.log(
      "GET /api/words -> storage=" + storageMode +
      " toReviewWords=" + data.toReviewWords.length +
      " masteredWords=" + data.masteredWords.length +
      " untrainedWords=" + data.untrainedWords.length
    );
    return jsonResponse(data);
  } catch (e) {
    console.error("GET /api/words error:", e);
    return jsonResponse({ error: "读取失败: " + e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const kv = getKv(context);
  if (!kv) {
    return jsonResponse({
      success: false,
      error:
        "保存失败：未检测到 Cloudflare KV 绑定 VOCABULARY_KV。\n" +
        "配置步骤：\n" +
        "  1) npx wrangler login\n" +
        "  2) npx wrangler kv namespace create vocabulary-kv\n" +
        "  3) 将生成的 id 填入 wrangler.toml 的 production/preview kv_namespaces 中，或在 Pages Dashboard 的 Settings -> Functions -> KV namespace bindings 中新增绑定 Variable = VOCABULARY_KV\n" +
        "  4)（可选）运行 npm run setup-kv 把 public/Vocabulary.json 预灌到 KV\n" +
        "  5) 重新部署 / 重启 wrangler pages dev",
    }, 503);
  }

  try {
    let body;
    try {
      body = await context.request.json();
    } catch (_) {
      return jsonResponse({ success: false, error: "请求体不是合法 JSON" }, 400);
    }

    const saveData = {
      toReviewWords: Array.isArray(body.toReviewWords) ? body.toReviewWords : [],
      masteredWords: Array.isArray(body.masteredWords) ? body.masteredWords : [],
      untrainedWords: Array.isArray(body.untrainedWords) ? body.untrainedWords : [],
      vocabularyName: typeof body.vocabularyName === "string" ? body.vocabularyName : "词汇表",
    };

    const err = await writeData(context, saveData);
    if (err) {
      return jsonResponse({ success: false, error: err }, 500);
    }
    console.log(
      "POST /api/words -> saved " + saveData.toReviewWords.length +
      " review / " + saveData.masteredWords.length +
      " mastered / " + saveData.untrainedWords.length + " untrained"
    );
    return jsonResponse({ success: true });
  } catch (e) {
    console.error("POST /api/words error:", e);
    return jsonResponse({ success: false, error: "保存失败：" + e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
