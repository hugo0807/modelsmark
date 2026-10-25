/**
 * Windows 构建兼容层
 *
 * 问题：Next.js 15.5 在 Windows 上创建 .next/trace 时会报
 *   EPERM: operation not permitted, open '.next/trace'
 * 原因是它用排他创建（'wx'）打开该文件，而 Windows 下该路径常被
 * 杀毒软件或索引服务短暂持有句柄，导致排他创建失败。
 *
 * 方案：拦截 fs.openSync / fs.promises.open，遇到 trace 文件且
 * 排他创建失败时，降级为普通创建（'w'）。trace 只是构建分析文件，
 * 降级不影响构建产物的正确性。
 *
 * 用法：node scripts/build-compat.cjs
 * 仅影响本次 node 进程，不修改全局配置。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TRACE_PATTERN = /(^|[\\/])trace$/;

/** 降级打开：把排他创建换成普通创建 */
function degradeFlags(flags) {
  if (typeof flags === 'string') {
    return flags.includes('x') ? flags.replace('x', '') : null;
  }
  if (typeof flags === 'number') {
    // O_EXCL = 0x80 (Windows), 0x200 (POSIX)
    return flags & ~0x80;
  }
  return null;
}

let patched = 0;

const origOpenSync = fs.openSync;
fs.openSync = function (pathOrFd, flags, ...rest) {
  try {
    return origOpenSync.call(this, pathOrFd, flags, ...rest);
  } catch (err) {
    if (
      err.code === 'EPERM' &&
      typeof pathOrFd === 'string' &&
      TRACE_PATTERN.test(pathOrFd)
    ) {
      const alt = degradeFlags(flags);
      if (alt !== null) {
        patched++;
        console.warn(
          `[build-compat] .next/trace 排他创建被拒，降级为普通创建（构建产物不受影响）`
        );
        return origOpenSync.call(this, pathOrFd, alt, ...rest);
      }
    }
    throw err;
  }
};

const origPromisesOpen = fs.promises.open;
fs.promises.open = async function (pathOrFd, flags, ...rest) {
  try {
    return await origPromisesOpen.call(this, pathOrFd, flags, ...rest);
  } catch (err) {
    if (
      err.code === 'EPERM' &&
      typeof pathOrFd === 'string' &&
      TRACE_PATTERN.test(pathOrFd)
    ) {
      const alt = degradeFlags(flags);
      if (alt !== null) {
        patched++;
        console.warn(
          `[build-compat] .next/trace 排他创建被拒，降级为普通创建（构建产物不受影响）`
        );
        return await origPromisesOpen.call(this, pathOrFd, alt, ...rest);
      }
    }
    throw err;
  }
};

// 以补丁后的环境启动 next build
const nextBin = path.join(
  process.cwd(),
  'node_modules',
  'next',
  'dist',
  'bin',
  'next'
);

console.log('[build-compat] 启动 next build ...');
const result = spawnSync(process.execPath, [nextBin, 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});

if (patched > 0) {
  console.log(`[build-compat] 本次构建降级处理 ${patched} 次`);
}
process.exit(result.status ?? 1);
