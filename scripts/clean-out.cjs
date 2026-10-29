/**
 * 构建前清理 out 目录。
 *
 * 为什么需要它：
 * Next.js 15 的 `output: 'export'` 在构建收尾阶段会先删除 out 再重写，
 * 而 WorkBuddy 环境把 fs.rm 换成了「安全删除」（移到回收站）实现，
 * 在 Windows 上回收站操作会失败（尤其是有文件被静态服务器占用时），
 * 导致构建报 "Build error occurred" 但退出码仍是 0 —— 产物停留在旧版本。
 *
 * 这里用 rename 把 out 移走（rename 不经过安全删除钩子），
 * 让 next build 面对一个不存在的目录，就不需要执行删除。
 *
 * 用法：
 *   node scripts/clean-out.cjs          构建前：out → .out_bak
 *   node scripts/clean-out.cjs --purge  构建后：删除 .out_bak
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'out');
const BAK = path.join(ROOT, '.out_bak');
const purge = process.argv.includes('--purge');

function rmSafe(target) {
  try {
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  } catch (e) {
    // 回收站失败不影响主流程：残留目录下次构建前再清
    console.warn(`  [clean-out] 清理 ${path.basename(target)} 失败：${e.message}`);
  }
}

if (purge) {
  rmSafe(BAK);
  console.log('[clean-out] 已清理 .out_bak');
} else {
  rmSafe(BAK);
  if (fs.existsSync(OUT)) {
    try {
      fs.renameSync(OUT, BAK);
      console.log('[clean-out] out 已移至 .out_bak');
    } catch (e) {
      console.warn(`[clean-out] 移走 out 失败（构建可能报错）：${e.message}`);
    }
  } else {
    console.log('[clean-out] out 不存在，跳过');
  }
}
