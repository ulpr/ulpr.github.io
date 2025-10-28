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
  };

  App.refs = refs;

  const state = {
    hasDatabase: false,
    selectedFiles: [],
    searching: false,
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
  };

  const setDownloadButtonState = () => {
    const hasLines = refs.bigInput.value
      .split("\n")
      .some((l) => l.trim().length > 0);
    refs.downloadResultsButton.classList.toggle("disabled", !hasLines);
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
    const inEditable = e.target.closest(
      'input, textarea, select, [contenteditable="true"]'
    );
    if ((inDatabase && !inActions) || inEditable) return;
    e.preventDefault();
  };

  const handleEditorInput = () => {
    renderLineNumbers();
    setDownloadButtonState();
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

  refs.downloadResultsButton.addEventListener("click", downloadResults);
  refs.requestInput.addEventListener("input", setSearchButtonState);
  refs.requestInput.addEventListener("keydown", handleRequestInputEnter);
  document.addEventListener("selectstart", guardSelection);
  refs.bigInput.addEventListener("input", handleEditorInput);
  refs.bigInput.addEventListener("scroll", syncLineNumbersScroll);

  App.ui = {
    updateSearchState: setSearchButtonState,
    updateDownloadState: setDownloadButtonState,
    handleFiles: applySelectedFiles,
    openInputPanel,
    resetAfterSearch,
    updateLineNumbers: renderLineNumbers,
  };

  setSearchButtonState();
  setDownloadButtonState();
})();
