/**
 * .next/trace 文件打开失败补丁（Windows 专用）
 *
 * 背景：
 *   Next.js 15.5 在构建过程中通过 fs.createWriteStream 以 'a'（追加）模式
 *   打开 distDir/trace。构建主进程与多个 worker 进程会同时持有该文件的
 *   写入句柄。Windows 的文件共享语义比 POSIX 严格：当另一个句柄未以
 *   FILE_SHARE_WRITE 方式共享时，再次 open 会直接抛
 *     EPERM: operation not permitted, open '.next/trace'
 *   这与文件权限无关，是 Windows 特有的句柄冲突。
 *
 *   注意：trace 只是构建过程的分析产物（用于生成 build trace 报告），
 *   写不进去完全不影响构建产物（.next/ 与 out/）的正确性。
 *
 * 方案：
 *   1) 拦截 fs.open（createWriteStream 底层走的就是它），遇到 trace 路径
 *      的 EPERM / EBUSY 时，按指数退避重试若干次；
 *   2) 重试仍失败时，降级为写入同目录下的备用文件，保证构建不中断。
 *
 * 用法：node --require ./scripts/trace-patch.cjs
 * 通过 NODE_OPTIONS 预加载到 next build 子进程。
 */

const fs = require('fs');
const path = require('path');

const TRACE_PATTERN = /(^|[\\/])trace$/;
const MAX_RETRIES = 6;
const BASE_DELAY_MS = 120;

/** 判断是否是需要特殊处理的 trace 文件 */
function isTracePath(pathOrFd) {
  return typeof pathOrFd === 'string' && TRACE_PATTERN.test(pathOrFd);
}

/** 备用文件名，避免与被占用的原文件冲突 */
function fallbackPath(file) {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  return path.join(dir, `trace-fallback${ext}`);
}

let patched = 0;

function installPatch() {
  if (fs.__modelsmarkTracePatched) return;
  fs.__modelsmarkTracePatched = true;

  // ---- 异步回调版 fs.open：createWriteStream 的底层实现 ----
  const origOpen = fs.open;
  fs.open = function (pathOrFd, flags, ...rest) {
    const cb = rest.pop();
    if (!isTracePath(pathOrFd) || typeof cb !== 'function') {
      return origOpen.call(this, pathOrFd, flags, ...rest, cb);
    }

    const file = pathOrFd;
    let attempt = 0;

    const tryOpen = () => {
      origOpen.call(fs, file, flags, (err, fd) => {
        if (!err) {
          if (attempt > 0) {
            patched++;
            console.warn(
              `[trace-patch] .next/trace 被占用，重试 ${attempt} 次后成功`
            );
          }
          return cb(null, fd);
        }

        const retryable = err.code === 'EPERM' || err.code === 'EBUSY';
        if (retryable && attempt < MAX_RETRIES) {
          attempt++;
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          setTimeout(tryOpen, delay);
          return;
        }

        // 最终降级：写入备用文件，保证构建不中断
        if (retryable) {
          const alt = fallbackPath(file);
          patched++;
          console.warn(
            `[trace-patch] .next/trace 持续被占用（${err.code}），降级写入 ${path.basename(alt)}`
          );
          return origOpen.call(fs, alt, flags, cb);
        }

        return cb(err);
      });
    };

    return tryOpen();
  };

  // ---- 同步版 fs.openSync ----
  const origOpenSync = fs.openSync;
  fs.openSync = function (pathOrFd, flags, ...rest) {
    try {
      return origOpenSync.call(this, pathOrFd, flags, ...rest);
    } catch (err) {
      if (
        (err.code === 'EPERM' || err.code === 'EBUSY') &&
        isTracePath(pathOrFd)
      ) {
        const alt = fallbackPath(pathOrFd);
        patched++;
        console.warn(
          `[trace-patch] .next/trace 同步打开失败（${err.code}），降级写入 ${path.basename(alt)}`
        );
        return origOpenSync.call(this, alt, flags, ...rest);
      }
      throw err;
    }
  };

  // ---- Promise 版 fs.promises.open ----
  const origPromisesOpen = fs.promises.open;
  fs.promises.open = async function (pathOrFd, flags, ...rest) {
    let attempt = 0;
    for (;;) {
      try {
        return await origPromisesOpen.call(this, pathOrFd, flags, ...rest);
      } catch (err) {
        const retryable = err.code === 'EPERM' || err.code === 'EBUSY';
        if (!retryable || !isTracePath(pathOrFd) || attempt >= MAX_RETRIES) {
          if (retryable && isTracePath(pathOrFd)) {
            const alt = fallbackPath(pathOrFd);
            patched++;
            console.warn(
              `[trace-patch] .next/trace 异步打开持续失败（${err.code}），降级写入 ${path.basename(alt)}`
            );
            return origPromisesOpen.call(this, alt, flags, ...rest);
          }
          throw err;
        }
        attempt++;
        await new Promise((r) =>
          setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1))
        );
      }
    }
  };
}

installPatch();

module.exports = { installPatch };
