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
    historyDropdown: document.getElementById("historyDropdown"),
    requestCell: document.getElementById("requestCell"),
  };

  App.refs = refs;

  const state = {
    hasDatabase: false,
    selectedFiles: [],
    searching: false,
    originalResults: "",
    historyOpen: false,
    currentHistoryFilter: "",
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
    if (disabled) closeHistoryDropdown();
  };

  const setDownloadButtonState = () => {
    const hasLines = refs.bigInput.value.split("\n").some((l) => l.trim().length > 0);
    refs.downloadResultsButton.classList.toggle("disabled", !hasLines);
    const filterActive = (refs.loginpass && refs.loginpass.checked) || (refs.mailpass && refs.mailpass.checked);
    const disableFiltersBase = state.searching || (!hasLines && !filterActive);
    [refs.loginpass, refs.mailpass].forEach((cb) => {
      if (!cb) return;
      const other = cb === refs.loginpass ? refs.mailpass : refs.loginpass;
      const disabled = disableFiltersBase || (other && other.checked);
      cb.disabled = disabled;
      const label = cb.closest(".settings-checkbox");
      if (label) label.classList.toggle("disabled", disabled);
    });
  };

  const extractFolderName = (files) => {
    const first = files[0];
    const rel = first.webkitRelativePath || "";
    if (rel.includes("/")) return rel.split("/")[0];
    const name = first.name || "";
    return name.includes(".") ? null : name;
  };

  const formatSize = (bytes) => {
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;
    if (bytes >= gb) return (bytes / gb).toFixed(1) + " GB";
    if (bytes >= mb) return (bytes / mb).toFixed(1) + " MB";
    if (bytes >= kb) return (bytes / kb).toFixed(1) + " KB";
    return bytes + " B";
  };

  const describeFiles = (files) => {
    const arr = Array.from(files || []);
    if (!arr.length) return { label: "", tooltip: "", hasDb: false };
    const folder = extractFolderName(arr);
    const names = arr.map((f) => f.name);
    const totalSize = arr.reduce((sum, f) => sum + (f.size || 0), 0);
    let label = "";
    if (folder) {
      label = `${folder} (${arr.length} files, ${formatSize(totalSize)})`;
    } else if (arr.length === 1) {
      label = `${arr[0].name} (${formatSize(totalSize)})`;
    } else {
      label = `${arr.length} files (${formatSize(totalSize)})`;
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
    let t = e.target;
    if (!t || t.nodeType !== 1) t = t && t.parentElement ? t.parentElement : null;
    if (!t) return;
    const inDatabase = t.closest("#databaseCell");
    const inActions = t.closest(".actions");
    const inEditable = t.closest('input, textarea, select, [contenteditable="true"]');
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
      closeHistoryDropdown();
    }
    if (e.key === "Escape") {
      closeHistoryDropdown();
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
    const raw = refs.requestInput.value.trim();
    if (!raw) return;
    let arr;
    try {
      arr = JSON.parse(localStorage.getItem("history") || "[]");
      if (!Array.isArray(arr)) arr = [];
    } catch (e) {
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
    arr = arr.filter(x => normalizeQuery(String(x)) !== norm);
    localStorage.setItem("history", JSON.stringify(arr));
  };
  const openHistoryDropdown = (filter = "") => {
    if (state.searching) return;

    state.currentHistoryFilter = String(filter || "");

    const data = readHistory();
    const q = state.currentHistoryFilter.trim().toLowerCase();

    const src = q ? data.filter(x => String(x).toLowerCase().includes(q)) : data;
    let list = src.slice().reverse().slice(0, 50);

    if (!list.length && data.length) {
      state.currentHistoryFilter = "";
      const all = data.slice().reverse().slice(0, 50);
      if (!all.length) { closeHistoryDropdown(); return; }
      list = all;
    }

    if (!list.length) { closeHistoryDropdown(); return; }

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
        setSearchButtonState();
      });
      div.addEventListener("click", (e) => {
        if (e.target === btn) return;
        closeHistoryDropdown();
        refs.requestInput.focus();
      });

      btn.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        removeFromHistory(item);
        openHistoryDropdown(state.currentHistoryFilter);
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
      });

      div.appendChild(text);
      div.appendChild(btn);
      refs.historyDropdown.appendChild(div);
    }
    refs.historyDropdown.classList.add("open");
    state.historyOpen = true;
  };

  const closeHistoryDropdown = () => {
    refs.historyDropdown.classList.remove("open");
    state.historyOpen = false;
  };
  const maybeToggleHistory = () => {
    if (document.activeElement === refs.requestInput) {
      openHistoryDropdown(refs.requestInput.value);
    }
  };
  refs.downloadResultsButton.addEventListener("click", downloadResults);
  refs.requestInput.addEventListener("input", () => {
    setSearchButtonState();
    openHistoryDropdown(refs.requestInput.value);
  });
  refs.requestInput.addEventListener("keydown", handleRequestInputEnter);
  refs.requestInput.addEventListener("focus", () => openHistoryDropdown(""));
  refs.requestInput.addEventListener("click", () => openHistoryDropdown(""));
  document.addEventListener("click", (e) => {
    if (!refs.requestCell.contains(e.target)) closeHistoryDropdown();
  });

  document.addEventListener("selectstart", guardSelection);
  refs.bigInput.addEventListener("input", handleEditorInput);
  refs.bigInput.addEventListener("scroll", syncLineNumbersScroll);
  if (refs.loginpass) {
    refs.loginpass.addEventListener("change", applyFilters);
  }
  if (refs.mailpass) {
    refs.mailpass.addEventListener("change", applyFilters);
  }
  if (refs.searchButton) {
    refs.searchButton.addEventListener("click", () => {
      if (!refs.searchButton.classList.contains("enabled")) return;
      saveSearchQuery();
      closeHistoryDropdown();
    });
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
