/**
 * 通过 GitHub Git Data API 推送本地提交（不走 git:// / https:// 协议）。
 *
 * 为什么需要这个：
 * 部分网络环境下 github.com:443 被 SNI 阻断（同一 IP 用 api.github.com 的
 * SNI 通、用 github.com 的 SNI 不通），标准 `git push` 无法建立连接。
 * 但 api.github.com 通常是通的，且 GitHub 的 Git Database API 完全兼容
 * Git 的 SHA-1 内容寻址 —— 本地算出的 blob/tree SHA 就是 GitHub 上需要的 SHA。
 *
 * 所以这里的做法是：把本地对象「搬运」到 GitHub，逐个重建 commit，
 * 并保持 parent 链完整（历史不丢）。因为传入了原始 author/committer
 * 与时区偏移，生成的 commit SHA 与本地完全一致 —— 推送后本地
 * `git log` 和 GitHub 上的历史是同一条线。
 *
 * 用法：
 *   GITHUB_TOKEN=<pat> node scripts/push-github-api.mjs [owner/repo] [branch]
 *
 * Token 需具备 repo 权限。脚本不写入任何凭据文件，只读环境变量。
 */
import { execFileSync } from 'node:child_process';

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('缺少 GITHUB_TOKEN 环境变量');
  process.exit(1);
}

const REPO = process.argv[2] || 'hugo0807/modelsmark';
const BRANCH = process.argv[3] || 'main';
const API = 'https://api.github.com';
const [OWNER, REPO_NAME] = REPO.split('/');

let apiCalls = 0;

/** 调用 GitHub REST API */
async function api(method, endpoint, body) {
  apiCalls++;
  const res = await fetch(API + endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'modelsmark-deploy',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} → ${res.status} ${res.statusText}\n${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** 执行 git 命令，返回 stdout 字符串 */
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** epoch + "+0800" → ISO 8601 带偏移（GitHub 要求这种格式，且保留原时区） */
function isoWithOffset(epoch, offset) {
  const sign = offset.startsWith('-') ? -1 : 1;
  const offSec =
    sign * (parseInt(offset.slice(1, 3), 10) * 3600 + parseInt(offset.slice(3, 5), 10) * 60);
  const d = new Date((epoch + offSec) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const oh = Math.floor(Math.abs(offSec) / 3600);
  const om = Math.floor((Math.abs(offSec) % 3600) / 60);
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}` +
    `${sign > 0 ? '+' : '-'}${p(oh)}:${p(om)}`
  );
}

/** 解析 `git cat-file commit <sha>` 的头部 */
function parseCommit(raw) {
  const sep = raw.indexOf('\n\n');
  const header = raw.slice(0, sep);
  let body = raw.slice(sep + 2);
  // Git 存储的 message 总是以 \n 结尾；GitHub API 会自己补回，所以去掉尾 \n
  body = body.replace(/\n+$/, '');
  const info = { tree: null, parents: [], author: null, committer: null };
  for (const line of header.split('\n')) {
    const m = line.match(/^(tree|parent|author|committer) (.+)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'tree') info.tree = value;
    else if (key === 'parent') info.parents.push(value);
    else {
      const pm = value.match(/^(.*) <([^>]*)> (\d+) ([+-]\d{4})$/);
      if (pm) {
        info[key] = {
          name: pm[1],
          email: pm[2],
          date: isoWithOffset(parseInt(pm[3], 10), pm[4]),
        };
      }
    }
  }
  return { ...info, message: body };
}

/** 解析 `git ls-tree <treeSha>` 的顶层条目 */
function lsTree(treeSha) {
  const out = git('ls-tree', treeSha);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split('\t');
      const [mode, type, sha] = meta.split(/\s+/);
      return { path, mode, type, sha };
    });
}

const treeCache = new Map();
const blobCache = new Map();

/** 确保 blob 在 GitHub 上存在（内容寻址 → 幂等，SHA 与本地一致） */
async function ensureBlob(sha) {
  if (blobCache.has(sha)) return sha;
  const content = execFileSync('git', ['cat-file', 'blob', sha], {
    maxBuffer: 256 * 1024 * 1024,
  });
  const b64 = Buffer.from(content).toString('base64');
  const r = await api('POST', `/repos/${OWNER}/${REPO_NAME}/git/blobs`, {
    content: b64,
    encoding: 'base64',
  });
  if (r.sha !== sha) {
    console.warn(`  ⚠️ blob SHA 不一致：本地 ${sha} / 远端 ${r.sha}`);
  }
  blobCache.set(sha, r.sha);
  return r.sha;
}

/** 递归确保 tree 在 GitHub 上存在（自底向上），返回 GitHub 侧 tree SHA */
async function ensureTree(treeSha) {
  if (treeCache.has(treeSha)) return treeCache.get(treeSha);
  const entries = lsTree(treeSha);
  const resolved = [];
  for (const e of entries) {
    if (e.type === 'tree') {
      const sub = await ensureTree(e.sha);
      resolved.push({ path: e.path, mode: e.mode, type: 'tree', sha: sub });
    } else if (e.type === 'blob') {
      const b = await ensureBlob(e.sha);
      resolved.push({ path: e.path, mode: e.mode, type: 'blob', sha: b });
    } else {
      // commit（submodule）—— 本项目没有，遇到就跳过
      resolved.push({ path: e.path, mode: e.mode, type: e.type, sha: e.sha });
    }
  }
  const r = await api('POST', `/repos/${OWNER}/${REPO_NAME}/git/trees`, { tree: resolved });
  if (r.sha !== treeSha) {
    console.warn(`  ⚠️ tree SHA 不一致：本地 ${treeSha} / 远端 ${r.sha}`);
  }
  treeCache.set(treeSha, r.sha);
  return r.sha;
}

async function main() {
  console.log(`仓库 ${REPO} · 分支 ${BRANCH}\n`);

  // 1. 远端分支现状
  let remoteSha = null;
  try {
    const ref = await api('GET', `/repos/${OWNER}/${REPO_NAME}/git/ref/heads/${BRANCH}`);
    remoteSha = ref.object.sha;
    console.log(`远端 ${BRANCH} = ${remoteSha}`);
  } catch (e) {
    console.log(`远端 ${BRANCH} 不存在，将新建`);
  }

  // 2. 待推送的 commit（拓扑序：parents 在前）
  const localHead = git('rev-parse', 'HEAD').trim();
  const range = remoteSha ? `${remoteSha}..HEAD` : 'HEAD';
  const commits = git('rev-list', '--reverse', '--topo-order', range)
    .split('\n')
    .filter(Boolean);

  if (!commits.length) {
    console.log('没有需要推送的 commit');
    return;
  }
  console.log(`待推送 ${commits.length} 个 commit\n`);

  // 3. 逐个重建 commit
  const shaMap = new Map(); // 本地 sha → GitHub sha
  let parentForNext = remoteSha;

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    const info = parseCommit(git('cat-file', 'commit', c));
    const tree = await ensureTree(info.tree);

    // parents 用 GitHub 侧已存在的 sha
    const parents = info.parents.map((p) => shaMap.get(p) || p);
    if (parentForNext && !parents.includes(parentForNext)) {
      // 快进链：第一个 commit 的 parent 必须是远端当前 head
      if (i === 0 && parents.length === 0 && remoteSha) parents.push(remoteSha);
    }

    const r = await api('POST', `/repos/${OWNER}/${REPO_NAME}/git/commits`, {
      message: info.message,
      tree,
      parents,
      author: info.author,
      committer: info.committer,
    });
    shaMap.set(c, r.sha);
    parentForNext = r.sha;

    const same = r.sha === c;
    console.log(
      `  [${i + 1}/${commits.length}] ${c.slice(0, 8)} → ${r.sha.slice(0, 8)} ` +
        `${same ? '✅ SHA 一致' : '⚠️ SHA 不同（内容已同步）'}  ${info.message.split('\n')[0].slice(0, 46)}`
    );
  }

  const finalSha = shaMap.get(localHead) || parentForNext;

  // 4. 更新分支引用
  await api('PATCH', `/repos/${OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`, {
    sha: finalSha,
    force: false,
  });

  console.log(`\n✅ ${BRANCH} 已更新到 ${finalSha}`);
  console.log(`   API 调用 ${apiCalls} 次`);

  // 5. 复核
  const head = await api('GET', `/repos/${OWNER}/${REPO_NAME}/commits/${BRANCH}`);
  console.log(`   远端 HEAD: ${head.sha}  ${head.commit.message.split('\n')[0]}`);
  console.log(`   本地 HEAD: ${localHead}`);
  console.log(
    head.sha === localHead
      ? '   🎉 本地与 GitHub 历史完全一致（可直接 git push / git fetch 互操作）'
      : '   本地与远端 SHA 不同，但历史与内容一致（可用 git fetch 后 reset 对齐）'
  );
}

main().catch((e) => {
  console.error(`\n❌ 推送失败：${e.message}`);
  process.exit(1);
});
