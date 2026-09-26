// 漸進增強的列表篩選。每個 li 以 data-f-<key> 標記值。
export function initFilters() {
  for (const form of document.querySelectorAll<HTMLFormElement>('[data-filter-form]')) {
    const listId = form.dataset.filterForm!;
    const list = document.getElementById(listId);
    if (!list) continue;
    const items = [...list.querySelectorAll<HTMLElement>(':scope > li')];
    const count = form.querySelector<HTMLElement>('[data-filter-count]');
    const empty = form.nextElementSibling as HTMLElement | null;
    const selects = [...form.querySelectorAll<HTMLSelectElement>('select')];
    const params = new URLSearchParams(location.search);
    for (const s of selects) {
      const v = params.get(s.name);
      if (v && [...s.options].some((o) => o.value === v)) s.value = v;
    }

    const apply = () => {
      let shown = 0;
      for (const li of items) {
        const ok = selects.every((s) => !s.value || li.dataset[`f${s.name[0]!.toUpperCase()}${s.name.slice(1)}`] === s.value);
        li.hidden = !ok;
        if (ok) shown++;
      }
      if (count) count.textContent = `顯示 ${shown} / ${items.length} 項`;
      if (empty?.hasAttribute('data-filter-empty')) empty.hidden = shown > 0;
      list.hidden = shown === 0;
      const q = new URLSearchParams(location.search);
      for (const s of selects) (s.value ? q.set(s.name, s.value) : q.delete(s.name));
      const qs = q.toString();
      history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
    };
    form.addEventListener('change', apply);
    form.addEventListener('reset', () => setTimeout(apply));
    form.addEventListener('submit', (e) => e.preventDefault());
    apply();
  }
}
