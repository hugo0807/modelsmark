/**
 * 把「远端领先于本地」的 commit 镜像进本地对象库，并把远端自动快照里
 * 本地未改动的文件同步回工作区。
 *
 * 背景：
 *   scrape.yml 每周会在 CI 上自动提交 `chore(data): 每周快照 auto`，
 *   这些 commit 只存在于 GitHub 上。而 github.com:443 被 SNI 阻断，
 *   `git fetch` 走不通 —— 本地 HEAD 会一直停在旧位置。
 *   此时若直接跑 push-github-api.mjs：
 *     · `git rev-list <remoteSha>..HEAD` 会因 remoteSha 不是本地对象而报错；
 *     · 即便能推，PATCH ref 也是非快进，会被拒。
 *
 * 做法：
 *   1) 通过 Git Data API 读回缺失 commit 的原始字段，在本地按字节重建
 *      commit 对象（tree / parent / author / committer / message）。
 *      blob 与 tree 对象不必存在：Git 遍历历史只读 commit 对象，
 *      不 dereference tree（已实测 rev-list 正常）。
 *   2) 远端相对本地 base 变化的若干文件里，凡「本地工作区没动过」的
 *      （典型是 CI 爬虫写入的 data/snapshots/*），把远端版本下载覆盖，
 *      避免我们推送时把 CI 的最新快照回退成旧版。
 *
 * 校验：镜像出来的 commit SHA 必须与远端 SHA 完全一致，否则立即失败。
 * 这是硬性不变量 —— SHA 不一致说明作者时区等字节没还原对，继续往下走
 * 只会制造一条分叉历史。
 *
 * 用法：
 *   GITHUB_TOKEN=<pat> node scripts/sync-remote-ahead.mjs [owner/repo] [branch] [localBase]
 *   localBase 默认是执行前的本地 HEAD。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('缺少 GITHUB_TOKEN 环境变量');
  process.exit(1);
}

const REPO = process.argv[2] || 'hugo0807/modelsmark';
const BRANCH = process.argv[3] || 'main';
const BASE = process.argv[4] || null;
const API = 'https://api.github.com';
const [OWNER, REPO_NAME] = REPO.split('/');
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}
function gitBuf(args, input) {
  return execFileSync('git', args, { input, maxBuffer: 256 * 1024 * 1024 });
}

async function api(endpoint, attempt = 0) {
  const MAX = 4;
  try {
    const res = await fetch(API + endpoint, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'modelsmark-sync',
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`GET ${endpoint} → ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  } catch (e) {
    if (/\b(4\d\d)\b/.test(e.message) || attempt >= MAX - 1) throw e;
    const wait = 800 * (attempt + 1);
    console.log(`  ↻ ${endpoint.slice(0, 60)} 第 ${attempt + 1} 次失败，${wait}ms 后重试`);
    await new Promise((r) => setTimeout(r, wait));
    return api(endpoint, attempt + 1);
  }
}

/** ISO 8601（GitHub API 返回 UTC 或带偏移）→ git commit 里的 `epoch ±HHMM` */
function toGitDate(iso) {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/);
  if (!m) throw new Error(`无法解析 API 日期：${iso}`);
  const offset = m[3] === 'Z' ? '+0000' : m[3].replace(':', '');
  // git commit 里的 epoch 是绝对 UTC 秒数，tz 只是显示用偏移。
  // Date.parse 会把带偏移的 ISO 正确换算成 UTC epoch。
  const epoch = Math.floor(Date.parse(iso) / 1000);
  return `${epoch} ${offset}`;
}

function existsLocally(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 按远端字节格式重建 commit 对象并写入本地对象库。
 *
 * 坑：API 返回的 `message` 永远是无尾部换行版本，但远端实际存储的
 * message 可能有也可能没有 —— 用 `git commit` 生成的（例如 CI 每周
 * 快照）带 \n，用 Git Data API 生成的（我们自己的推送）不带。
 * message 是 SHA 的计算输入，差一个字节 SHA 就完全不同，所以两种
 * 形态都算一遍，取与远端 SHA 一致的那个再落盘。
 */
function mirrorCommit(d, expected) {
  const lines = [`tree ${d.tree.sha}`];
  for (const p of d.parents) lines.push(`parent ${p.sha}`);
  lines.push(`author ${d.author.name} <${d.author.email}> ${toGitDate(d.author.date)}`);
  lines.push(`committer ${d.committer.name} <${d.committer.email}> ${toGitDate(d.committer.date)}`);
  const header = lines.join('\n') + '\n\n';
  const stripped = d.message.replace(/\n+$/, '');
  const candidates = [...new Set([d.message, `${d.message}\n`, stripped, `${stripped}\n`])];
  let last = '';
  for (const msg of candidates) {
    const buf = Buffer.from(header + msg, 'utf8');
    // 先不带 -w 试算，避免把不匹配的字节也写进对象库
    const sha = gitBuf(['hash-object', '-t', 'commit', '--stdin'], buf).toString('utf8').trim();
    last = sha;
    if (sha === expected) {
      return gitBuf(['hash-object', '-t', 'commit', '-w', '--stdin'], buf).toString('utf8').trim();
    }
  }
  throw new Error(
    `镜像 SHA 不一致：远端 ${expected} / 重建 ${last}\n` +
      `  author=${d.author.date} committer=${d.committer.date}\n` +
      `  已尝试 ${candidates.length} 种 message 字节形态；多半是 API 把原始时区转成了 UTC。`
  );
}

async function main() {
  const ref = await api(`/repos/${OWNER}/${REPO_NAME}/git/ref/heads/${BRANCH}`);
  const remoteHead = ref.object.sha;
  const localHead = git('rev-parse', 'HEAD').trim();
  const base = BASE || localHead;
  console.log(`远端 ${BRANCH} = ${remoteHead}`);
  console.log(`本地 HEAD    = ${localHead}`);
  console.log(`本地 base    = ${base}\n`);

  // ── 1. 镜像远端缺失 commit ──────────────────────────────────
  const list = await api(`/repos/${OWNER}/${REPO_NAME}/commits?sha=${BRANCH}&per_page=100`);
  const missing = list.slice().reverse().filter((c) => !existsLocally(c.sha));
  console.log(`远端共 ${list.length} 个 commit，本地缺失 ${missing.length} 个`);

  for (const c of missing) {
    const d = await api(`/repos/${OWNER}/${REPO_NAME}/git/commits/${c.sha}`);
    mirrorCommit(d, c.sha);
    console.log(`  ✅ ${c.sha.slice(0, 10)} ${d.message.split('\n')[0].slice(0, 60)}`);
  }
  if (!existsLocally(remoteHead)) throw new Error('镜像后仍找不到远端 HEAD，终止');

  // ── 2. 把「远端改过、本地没动过」的文件同步回工作区 ──────────
  //    典型场景：CI 每周写的 data/snapshots/*，本地还是上上周的版本，
  //    若不覆盖，我们这次推送会把线上快照回退掉。
  const cmp = await api(`/repos/${OWNER}/${REPO_NAME}/compare/${base}...${BRANCH}`);
  const candidates = (cmp.files || []).map((f) => f.filename);
  console.log(`\n远端相对 base 变化 ${candidates.length} 个文件`);

  for (const path of candidates) {
    let touched = true;
    try {
      // 工作区（含 index）相对 base 是否有改动
      execFileSync('git', ['diff', '--quiet', base, '--', path], { stdio: 'ignore' });
      touched = false;
    } catch {
      touched = true;
    }
    const untracked = git('ls-files', '--others', '--exclude-standard', '--', path).trim() !== '';
    if (touched || untracked) {
      console.log(`  ⏭  ${path}（本地有改动，保留本地版本）`);
      continue;
    }
    const f = await api(
      `/repos/${OWNER}/${REPO_NAME}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${BRANCH}`
    );
    if (f.encoding !== 'base64') throw new Error(`${path} 返回了非 base64 内容`);
    const buf = Buffer.from(f.content.replace(/\s/g, ''), 'base64');
    writeFileSync(resolve(ROOT, path), buf);
    console.log(`  ⬇  ${path}（${buf.length} bytes，同步 CI 版本）`);
  }

  console.log(`\n✅ 完成。现在可以在本地基于 ${remoteHead} 创建新 commit 后推送。`);
  console.log(`   建议：git add -A && T=$(git write-tree) && git commit-tree $T -p ${remoteHead} -m "..."`);
}

main().catch((e) => {
  console.error(`\n❌ 同步失败：${e.message}`);
  process.exit(1);
});
