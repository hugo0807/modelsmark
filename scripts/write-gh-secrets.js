/**
 * 写入 GitHub Repository Secrets
 *
 * 用法：
 *   node scripts/write-gh-secrets.js <PAT> <name=value> [<name=value> ...]
 *
 * 依赖：tweetnacl（libsodium 的 JS 实现），GitHub Secrets API 要求用
 * 仓库公钥对明文做 sealed box 加密后再提交。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = process.env.GH_REPO || 'hugo0807/modelsmark';
const API = 'https://api.github.com';

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
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * 用仓库公钥做 sealed box 加密（libsodium crypto_box_seal）
 *
 * 格式：ephemeral_public_key(32) || nonce(24) || box_ciphertext
 * 对应 libsodium 的 crypto_box_seal，GitHub Secrets API 要求的正是此格式。
 */
function seal(publicKeyB64, plaintext) {
  const nacl = require('tweetnacl');

  // 仓库公钥：Curve25519 公钥（32 字节）
  const recipientPub = Buffer.from(publicKeyB64, 'base64');
  if (recipientPub.length !== nacl.box.publicKeyLength) {
    throw new Error(`公钥长度异常: ${recipientPub.length}`);
  }

  // 临时密钥对
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  // 用临时私钥 + 仓库公钥做 box 加密
  const cipher = nacl.box(
    Buffer.from(plaintext, 'utf8'),
    nonce,
    recipientPub,
    ephemeral.secretKey
  );

  return Buffer.concat([
    Buffer.from(ephemeral.publicKey),
    Buffer.from(nonce),
    Buffer.from(cipher),
  ]).toString('base64');
}

async function main() {
  const [pat, ...pairs] = process.argv.slice(2);
  if (!pat || !pairs.length) {
    console.error('用法: node write-gh-secrets.js <PAT> <name=value> [...]');
    process.exit(1);
  }

  const { key_id: keyId, key: publicKey } = await request(
    'GET',
    `/repos/${REPO}/actions/secrets/public-key`,
    pat
  );
  console.log(`[secrets] 仓库公钥已获取 (key_id=${keyId})`);

  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) {
      console.error(`[secrets] 格式错误（缺少 =）: ${pair}`);
      continue;
    }
    const name = pair.slice(0, idx);
    const value = pair.slice(idx + 1);

    const encrypted = seal(publicKey, value);
    await request('PUT', `/repos/${REPO}/actions/secrets/${name}`, pat, {
      encrypted_value: encrypted,
      key_id: keyId,
    });
    console.log(`[secrets] ✓ ${name} 已写入（值长度 ${value.length}）`);
  }

  // 写完后列一遍确认
  const list = await request('GET', `/repos/${REPO}/actions/secrets`, pat);
  console.log('[secrets] 当前仓库 secrets:', (list.secrets || []).map((s) => s.name).join(', ') || '(空)');
}

main().catch((err) => {
  console.error('[secrets] 失败:', err.message);
  process.exit(1);
});
