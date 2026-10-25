/**
 * 通过 GitHub Git Data API 推送提交
 *
 * 用途：国内网络下 github.com:443 直连被阻断（git push 报
 * "Failed to connect to github.com:443"），但 api.github.com 通常可达。
 * 本脚本用 Contents/Git Data API 完成等价于 `git push` 的操作，
 * 并且能正常触发 GitHub Actions 的 push 事件。
 *
 * 用法：
 *   node scripts/push-via-api.js <PAT> [文件...]
 *   node scripts/push-via-api.js <PAT>            # 推送全部已跟踪但未提交的改动
 *
 * 环境变量：
 *   GH_REPO    仓库，格式 owner/name，默认 hugo0807/modelsmark
 *   GH_BRANCH  目标分支，默认 main
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const REPO = process.env.GH_REPO || 'hugo0807/modelsmark';
const BRANCH = process.env.GH_BRANCH || 'main';
const API = 'https://api.github.com';
const ROOT = path.resolve(__dirname, '..');

function request(method, apiPath, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, API);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        method,
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'modelsmark-deploy',
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try {
            json = text ? JSON.parse(text) : {};
          } catch {
            json = { raw: text };
          }
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 400)}`));
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function getStagedFiles() {
  const out = git('diff', '--cached', '--name-only', '--diff-filter=ACMR');
  return out ? out.split('\n').filter(Boolean) : [];
}

function getStatusFiles() {
  // 已跟踪但有改动的文件（排除删除）
  const out = git('status', '--porcelain');
  const files = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    const file = line.slice(3).trim().replace(/^"(.*)"$/, '$1');
    if (code.includes('D')) continue;
    if (code.includes('?')) continue; // 未跟踪文件不自动纳入
    files.push(file);
  }
  return files;
}

async function main() {
  const [pat, ...explicit] = process.argv.slice(2);
  if (!pat) {
    console.error('用法: node push-via-api.js <PAT> [文件...]');
    process.exit(1);
  }

  const message = process.env.GH_COMMIT_MSG || 'chore: 通过 Git Data API 推送更新';

  // 1. 取远端分支 HEAD
  const ref = await request('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`, pat);
  const baseSha = ref.object.sha;
  const baseCommit = await request('GET', `/repos/${REPO}/git/commits/${baseSha}`, pat);
  const baseTree = baseCommit.tree.sha;
  console.log(`[push] 远端 ${BRANCH} HEAD = ${baseSha.slice(0, 12)}`);

  // 2. 确定要推送的文件
  let files = explicit.length ? explicit : getStagedFiles();
  if (!files.length) files = getStatusFiles();
  if (!files.length) {
    console.log('[push] 没有需要推送的改动');
    return;
  }
  console.log(`[push] 待推送文件 ${files.length} 个: ${files.join(', ')}`);

  // 3. 逐个创建 blob
  const treeEntries = [];
  for (const file of files) {
    const abs = path.join(ROOT, file);

    // 文件在本地已不存在 -> 视为删除（tree entry sha 置 null）
    if (!fs.existsSync(abs)) {
      treeEntries.push({
        path: file,
        mode: '100644',
        type: 'blob',
        sha: null,
      });
      console.log(`[push] 删除 ${file}`);
      continue;
    }

    const content = fs.readFileSync(abs);
    const blob = await request('POST', `/repos/${REPO}/git/blobs`, pat, {
      content: content.toString('base64'),
      encoding: 'base64',
    });
    treeEntries.push({
      path: file,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
    console.log(`[push] blob ${file} -> ${blob.sha.slice(0, 8)} (${content.length} bytes)`);
  }
  if (!treeEntries.length) {
    console.log('[push] 没有有效文件，跳过');
    return;
  }

  // 4. 创建 tree
  const tree = await request('POST', `/repos/${REPO}/git/trees`, pat, {
    base_tree: baseTree,
    tree: treeEntries,
  });
  console.log(`[push] tree -> ${tree.sha.slice(0, 12)}`);

  // 5. 创建 commit
  const commit = await request('POST', `/repos/${REPO}/git/commits`, pat, {
    message,
    tree: tree.sha,
    parents: [baseSha],
  });
  console.log(`[push] commit -> ${commit.sha.slice(0, 12)}`);

  // 6. 更新分支引用（非快进时用 force）
  const updated = await request('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, pat, {
    sha: commit.sha,
    force: false,
  });
  console.log(`[push] ✓ ${BRANCH} 已更新至 ${updated.object.sha.slice(0, 12)}`);
  console.log(`[push] 提交: ${message}`);
}

main().catch((err) => {
  console.error('[push] 失败:', err.message);
  process.exit(1);
});
