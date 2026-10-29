/* 原型交互：移动导航 + 表格搜索/筛选/排序/展开（无框架依赖） */

document.addEventListener('click', function (e) {
  const t = e.target.closest('.nav-toggle');
  if (t) {
    const nav = document.querySelector('.nav');
    if (nav) nav.classList.toggle('open');
  }
  const tip = e.target.closest('.tip');
  if (tip) tip.classList.toggle('show');
});

function initTable(root) {
  const table = root.querySelector('table.data');
  if (!table) return;
  const input = root.querySelector('[data-search]');
  const chips = Array.from(root.querySelectorAll('[data-f]'));
  const expandBtn = root.querySelector('[data-expand]');
  const countEl = root.querySelector('[data-count]');
  const body = table.tBodies[0];
  const rows = Array.from(body.rows).filter((r) => !r.classList.contains('chan-band'));

  let activeFilter = 'all';
  let sortKey = null;
  let sortDir = 1;
  let expanded = false;

  const cellValue = (row, key) => {
    const td = row.querySelector(`[data-k="${key}"]`);
    if (!td) return null;
    const v = td.getAttribute('data-v');
    if (v === null || v === '') return td.textContent.trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  function apply() {
    const q = (input && input.value ? input.value : '').trim().toLowerCase();
    let shown = 0;
    rows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      const matchQ = !q || text.indexOf(q) >= 0;
      const matchF =
        activeFilter === 'all' ||
        (row.getAttribute('data-tags') || '').split(' ').indexOf(activeFilter) >= 0;
      const visible = matchQ && matchF;
      row.hidden = !visible;
      if (visible) shown += 1;
    });

    // 折叠态：只保留前 N 行可见
    const limit = parseInt(root.getAttribute('data-limit') || '0', 10);
    if (limit > 0 && !expanded) {
      let n = 0;
      rows.forEach((row) => {
        if (row.hidden) return;
        n += 1;
        if (n > limit) row.hidden = true;
      });
    }

    if (countEl) countEl.textContent = `显示 ${Math.min(shown, limit > 0 && !expanded ? limit : shown)} / ${rows.length} 条`;
    if (expandBtn) {
      expandBtn.textContent = expanded ? '收起' : `展开全部 ${rows.length} 个`;
      expandBtn.hidden = limit === 0;
    }
  }

  function sortBy(key) {
    sortDir = sortKey === key ? -sortDir : 1;
    sortKey = key;
    const frag = document.createDocumentFragment();
    rows
      .slice()
      .sort((a, b) => {
        const va = cellValue(a, key);
        const vb = cellValue(b, key);
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
        return String(va).localeCompare(String(vb), 'zh-CN') * sortDir;
      })
      .forEach((r) => frag.appendChild(r));
    body.appendChild(frag);
    apply();
  }

  if (input) input.addEventListener('input', apply);

  chips.forEach((chip) => {
    chip.addEventListener('click', function () {
      chips.forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
      activeFilter = chip.getAttribute('data-f');
      apply();
    });
  });

  Array.from(table.tHead.rows[0].cells).forEach((th) => {
    const key = th.getAttribute('data-key');
    if (!key) return;
    th.title = '点击排序';
    th.addEventListener('click', () => sortBy(key));
  });

  if (expandBtn) {
    expandBtn.addEventListener('click', function () {
      expanded = !expanded;
      apply();
    });
  }

  apply();
}

document.querySelectorAll('[data-table]').forEach(initTable);
