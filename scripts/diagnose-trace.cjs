/**
 * 诊断脚本：拦截 fs.open / fs.promises.open，定位 Next.js 写 .next/trace 的确切调用方
 * 仅用于本地排查，不参与生产构建
 */
const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), '.next', 'trace');

function report(err, stack) {
  console.error('\n=== 捕获到 trace 打开失败 ===');
  console.error('错误:', err.code, err.syscall);
  console.error('调用栈:\n' + stack);
  process.exit(99);
}

const origOpenSync = fs.openSync;
fs.openSync = function (p, ...rest) {
  try {
    return origOpenSync.call(this, p, ...rest);
  } catch (e) {
    if (typeof p === 'string' && p.endsWith('trace') && e.code === 'EPERM') {
      report(e, new Error().stack);
    }
    throw e;
  }
};

const origOpen = fs.promises.open;
fs.promises.open = async function (p, ...rest) {
  try {
    return await origOpen.call(this, p, ...rest);
  } catch (e) {
    if (typeof p === 'string' && p.endsWith('trace') && e.code === 'EPERM') {
      report(e, new Error().stack);
    }
    throw e;
  }
};

process.on('uncaughtException', (e) => {
  if (e && e.code === 'EPERM' && typeof e.path === 'string' && e.path.endsWith('trace')) {
    report(e, e.stack || '（无堆栈）');
  }
  console.error(e);
  process.exit(1);
});

console.log('诊断补丁已加载，拦截目标:', target);
require('next/dist/bin/next');
