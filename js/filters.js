(() => {
  const App = (window.App = window.App || {});
  const countNonEmptyLines = (text) => {
    return text.split("\n").reduce((acc, l) => acc + (l.trim() ? 1 : 0), 0);
  };
  const updateLinesFoundDisplay = () => {
    const refs = App.refs;
    const state = App.state;
    if (!refs || !state || !refs.linesFoundEl) return;
    const filterActive = (refs.loginpass && refs.loginpass.checked) || (refs.mailpass && refs.mailpass.checked);
    if (!refs.bigInput.value.trim()) {
      refs.linesFoundEl.textContent = "";
      return;
    }
    if (filterActive) {
      const total = countNonEmptyLines(state.originalResults || refs.bigInput.value);
      const filtered = countNonEmptyLines(refs.bigInput.value);
      refs.linesFoundEl.textContent = `${total} (${filtered})`;
    } else {
      const total = countNonEmptyLines(refs.bigInput.value);
      refs.linesFoundEl.textContent = `${total}`;
    }
  };
  const handleEditorInput = () => {
    const refs = App.refs;
    const state = App.state;
    if (!refs || !state) return;
    if (!refs.loginpass.checked && !refs.mailpass.checked) {
      state.originalResults = refs.bigInput.value;
    }
    if (App.ui && App.ui.updateLineNumbers) App.ui.updateLineNumbers();
    if (App.ui && App.ui.updateDownloadState) App.ui.updateDownloadState();
    updateLinesFoundDisplay();
  };
  const formatLine = (line) => {
    const match = line.match(/.*:([^:]+):([^:]+)$/);
    return match ? match[1] + ":" + match[2] : null;
  };
  const filterLoginPass = (text) => {
    return text
      .split("\n")
      .map((l) => formatLine(l))
      .filter((v) => v !== null)
      .join("\n");
  };
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const filterMailPass = (text) => {
    return text
      .split("\n")
      .map((l) => {
        const m = l.match(/.*:([^:]+):([^:]+)$/);
        if (!m) return null;
        const login = m[1];
        const pass = m[2];
        return isEmail(login) ? `${login}:${pass}` : null;
      })
      .filter((v) => v !== null)
      .join("\n");
  };
  const dedupeLines = (text) => {
    const seen = new Set();
    const out = [];
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out.join("\n");
  };
  const applyFilters = () => {
    const refs = App.refs;
    const state = App.state;
    if (!refs || !state) return;
    const anyFilter = (refs.loginpass && refs.loginpass.checked) || (refs.mailpass && refs.mailpass.checked);
    if (anyFilter) {
      if (!state.originalResults) state.originalResults = refs.bigInput.value;
      let filtered = state.originalResults;
      if (refs.mailpass && refs.mailpass.checked) {
        filtered = filterMailPass(state.originalResults);
      } else if (refs.loginpass && refs.loginpass.checked) {
        filtered = filterLoginPass(state.originalResults);
      }
      filtered = dedupeLines(filtered);
      refs.bigInput.value = filtered;
    } else {
      if (state.originalResults !== "") {
        refs.bigInput.value = state.originalResults;
      }
    }
    if (App.ui && App.ui.updateLineNumbers) App.ui.updateLineNumbers();
    if (App.ui && App.ui.updateDownloadState) App.ui.updateDownloadState();
    updateLinesFoundDisplay();
  };
  App.filters = {
    countNonEmptyLines,
    updateLinesFoundDisplay,
    handleEditorInput,
    formatLine,
    filterLoginPass,
    isEmail,
    filterMailPass,
    dedupeLines,
    applyFilters,
  };
})();
