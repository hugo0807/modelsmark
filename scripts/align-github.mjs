/**
 * 本地与 GitHub 远端对齐（当 github.com:443 被 SNI 阻断、只能走 API 时使用）。
 *
 * 背景：
 *   通过 Git Data API 推送时，GitHub 会把 commit message 的尾部换行 strip 掉
 *   （实测：传 "x\n" 和传 "x"，存储结果都是 "x"）。而本地 git commit 的
 *   message 永远以 \n 结尾。message 是 commit 对象 SHA 的计算输入，于是：
 *     - tree / blob 完全一致
 *     - author / committer 也一致（GitHub 保留了原始时区 +0800，
 *       API 只是把 date 显示成 UTC，别被这点误导）
 *     - 但 commit hash 对不上
 *
 *   结果是本地与远端分叉成两条等价历史，后续 git push 变成非快进被拒。
 *
 * 做法：
 *   从 API 读回远端 commit 的原始字段，在本地按字节重建 commit 对象
 *   （git hash-object -t commit -w --stdin）。因为 tree / parent / message
 *   与远端一致，author/committer 直接沿用本地原始行（保留时区偏移），
 *   重建出的 SHA 就等于远端 SHA。写进本地对象库后把 refs 指过去 ——
 *   本地和远端成为同一条历史线，后续 git push / git fetch 正常互操作。
 *
 * 用法：
 *   GITHUB_TOKEN=<pat> node scripts/align-github.mjs [owner/repo] [branch]
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('缺少 GITHUB_TOKEN 环境变量');
  process.exit(1);
}

const REPO = process.argv[2] || 'hugo0807/modelsmark';
const BRANCH = process.argv[3] || 'main';
const API = 'https://api.github.com';
const [OWNER, REPO_NAME] = REPO.split('/');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

async function api(endpoint) {
  const res = await fetch(API + endpoint, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'modelsmark-align',
    },
  });
  if (!res.ok) throw new Error(`GET ${endpoint} → ${res.status} ${res.statusText}`);
  return res.json();
}

/** 本地是否已有这个 commit 对象 */
function existsLocally(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 本地 commit 的原始 author / committer 行（含时区偏移）。
 * GitHub 保留了原始偏移，所以直接沿用本地这一行即可。
 */
function identityLines(localSha) {
  const raw = git('cat-file', 'commit', localSha);
  const author = raw.match(/^author (.*)$/m)?.[1];
  const committer = raw.match(/^committer (.*)$/m)?.[1];
  if (!author || !committer) throw new Error(`无法解析本地 commit ${localSha} 的作者信息`);
  return { author, committer };
}

/**
 * 构建本地索引：tree + message → 本地 commit sha。
 * 远端与本地的 tree 完全一致，message 只差一个尾部换行。
 */
function buildLocalIndex() {
  const map = new Map();
  const shas = git('rev-list', '--all').split('\n').filter(Boolean);
  for (const sha of shas) {
    const tree = git('rev-parse', `${sha}^{tree}`).trim();
    let message;
    try {
      const raw = git('cat-file', 'commit', sha);
      const sep = raw.indexOf('\n\n');
      message = raw.slice(sep + 2).replace(/\n+$/, '');
    } catch {
      continue;
    }
    map.set(`${tree}:${message.length}:${message}`, sha);
  }
  return map;
}

/** 按远端格式构造 commit 对象字节并写入本地对象库 */
function writeRemoteStyleCommit({ tree, parents, authorLine, committerLine, message }) {
  const lines = [`tree ${tree}`];
  for (const p of parents) lines.push(`parent ${p}`);
  lines.push(`author ${authorLine}`);
  lines.push(`committer ${committerLine}`);
  // 远端 message 无尾部换行 —— GitHub API 的存储格式
  const raw = lines.join('\n') + '\n\n' + message;
  const sha = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], {
    input: raw,
    encoding: 'utf8',
  }).trim();
  return sha;
}

export async function align({ repo = REPO, branch = BRANCH } = {}) {
  const list = await api(
    `/repos/${OWNER}/${REPO_NAME}/commits?sha=${branch}&per_page=100`
  );
  const remote = list.slice().reverse(); // 旧 → 新
  const remoteHead = remote[remote.length - 1].sha;

  console.log(`远端 ${branch} 共 ${remote.length} 个 commit，HEAD = ${remoteHead.slice(0, 10)}`);

  const localHead = git('rev-parse', 'HEAD').trim();
  if (localHead === remoteHead) {
    console.log('✅ 本地与远端已是同一个 commit，无需对齐');
    return { aligned: 0, remoteHead };
  }

  const index = buildLocalIndex();
  let aligned = 0;
  let failed = 0;

  for (const c of remote) {
    if (existsLocally(c.sha)) continue; // 本地已有

    const detail = await api(`/repos/${OWNER}/${REPO_NAME}/git/commits/${c.sha}`);
    const tree = detail.tree.sha;
    const message = detail.message; // API 返回的即远端存储格式（无尾部换行）

    const localSha = index.get(`${tree}:${message.length}:${message}`);
    if (!localSha) {
      console.log(`  ⚠️ ${c.sha.slice(0, 8)} 找不到本地对应 commit（tree/message 未匹配）`);
      failed++;
      continue;
    }

    const { author, committer } = identityLines(localSha);
    const built = writeRemoteStyleCommit({
      tree,
      parents: detail.parents.map((p) => p.sha),
      authorLine: author,
      committerLine: committer,
      message,
    });

    if (built === c.sha) {
      aligned++;
      console.log(`  ✅ ${c.sha.slice(0, 8)} ${message.split('\n')[0].slice(0, 46)}`);
    } else {
      failed++;
      console.log(`  ❌ ${c.sha.slice(0, 8)} 重建为 ${built.slice(0, 8)}，不一致`);
    }
  }

  if (failed) {
    throw new Error(`有 ${failed} 个 commit 未能对齐，远端 ref 未改动`);
  }

  // 安全阀：reset --hard 会把工作区拉回远端 HEAD 的内容。
  // 如果本地还有未推送的改动（文件被改过或新增），这一步会把它们抹掉 ——
  // 曾经就踩过：本地新增的脚本被 reset 掉了。所以先拦一道。
  const dirty = git('status', '--porcelain').trim();
  if (dirty) {
    console.log('\n⚠️ 工作区有未提交改动，先存到 stash 再对齐：');
    console.log(
      dirty
        .split('\n')
        .slice(0, 10)
        .map((l) => '   ' + l)
        .join('\n')
    );
    git('stash', 'push', '--include-untracked', '-m', `mm-align-${Date.now()}`);
    console.log('   已 stash（对齐后可 git stash pop 取回）');
  }

  // 指向远端 HEAD
  git('update-ref', 'refs/heads/main', remoteHead);
  git('update-ref', `refs/remotes/origin/${BRANCH}`, remoteHead);
  git('reset', '--hard', remoteHead);

  const now = git('rev-parse', 'HEAD').trim();
  console.log(`\n对齐 ${aligned} 个 commit`);
  console.log(`本地 main → ${now}`);
  console.log(`远端 main → ${remoteHead}`);
  console.log(now === remoteHead ? '✅ 已对齐，后续可正常 git push' : '⚠️ 仍未对齐');

  return { aligned, remoteHead };
}

// 直接运行时执行对齐（用 pathToFileURL 比较 —— Windows 下手动拼
// file:// 会出现斜杠数量不一致，直接运行会静默不执行）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  align().catch((e) => {
    console.error(`\n❌ 对齐失败：${e.message}`);
    process.exit(1);
  });
}
