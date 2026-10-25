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
 * 关键点：next build 是被 spawn 成子进程运行的，父进程里改 fs 模块
 * 对子进程无效。因此这里把补丁抽成独立文件，通过 NODE_OPTIONS=--require
 * 预加载，让 next build 子进程也带上补丁。
 *
 * 用法：node scripts/build-compat.cjs
 * 仅影响本次 node 进程及其子进程，不修改全局配置。
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

/**
 * 安装补丁。若已安装（作为 --require 预加载被再次载入）则跳过。
 */
function installPatch() {
  if (fs.__modelsmarkTracePatched) return;
  fs.__modelsmarkTracePatched = true;

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
}

// 作为 --require 预加载时只装补丁，不启动构建
if (require.main !== module) {
  installPatch();
  module.exports = { installPatch, patchedCount: () => patched };
  return;
}

installPatch();

// 以补丁后的环境启动 next build
const nextBin = path.join(
  process.cwd(),
  'node_modules',
  'next',
  'dist',
  'bin',
  'next'
);

const isWindows = process.platform === 'win32';

const childEnv = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
};

if (isWindows) {
  // 通过 NODE_OPTIONS=--require 把补丁带进 next build 子进程。
  // 注意：必须用正斜杠 —— NODE_OPTIONS 的分词器会把反斜杠当转义符，
  // 导致模块路径解析失败（MODULE_NOT_FOUND）。
  const patchFile = path.join(__dirname, 'trace-patch.cjs').replace(/\\/g, '/');
  childEnv.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --require "${patchFile}"`.trim();
}

console.log('[build-compat] 启动 next build ...');
const result = spawnSync(process.execPath, [nextBin, 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: childEnv,
});

if (patched > 0) {
  console.log(`[build-compat] 本次构建降级处理 ${patched} 次`);
}
process.exit(result.status ?? 1);
