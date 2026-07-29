#!/usr/bin/env node
/**
 * setup-kv.mjs
 * ----------------------------------------------------------
 * 一键设置 Cloudflare KV + 预灌 Vocabulary.json 初始数据
 * 执行步骤：
 *   1) 调用 wrangler whoami 确认已登录（未登录会先提示登录）
 *   2) 检查/创建名为 "vocabulary-kv" 的 KV 命名空间
 *   3) 读取 public/Vocabulary.json -> 转换为新格式（三列对象）
 *   4) 通过 wrangler kv key put 写入 KV，key = "vocabulary_data"
 *   5) 自动把 namespace id 写回 wrangler.toml 的 preview / production 绑定
 * ----------------------------------------------------------
 * 用法：
 *   首次： npx wrangler login  &&  npm run setup-kv
 *   之后： npm run setup-kv   (可重复执行：覆盖已有 KV 数据)
 */

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, ".");
const WRANGLER_TOML = resolve(ROOT, "wrangler.toml");
const VOCAB_FILE = resolve(ROOT, "public", "Vocabulary.json");
const KV_NAMESPACE_NAME = "vocabulary-kv";
const KV_KEY = "vocabulary_data";

const log = (m) => process.stdout.write("[setup-kv] " + m + "\n");
const err = (m) => process.stderr.write("[setup-kv][ERROR] " + m + "\n");
const run = (cmd, opts = {}) => {
  log("▶ " + cmd);
  return execSync(cmd, { stdio: "inherit", cwd: ROOT, shell: true, ...opts });
};
const qrun = (cmd, opts = {}) => {
  // quiet run - capture output
  return execSync(cmd, { cwd: ROOT, shell: true, encoding: "utf8", ...opts }).trim();
};

// ===== Step 0. 检查文件 =====
if (!existsSync(VOCAB_FILE)) {
  err("public/Vocabulary.json 不存在，无法预灌初始数据：" + VOCAB_FILE);
  process.exit(1);
}
log("找到词汇文件：" + VOCAB_FILE + "  (" + (readFileSync(VOCAB_FILE).length / 1024 / 1024).toFixed(2) + " MB)");

// ===== Step 1. 确认 wrangler 可用 + 登录状态 =====
try {
  qrun("npx --no-install wrangler --version");
} catch (_) {
  err("wrangler 未安装，请先运行  npm install");
  process.exit(1);
}

try {
  const who = qrun("npx --no-install wrangler whoami 2>&1 || true");
  if (/Not\s+authenticated|未登录|no valid auth|login required/i.test(who)) {
    err("未检测到 Cloudflare 登录。请先执行：  npx wrangler login");
    process.exit(2);
  }
  log("Cloudflare 登录状态：已登录");
} catch (e) {
  log("wrangler whoami 检查跳过：" + e.message);
}

// ===== Step 2. 创建 / 获取 KV namespace id =====
let namespaceId = null;

// 先列出所有 namespaces，看是否已存在 vocabulary-kv
let list = [];
try {
  const rawList = qrun("npx --no-install wrangler kv namespace list --json");
  const cleaned = rawList.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");  // 去掉 ANSI 颜色
  list = JSON.parse(cleaned);
} catch (_) {
  list = [];
}
const match = (list || []).find((n) => n.title === KV_NAMESPACE_NAME);
if (match && match.id) {
  namespaceId = match.id;
  log("复用已存在的 KV 命名空间：" + KV_NAMESPACE_NAME + " = " + namespaceId);
}

if (!namespaceId) {
  log("创建新的 KV 命名空间：" + KV_NAMESPACE_NAME);
  const createOut = qrun("npx --no-install wrangler kv namespace create " + KV_NAMESPACE_NAME);
  // 输出形如：
  //   ⛅️ wrangler 3.x
  //   ----------------
  //   Created kv namespace with title "vocabulary-kv" and id abc123...
  const m = createOut.match(/id\s+([a-f0-9]{8,})/i) || createOut.match(/([a-f0-9]{32,})/i);
  if (!m) {
    err("无法从创建输出中解析 namespace id。原始输出：\n" + createOut);
    process.exit(3);
  }
  namespaceId = m[1];
  log("创建成功，namespace id = " + namespaceId);
}

// ===== Step 3. 读取 Vocabulary.json 并转换为新格式 =====
log("解析 Vocabulary.json 并转换格式...");
const raw = JSON.parse(readFileSync(VOCAB_FILE, "utf8"));
let data;
if (Array.isArray(raw)) {
  const toReviewWords = raw.map((w) => ({
    word: w.word || "",
    translations: w.translations || [],
    phrases: w.phrases || [],
    nextReviewDate: "",
    correctCount: 0,
    wrongCount: 0,
  }));
  data = {
    toReviewWords,
    masteredWords: [],
    untrainedWords: [],
    vocabularyName: "词汇表",
  };
  log("旧数组格式转换完成：共 " + toReviewWords.length + " 个词移至记忆区（toReviewWords）");
} else {
  data = {
    toReviewWords: Array.isArray(raw.toReviewWords) ? raw.toReviewWords : [],
    masteredWords: Array.isArray(raw.masteredWords) ? raw.masteredWords : [],
    untrainedWords: Array.isArray(raw.untrainedWords) ? raw.untrainedWords : [],
    vocabularyName: raw.vocabularyName || "词汇表",
  };
  log("新格式直接使用：review=" + data.toReviewWords.length +
    " / mastered=" + data.masteredWords.length +
    " / untrained=" + data.untrainedWords.length);
}

const payload = JSON.stringify(data);
const payloadBytes = Buffer.byteLength(payload, "utf8");
log("待写入 KV 数据大小：" + (payloadBytes / 1024 / 1024).toFixed(2) + " MB");

// ===== Step 4. 写入 KV =====
log("写入 key = '" + KV_KEY + "' 到 KV 命名空间 " + namespaceId + " ...");

// wrangler kv:key put 需要 --namespace-id（或通过绑定名，但那样要解析 toml）
// 直接用 --namespace-id 最稳
try {
  // 由于 payload 可能>8MB，使用临时文件以避免命令行长度超限
  const tmpFile = resolve(ROOT, ".tmp-kv-payload.json");
  writeFileSync(tmpFile, payload, "utf8");
  run(
    'npx --no-install wrangler kv key put "' + KV_KEY + '" ' +
    '--namespace-id ' + namespaceId + ' ' +
    '--path "' + tmpFile + '"'
  );
  // 删除临时文件
  try { unlinkSync(tmpFile); } catch (_) {}
  log("✅ KV 写入成功！");
} catch (e) {
  err("KV 写入失败：" + e.message);
  err("你也可以手动写入：把转换后的 JSON 通过 npx wrangler kv key put vocabulary_data --namespace-id " + namespaceId + " --path <文件路径>");
  process.exit(4);
}

// ===== Step 5. 自动写回 wrangler.toml 绑定 =====
log("写入绑定到 wrangler.toml...");
let toml = existsSync(WRANGLER_TOML) ? readFileSync(WRANGLER_TOML, "utf8") : "";

// 替换 preview: # { binding = "VOCABULARY_KV", preview_id = "YOUR_KV_NAMESPACE_ID" }
toml = toml.replace(
  /#?\s*\{\s*binding\s*=\s*"VOCABULARY_KV"\s*,\s*preview_id\s*=\s*"[^"]*"\s*\}/,
  '{ binding = "VOCABULARY_KV", preview_id = "' + namespaceId + '" }'
);
// 替换 production
toml = toml.replace(
  /#?\s*\{\s*binding\s*=\s*"VOCABULARY_KV"\s*,\s*id\s*=\s*"[^"]*"\s*\}/,
  '{ binding = "VOCABULARY_KV", id = "' + namespaceId + '" }'
);
writeFileSync(WRANGLER_TOML, toml, "utf8");
log("✅ wrangler.toml 绑定已更新（preview_id & id = " + namespaceId + "）");

// ===== 完成 =====
log("");
log("══════════════════════════════════════════════════════════");
log("  ✅ KV 设置完成！");
log("");
log("  Namespace 名称： " + KV_NAMESPACE_NAME);
log("  Namespace ID：   " + namespaceId);
log("  Key：             " + KV_KEY);
log("  词汇条目：       " + data.toReviewWords.length + "（review）");
log("");
log("  本地调试：  npm run dev-kv     # 用 --kv 显式绑定跑 pages dev");
log("  直接部署：  npm run deploy     # 发布到 Cloudflare Pages");
log("══════════════════════════════════════════════════════════");
