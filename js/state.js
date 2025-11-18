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
    allowShowFileNames: false,
  };

  App.state = state;

  const hasRequestText = () => refs.requestInput.value.trim().length > 3;

  const setSearchButtonState = () => {
    const filtersActive =
      (refs.loginpass && refs.loginpass.checked) ||
      (refs.mailpass && refs.mailpass.checked);
    const enabled = hasRequestText() && state.hasDatabase && !state.searching && !filtersActive;
    refs.searchButton.classList.toggle("enabled", enabled);
    document.body.classList.toggle("searching", state.searching);
    if (refs.heading) {
      refs.heading.textContent = state.searching ? "Searching..." : "Search requests [ULPR]";
    }
    const disabled = state.searching;
    const disableShowFileNames = disabled || !state.allowShowFileNames;
    refs.showFileNamesEl.disabled = disableShowFileNames;
    const showFileNamesLabel = refs.showFileNamesEl.closest(".settings-checkbox");
    if (showFileNamesLabel) showFileNamesLabel.classList.toggle("disabled", disableShowFileNames);
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
    if (disabled && App.history && App.history.closeDropdown) App.history.closeDropdown();
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
    if (!arr.length) return { label: "", tooltip: "", hasDb: false, allowShowFileNames: false };
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
    const allowShowFileNames = !!folder || arr.length > 1;
    return { label, tooltip: names.join("\n"), hasDb: true, allowShowFileNames };
  };

  const applySelectedFiles = (files) => {
    state.selectedFiles = Array.from(files || []);
    const { label, tooltip, hasDb, allowShowFileNames } = describeFiles(state.selectedFiles);
    state.hasDatabase = hasDb;
    state.allowShowFileNames = allowShowFileNames;
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

  const syncLineNumbersScroll = () => {
    refs.lineNumbers.scrollTop = refs.bigInput.scrollTop;
  };

  const handleRequestInputEnter = (e) => {
    if (e.key === "Enter" && refs.searchButton.classList.contains("enabled")) {
      e.preventDefault();
      refs.searchButton.click();
      if (App.history && App.history.closeDropdown) App.history.closeDropdown();
    }
    if (e.key === "Escape") {
      if (App.history && App.history.closeDropdown) App.history.closeDropdown();
    }
  };
  refs.downloadResultsButton.addEventListener("click", () => {if (App.downloadResults) App.downloadResults();});
  refs.requestInput.addEventListener("input", () => {
    setSearchButtonState();
    if (App.history && App.history.openDropdown) App.history.openDropdown(refs.requestInput.value);
  });
  refs.requestInput.addEventListener("keydown", handleRequestInputEnter);
  refs.requestInput.addEventListener("focus", () => {if (App.history && App.history.openDropdown) App.history.openDropdown("");});
  refs.requestInput.addEventListener("click", () => {if (App.history && App.history.openDropdown) App.history.openDropdown("");});
  document.addEventListener("click", (e) => {
    if (!refs.requestCell.contains(e.target) && App.history && App.history.closeDropdown) App.history.closeDropdown();
  });

  document.addEventListener("selectstart", guardSelection);
  refs.bigInput.addEventListener("input", () => {if (App.filters && App.filters.handleEditorInput) App.filters.handleEditorInput();});
  refs.bigInput.addEventListener("scroll", syncLineNumbersScroll);
  if (refs.loginpass) {
    refs.loginpass.addEventListener("change", () => {
      if (App.filters && App.filters.applyFilters) App.filters.applyFilters();
      setSearchButtonState();
    });
  }
  if (refs.mailpass) {
    refs.mailpass.addEventListener("change", () => {
      if (App.filters && App.filters.applyFilters) App.filters.applyFilters();
      setSearchButtonState();
    });
  }
  if (refs.searchButton) {
    refs.searchButton.addEventListener("click", () => {
      if (!refs.searchButton.classList.contains("enabled")) return;
      if (App.history && App.history.saveSearchQuery) App.history.saveSearchQuery();
      if (App.history && App.history.closeDropdown) App.history.closeDropdown();
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
    applyLogPassFilterIfNeeded: () => {if (App.filters && App.filters.applyFilters) App.filters.applyFilters();},
    applyFilters: () => {if (App.filters && App.filters.applyFilters) App.filters.applyFilters();},
  };

  setSearchButtonState();
  setDownloadButtonState();
})();
