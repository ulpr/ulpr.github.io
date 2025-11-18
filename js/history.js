(() => {
  const App = (window.App = window.App || {});
  const normalizeQuery = (q) => q.trim().replace(/\s+/g, " ");
  const readHistory = () => {
    try {
      const arr = JSON.parse(localStorage.getItem("history") || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  const saveSearchQuery = () => {
    const refs = App.refs;
    if (!refs || !refs.requestInput) return;
    const raw = refs.requestInput.value.trim();
    if (!raw) return;
    let arr;
    try {
      arr = JSON.parse(localStorage.getItem("history") || "[]");
      if (!Array.isArray(arr)) arr = [];
    } catch {
      arr = [];
    }
    const norm = normalizeQuery(raw);
    const exists = arr.some((x) => normalizeQuery(String(x)) === norm);
    if (!exists) {
      arr.push(raw);
      localStorage.setItem("history", JSON.stringify(arr));
    }
  };
  const removeFromHistory = (value) => {
    const norm = normalizeQuery(String(value || ""));
    let arr = [];
    try {
      const parsed = JSON.parse(localStorage.getItem("history") || "[]");
      arr = Array.isArray(parsed) ? parsed : [];
    } catch {}
    arr = arr.filter((x) => normalizeQuery(String(x)) !== norm);
    localStorage.setItem("history", JSON.stringify(arr));
  };
  const closeHistoryDropdown = () => {
    const refs = App.refs;
    const state = App.state;
    if (!refs || !state) return;
    refs.historyDropdown.classList.remove("open");
    state.historyOpen = false;
  };
  const openHistoryDropdown = (filter = "") => {
    const refs = App.refs;
    const state = App.state;
    if (!refs || !state) return;
    if (state.searching) return;
    state.currentHistoryFilter = String(filter || "");
    const data = readHistory();
    const q = state.currentHistoryFilter.trim().toLowerCase();
    const src = q ? data.filter((x) => String(x).toLowerCase().includes(q)) : data;
    let list = src.slice().reverse().slice(0, 50);
    if (!list.length && data.length) {
      state.currentHistoryFilter = "";
      const all = data.slice().reverse().slice(0, 50);
      if (!all.length) {
        closeHistoryDropdown();
        return;
      }
      list = all;
    }
    if (!list.length) {
      closeHistoryDropdown();
      return;
    }
    refs.historyDropdown.innerHTML = "";
    for (const item of list) {
      const div = document.createElement("div");
      div.className = "history-item";
      div.title = item;
      const text = document.createElement("div");
      text.className = "history-item-text";
      text.textContent = item;
      const btn = document.createElement("div");
      btn.className = "history-item-remove";
      btn.setAttribute("aria-label", "Remove");
      btn.textContent = "×";
      div.addEventListener("mousedown", (e) => {
        if (e.target === btn) return;
        e.preventDefault();
        refs.requestInput.value = item;
        if (App.ui && App.ui.updateSearchState) App.ui.updateSearchState();
      });
      div.addEventListener("click", (e) => {
        if (e.target === btn) return;
        closeHistoryDropdown();
        refs.requestInput.focus();
      });
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeFromHistory(item);
        openHistoryDropdown(state.currentHistoryFilter);
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      div.appendChild(text);
      div.appendChild(btn);
      refs.historyDropdown.appendChild(div);
    }
    refs.historyDropdown.classList.add("open");
    state.historyOpen = true;
  };
  App.history = {
    normalizeQuery,
    readHistory,
    saveSearchQuery,
    removeFromHistory,
    openDropdown: openHistoryDropdown,
    closeDropdown: closeHistoryDropdown,
  };
})();
