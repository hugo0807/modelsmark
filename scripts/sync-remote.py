#!/usr/bin/env python3
"""把远端 commit 对象精确重建到本地 git 对象库，并对齐分支。

国内网络下 github.com:443 直连被阻断，git fetch 不可用；但 api.github.com 可达。
GitHub API 生成的 commit 需要按 git 原始对象格式重建（tree/parent/author/committer/message），
才能得到与远端一致的 SHA，从而本地可以正常 update-ref。

用法: python scripts/sync-remote.py <PAT> [ref]
"""
import base64
import json
import subprocess
import sys
import urllib.request

REPO = "hugo0807/modelsmark"
API = "https://api.github.com"
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api_get(path, pat):
    req = urllib.request.Request(
        API + path,
        headers={
            "Authorization": f"Bearer {pat}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "modelsmark-sync",
        },
    )
    with OPENER.open(req, timeout=30) as r:
        return json.load(r)


def git(args, stdin=None):
    p = subprocess.run(["git"] + args, input=stdin, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(f"git {args}: {p.stderr.decode()[:300]}")
    return p.stdout


def write_tree(tree_sha, repo):
    """递归写入 tree/blob 对象到本地，返回 tree sha"""
    t = api_get(f"/repos/{repo}/git/trees/{tree_sha}", PAT)
    entries = []
    for e in t.get("tree", []):
        if e["type"] == "blob":
            b = api_get(f"/repos/{repo}/git/blobs/{e['sha']}", PAT)
            content = base64.b64decode(b["content"]) if b.get("content") else b""
            got = git(["hash-object", "-w", "--stdin"], stdin=content).decode().strip()
            assert got == e["sha"], f"blob sha mismatch {e['path']}: {got} != {e['sha']}"
            entries.append(f"{e['mode']} blob {e['sha']}\t{e['path']}")
        elif e["type"] == "tree":
            sub = write_tree(e["sha"], repo)
            entries.append(f"{e['mode']} tree {sub}\t{e['path']}")
    payload = ("\n".join(entries) + "\n").encode()
    got = git(["mktree"], stdin=payload).decode().strip()
    return got


def to_git_time(iso):
    """ISO8601(UTC) -> (epoch, tz)

    注意：GitHub API 返回的 date 是 UTC 时刻，但要还原出与本地 git 一致的
    原始对象，时区必须写成 +0800（本地提交所用时区），且 epoch 取该 UTC
    时刻对应的 epoch 值。用 +0000 会算出不同的 SHA。
    """
    import datetime

    dt = datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=datetime.timezone.utc
    )
    return int(dt.timestamp()), "+0800"


def build_commit(commit, repo):
    """按 git 原始格式重建 commit 对象，返回 sha"""
    tree = write_tree(commit["tree"]["sha"], repo)
    assert tree == commit["tree"]["sha"], f"tree mismatch {tree}"

    lines = [f"tree {tree}"]
    for p in commit.get("parents", []):
        lines.append(f"parent {p['sha']}")

    a_ts, a_tz = to_git_time(commit["author"]["date"])
    c_ts, c_tz = to_git_time(commit["committer"]["date"])
    lines.append(
        f"author {commit['author']['name']} <{commit['author']['email']}> {a_ts} {a_tz}"
    )
    lines.append(
        f"committer {commit['committer']['name']} <{commit['committer']['email']}> {c_ts} {c_tz}"
    )

    msg = commit["message"]
    # GitHub Git Data API 生成的 commit，消息结尾不带换行
    raw = ("\n".join(lines) + "\n\n" + msg).encode()
    got = git(["hash-object", "-w", "-t", "commit", "--stdin"], stdin=raw).decode().strip()
    return got


if __name__ == "__main__":
    PAT = sys.argv[1]
    ref = sys.argv[2] if len(sys.argv) > 2 else "main"
    sha = (
        api_get(f"/repos/{REPO}/git/ref/heads/{ref}", PAT)["object"]["sha"]
    )
    print(f"[sync] 远端 {ref} = {sha}")
    commit = api_get(f"/repos/{REPO}/git/commits/{sha}", PAT)
    got = build_commit(commit, REPO)
    print(f"[sync] 本地重建 = {got}  {'✓ 一致' if got == sha else '✗ 不一致'}")
    if got != sha:
        sys.exit(1)
    git(["update-ref", f"refs/remotes/origin/{ref}", sha])
    git(["reset", "--soft", sha])
    print(f"[sync] ✓ 本地已对齐 {ref} @ {sha[:12]}")
