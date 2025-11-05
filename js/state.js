(() => {
  const App = (window.App = window.App || {});

  const refs = {
    fileInput: document.getElementById("fileInput"),
    uploadFileButton: document.getElementById("uploadFileButton"),
    uploadFolderButton: document.getElementById("uploadFolderButton"),
    searchButton: document.getElementById("searchButton"),
    downloadResultsButton: document.getElementById("downloadResultsButton"),
    fileNameEl: document.getElementById("fileName"),
    databaseCell: document.getElementById("databaseCell"),
    requestInput: document.getElementById("requestInput"),
    inputPanel: document.getElementById("inputPanel"),
    bigInput: document.getElementById("bigInput"),
    lineNumbers: document.getElementById("lineNumbers"),
    timeSpentEl: document.getElementById("timeSpent"),
    linesFoundEl: document.getElementById("fileSize"),
    currentSpeedEl: document.getElementById("CurrentSpeed"),
    showFileNamesEl: document.getElementById("showFileNames"),
    caseSensitiveEl: document.getElementById("caseSensitive"),
    heading: document.querySelector("h1"),
    loginpass: document.getElementById("loginpass"),
    mailpass: document.getElementById("mailpass"),
  };

  App.refs = refs;

  const state = {
    hasDatabase: false,
    selectedFiles: [],
    searching: false,
    originalResults: "",
  };

  App.state = state;

  const hasRequestText = () => refs.requestInput.value.trim().length > 3;

  const setSearchButtonState = () => {
    const enabled = hasRequestText() && state.hasDatabase && !state.searching;
    refs.searchButton.classList.toggle("enabled", enabled);
    document.body.classList.toggle("searching", state.searching);
    if (refs.heading) {
      refs.heading.textContent = state.searching ? "Searching..." : "Search requests [ULPR]";
    }
    const disabled = state.searching;
    refs.showFileNamesEl.disabled = disabled;
    refs.caseSensitiveEl.disabled = disabled;
    refs.requestInput.disabled = disabled;
    refs.bigInput.disabled = disabled;
    refs.uploadFileButton.style.pointerEvents = disabled ? "none" : "";
    refs.uploadFolderButton.style.pointerEvents = disabled ? "none" : "";
    refs.downloadResultsButton.style.pointerEvents = disabled ? "none" : "";
    refs.currentSpeedEl.style.display = state.searching ? "" : "none";
    [refs.loginpass, refs.mailpass].forEach((cb) => {
      if (!cb) return;
      cb.disabled = disabled || cb.disabled;
      const label = cb.closest(".settings-checkbox");
      if (label) label.classList.toggle("disabled", disabled || cb.disabled);
    });
  };

  const setDownloadButtonState = () => {
    const hasLines = refs.bigInput.value.split("\n").some((l) => l.trim().length > 0);
    refs.downloadResultsButton.classList.toggle("disabled", !hasLines);
    const disableFilters = state.searching || !hasLines;
    [refs.loginpass, refs.mailpass].forEach((cb) => {
      if (!cb) return;
      cb.disabled = disableFilters;
      const label = cb.closest(".settings-checkbox");
      if (label) label.classList.toggle("disabled", disableFilters);
    });
  };

  const extractFolderName = (files) => {
    const first = files[0];
    const rel = first.webkitRelativePath || "";
       if (rel.includes("/")) return rel.split("/")[0];
    const name = first.name || "";
    return name.includes(".") ? null : name;
  };

  const describeFiles = (files) => {
    const arr = Array.from(files || []);
    if (!arr.length) return { label: "", tooltip: "", hasDb: false };
    const folder = extractFolderName(arr);
    const names = arr.map((f) => f.name);
    let label = "";
    if (folder) {
      label = `${folder} (${arr.length} files)`;
    } else if (arr.length === 1) {
      label = arr[0].name;
    } else {
      label = `${arr.length} files`;
    }
    return { label, tooltip: names.join("\n"), hasDb: true };
  };

  const applySelectedFiles = (files) => {
    state.selectedFiles = Array.from(files || []);
    const { label, tooltip, hasDb } = describeFiles(state.selectedFiles);
    state.hasDatabase = hasDb;
    refs.fileNameEl.textContent = label;
    if (tooltip) {
      refs.databaseCell.title = tooltip;
    } else {
      refs.databaseCell.removeAttribute("title");
    }
    setSearchButtonState();
    setDownloadButtonState();
  };

  const renderLineNumbers = () => {
    const lines = Math.max(1, refs.bigInput.value.split("\n").length);
    refs.lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  };

  const openInputPanel = () => {
    const isLowResolution = window.innerWidth <= 1366 && window.innerHeight <= 768;
    const panelHeight = isLowResolution ? "305px" : "500px";
    refs.inputPanel.style.height = panelHeight;
    refs.inputPanel.classList.add("open");
    document.body.classList.add("panel-open");
    renderLineNumbers();
    setDownloadButtonState();
    refs.bigInput.focus();
  };

  const resetAfterSearch = () => {
    refs.bigInput.value = "";
    refs.timeSpentEl.textContent = "";
    refs.linesFoundEl.textContent = "";
    refs.currentSpeedEl.textContent = "";
    state.originalResults = "";
    renderLineNumbers();
    setDownloadButtonState();
    refs.bigInput.focus();
  };

  const downloadResults = () => {
    if (refs.downloadResultsButton.classList.contains("disabled")) return;
    const req = refs.requestInput.value.trim();
    const safe = req.replace(/[^a-zA-Z0-9@._-]+/g, "_");
    const filename = safe ? `result_${safe}.txt` : "result.txt";
    const content = refs.bigInput.value;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  };

  const guardSelection = (e) => {
    const inDatabase = e.target.closest("#databaseCell");
    const inActions = e.target.closest(".actions");
    const inEditable = e.target.closest('input, textarea, select, [contenteditable="true"]');
    if ((inDatabase && !inActions) || inEditable) return;
    e.preventDefault();
  };

  const countNonEmptyLines = (text) => {
    return text.split("\n").reduce((acc, l) => acc + (l.trim() ? 1 : 0), 0);
  };

  const updateLinesFoundDisplay = () => {
    const filterActive = (refs.loginpass && refs.loginpass.checked) || (refs.mailpass && refs.mailpass.checked);
    if (!refs.linesFoundEl) return;
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
    if (!refs.loginpass.checked && !refs.mailpass.checked) {
      state.originalResults = refs.bigInput.value;
    }
    renderLineNumbers();
    setDownloadButtonState();
    updateLinesFoundDisplay();
  };

  const syncLineNumbersScroll = () => {
    refs.lineNumbers.scrollTop = refs.bigInput.scrollTop;
  };

  const handleRequestInputEnter = (e) => {
    if (e.key === "Enter" && refs.searchButton.classList.contains("enabled")) {
      e.preventDefault();
      refs.searchButton.click();
    }
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
    renderLineNumbers();
    setDownloadButtonState();
    updateLinesFoundDisplay();
  };

  refs.downloadResultsButton.addEventListener("click", downloadResults);
  refs.requestInput.addEventListener("input", setSearchButtonState);
  refs.requestInput.addEventListener("keydown", handleRequestInputEnter);
  document.addEventListener("selectstart", guardSelection);
  refs.bigInput.addEventListener("input", handleEditorInput);
  refs.bigInput.addEventListener("scroll", syncLineNumbersScroll);
  if (refs.loginpass) {
    refs.loginpass.addEventListener("change", applyFilters);
  }
  if (refs.mailpass) {
    refs.mailpass.addEventListener("change", applyFilters);
  }

  App.ui = {
    updateSearchState: () => {
      setSearchButtonState();
      setDownloadButtonState();
    },
    updateDownloadState: setDownloadButtonState,
    handleFiles: applySelectedFiles,
    openInputPanel,
    resetAfterSearch,
    updateLineNumbers: renderLineNumbers,
    applyLogPassFilterIfNeeded: applyFilters,
    applyFilters,
  };

  setSearchButtonState();
  setDownloadButtonState();
})();
