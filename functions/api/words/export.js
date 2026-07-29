// Cloudflare Pages Functions: /api/words/export
// 存储模式：KV（强制）+ Pages 静态文件（KV 为空时作为种子返回，仅读取不写回）

const KV_KEY = "vocabulary_data";

function getKv(context) {
  const kv = context.env?.VOCABULARY_KV;
  if (!kv) return null;
  if (typeof kv.get !== "function") return null;
  return kv;
}

function normalizeData(data) {
  if (Array.isArray(data)) {
    return {
      toReviewWords: data.map((w) => ({
        word: w.word || "",
        translations: w.translations || [],
        phrases: w.phrases || [],
        nextReviewDate: "",
        correctCount: 0,
        wrongCount: 0,
      })),
      masteredWords: [],
      untrainedWords: [],
      vocabularyName: "词汇表",
    };
  }
  return {
    toReviewWords: Array.isArray(data?.toReviewWords) ? data.toReviewWords : [],
    masteredWords: Array.isArray(data?.masteredWords) ? data.masteredWords : [],
    untrainedWords: Array.isArray(data?.untrainedWords) ? data.untrainedWords : [],
    vocabularyName: typeof data?.vocabularyName === "string" ? data.vocabularyName : "词汇表",
  };
}

async function loadSeedFromStatic(context) {
  try {
    const assetUrl = new URL("/Vocabulary.json", context.request.url).toString();
    let res = null;
    if (context.env?.ASSETS) { try { res = await context.env.ASSETS.fetch(assetUrl); } catch (_) {} }
    if (!res || !res.ok) { try { res = await fetch(assetUrl); } catch (_) {} }
    if (res && res.ok) return JSON.parse(await res.text());
  } catch (_) {}
  return null;
}

async function readData(context) {
  const kv = getKv(context);
  if (kv) {
    try {
      const raw = await kv.get(KV_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error("KV read error (export):", e);
    }
  }
  // 回退：返回静态 Vocabulary.json（只读）
  const staticData = await loadSeedFromStatic(context);
  if (staticData) return staticData;
  return {
    toReviewWords: [],
    masteredWords: [],
    untrainedWords: [],
    vocabularyName: "词汇表",
  };
}

export async function onRequestGet(context) {
  try {
    const rawData = await readData(context);
    const data = normalizeData(rawData);
    const json = JSON.stringify(data, null, 2);
    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="wordData.json"',
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("Export error:", e);
    return new Response(
      JSON.stringify({ error: "导出失败：" + e.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
