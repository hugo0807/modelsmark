#!/usr/bin/env python3
"""写入 GitHub Repository Secrets

用法：
    python scripts/write-gh-secrets.py <PAT> <name=value> [<name=value> ...]

GitHub Secrets API 要求用仓库公钥对明文做 libsodium sealed box 加密
（crypto_box_seal），再把 `ephemeral_public_key(32) || nonce(24) || ciphertext`
整体做 base64 提交。

⚠️ 必须用 PyNaCl 的 `nacl.public.SealedBox`（或 libsodium 的 crypto_box_seal）。
tweetnacl 的 `nacl.box.before` / `nacl.secretbox` 手搓组合**不被 GitHub 接受**，
会返回：
    422 Bad request - validation failed due to an improperly encrypted secret

依赖：pip install pynacl
"""

import base64
import json
import sys
import urllib.error
import urllib.request

from nacl.encoding import Base64Encoder
from nacl.public import PublicKey, SealedBox

REPO = "hugo0807/modelsmark"
API = "https://api.github.com"
# 绕过系统代理（国内网络下 api.github.com 直连更快）
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(method, path, token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "modelsmark-deploy",
            **({"Content-Type": "application/json"} if data else {}),
        },
    )
    try:
        with _opener.open(req, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="replace")[:300]}


def seal(public_key_b64, plaintext):
    """libsodium crypto_box_seal 等价实现。

    输出字节布局：ephemeral_public_key(32) || nonce(24) || secretbox_ciphertext
    """
    public_key = PublicKey(public_key_b64.encode("utf-8"), encoder=Base64Encoder)
    sealed = SealedBox(public_key).encrypt(plaintext.encode("utf-8"))
    return base64.b64encode(sealed).decode("utf-8")


def main():
    if len(sys.argv) < 3:
        print("用法: python write-gh-secrets.py <PAT> <name=value> [...]", file=sys.stderr)
        sys.exit(1)

    pat = sys.argv[1]
    pairs = sys.argv[2:]

    code, pk = api("GET", f"/repos/{REPO}/actions/secrets/public-key", pat)
    if code != 200:
        print(f"[secrets] 获取仓库公钥失败 HTTP {code}: {pk}", file=sys.stderr)
        print(
            "[secrets] 请确认 PAT 拥有 Repository permissions → Secrets: Read and write",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"[secrets] 仓库公钥已获取 (key_id={pk['key_id']})")

    for pair in pairs:
        if "=" not in pair:
            print(f"[secrets] 格式错误（缺少 =）: {pair}", file=sys.stderr)
            continue
        name, value = pair.split("=", 1)
        encrypted = seal(pk["key"], value)
        code, resp = api(
            "PUT",
            f"/repos/{REPO}/actions/secrets/{name}",
            pat,
            {"encrypted_value": encrypted, "key_id": pk["key_id"]},
        )
        if code in (201, 204):
            verb = "已创建" if code == 201 else "已更新"
            print(f"[secrets] ✓ {name} {verb}（值长度 {len(value)}）")
        else:
            print(f"[secrets] ✗ {name} 写入失败 HTTP {code}: {resp}", file=sys.stderr)
            sys.exit(1)

    code, lst = api("GET", f"/repos/{REPO}/actions/secrets", pat)
    names = [s["name"] for s in lst.get("secrets", [])]
    print(f"[secrets] 当前仓库 secrets: {', '.join(names) or '(空)'}")


if __name__ == "__main__":
    main()
