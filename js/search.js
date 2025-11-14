(() => {
  const app = window.App;
  const r = app.refs;

  const encUtils = {
    formatDuration(ms) {
      if (ms < 1000) return String(Math.round(ms)) + " ms";
      const s = ms / 1000;
      if (s < 60) return s.toFixed(2) + " s";
      const m = Math.floor(s / 60);
      const sec = (s - m * 60).toFixed(1);
      return m + " min " + sec + " s";
    },
    sanitizeText(s) {
      return s.indexOf("\uFFFD") === -1 ? s : s.replace(/\uFFFD/g, "");
    },
    bytesToMB(n) {
      return (n / (1024 * 1024)).toFixed(2);
    },
    async readHead(file, n) {
      const blob = file.slice(0, Math.min(n, file.size));
      return new Uint8Array(await blob.arrayBuffer());
    },
    async readRange(file, start, end) {
      const s = Math.max(0, Math.min(start, file.size));
      const e = Math.max(s, Math.min(end, file.size));
      const blob = file.slice(s, e);
      return new Uint8Array(await blob.arrayBuffer());
    },
    detectBOM(bytes) {
      if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { enc: "utf-8", skip: 3 };
      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { enc: "utf-16le", skip: 2 };
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { enc: "utf-16be", skip: 2 };
      return { enc: "utf-8", skip: 0 };
    },
    makeThrottled(fn, interval) {
      let last = 0;
      let timer = null;
      let pendingArgs = null;
      function run() {
        timer = null;
        last = performance.now();
        fn.apply(null, pendingArgs || []);
      }
      return function (...args) {
        pendingArgs = args;
        const now = performance.now();
        if (now - last >= interval) {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          run();
        } else if (!timer) {
          timer = setTimeout(run, Math.max(0, interval - (now - last)));
        }
      };
    },
    isAscii(str) {
      for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) > 0x7f) return false;
      }
      return true;
    }
  };

  function getWorker() {
    return new Worker("js/worker.js");
  }

  function createController() {
    let token = 0;
    let active = false;

    function makeFlusher(displayRef) {
      let pending = false;
      let last = 0;
      const INTERVAL = 160;
      return function () {
        if (pending) return;
        const now = performance.now();
        const delay = Math.max(0, INTERVAL - (now - last));
        pending = true;
        setTimeout(function () {
          r.bigInput.value = displayRef.text;
          app.ui.updateLineNumbers();
          app.ui.updateDownloadState();
          pending = false;
          last = performance.now();
        }, delay);
      };
    }

    return {
      async start(params) {
        token++;
        const myToken = token;
        active = true;
        app.state.searching = true;
        app.ui.updateSearchState();
        if (window.updateUploadButtonsState) window.updateUploadButtonsState();
        r.bigInput.value = "";
        app.ui.updateLineNumbers();

        const files = Array.isArray(params.files)
          ? params.files
          : params.files
          ? Array.from(params.files)
          : params.file
          ? [params.file]
          : [];
        const rawQuery = params.query;
        const queries = String(rawQuery || "")
          .split("|")
          .map(s => s.trim())
          .filter(s => s.length > 0);
        const everyOccurrence = false;
        const caseInsensitive = !!params.caseInsensitive;
        const showLabels = !!params.showLabels;

        if (!files.length || !queries.length) {
          active = false;
          app.state.searching = false;
          app.ui.updateSearchState();
          if (window.updateUploadButtonsState) window.updateUploadButtonsState();
          return;
        }

        const OUT_CHUNK = 4 * 1024 * 1024;
        const DISPLAY_LIMIT = Infinity;
        const overallStarted = performance.now();

        const displayRef = { text: "" };
        const flush = makeFlusher(displayRef);
        const setSpeed = encUtils.makeThrottled(text => {
          r.currentSpeedEl.textContent = text;
        }, 180);

        let overallHits = 0;
        let overallBytes = 0;

        function appendText(s) {
          const clean = encUtils.sanitizeText(s || "");
          if (!clean) return;
          displayRef.text += clean;
          if (displayRef.text.length > DISPLAY_LIMIT) displayRef.text = displayRef.text.slice(-DISPLAY_LIMIT);
          flush();
        }

        function prefixLabel(file) {
          if (!showLabels) return "";
          const label = file.webkitRelativePath && file.webkitRelativePath.length ? file.webkitRelativePath : file.name;
          return "[" + label + "] ";
        }

        function updateOverallSpeed() {
          const elapsed = performance.now() - overallStarted;
          const speed = elapsed > 0 ? ((overallBytes / (1024 * 1024)) / (elapsed / 1000)).toFixed(0) : "0";
          r.currentSpeedEl.textContent = `${speed} MB/s`;
          r.timeSpentEl.textContent = encUtils.formatDuration(elapsed);
          r.linesFoundEl.textContent = String(overallHits);
        }

        async function buildLineAlignedTasks(file, baseOffset, totalSize, chunkSize) {
          const tasks = [];
          let cur = baseOffset;
          const endAll = baseOffset + totalSize;
          const PROBE = 131072;
          while (cur < endAll) {
            let idealEnd = Math.min(cur + chunkSize, endAll);
            if (idealEnd < endAll) {
              const probe = await encUtils.readRange(file, idealEnd, Math.min(idealEnd + PROBE, endAll));
              let found = -1;
              for (let i = 0; i < probe.length; i++) {
                if (probe[i] === 0x0a) {
                  found = i;
                  break;
                }
              }
              if (found !== -1) {
                idealEnd = idealEnd + found + 1;
              }
            }
            tasks.push({ start: cur, end: idealEnd });
            cur = idealEnd;
          }
          return tasks;
        }

        const scanOne = async (file, query) =>
          new Promise(async (resolve, reject) => {
            const labelPrefix = prefixLabel(file);
            let bytesDone = 0;
            const started = performance.now();

            function onError(msg) {
              reject(new Error(msg));
            }

            const head = await encUtils.readHead(file, 4096);
            const det = encUtils.detectBOM(head);
            const enc = det.enc;
            const skip = det.skip;

            const qAscii = encUtils.isAscii(query);
            const asciiCI = !!(caseInsensitive && qAscii);
            const useFastUtf8 = enc === "utf-8" && (!caseInsensitive || asciiCI);

            if (!useFastUtf8) {
              const w = getWorker();
              w.onmessage = function (ev) {
                if (myToken !== token) return;
                const d = ev.data || {};
                if (d.type === "error") return onError(d.error);
                if (d.type === "chunk") {
                  appendText(d.text);
                } else if (d.type === "done") {
                  overallHits += d.count || 0;
                  overallBytes += file.size;
                  setSpeed("");
                  try { w.terminate(); } catch (_) {}
                  resolve();
                }
              };
              w.postMessage({
                cmd: "scan-generic",
                file,
                enc,
                skip,
                query,
                outChunk: OUT_CHUNK,
                ci: caseInsensitive,
                everyOccurrence,
                labelPrefix
              });
              return;
            }

            const baseOffset = skip;
            const totalSize = Math.max(0, file.size - baseOffset);
            if (totalSize <= 0) {
              setSpeed("");
              return resolve();
            }

            const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
            let workersCount = Math.min(Math.max((cores * 3) | 0, 6), 24);

            let CHUNK_SIZE = 192 * 1024 * 1024;
            CHUNK_SIZE = Math.min(Math.max(32 * 1024 * 1024, CHUNK_SIZE), Math.ceil(totalSize / Math.max(1, workersCount)));
            CHUNK_SIZE = Math.min(CHUNK_SIZE, 256 * 1024 * 1024);

            const tasks = await buildLineAlignedTasks(file, baseOffset, totalSize, CHUNK_SIZE);

            if (tasks.length < workersCount) workersCount = tasks.length;

            let nextTask = 0;
            let doneWorkers = 0;

            const updateStatusThrottled = encUtils.makeThrottled(() => {
              const elapsed = performance.now() - started;
              const speed = elapsed > 0 ? ((bytesDone / (1024 * 1024)) / (elapsed / 1000)).toFixed(0) : "0";
              setSpeed(`${speed} MB/s`);
              updateOverallSpeed();
            }, 180);

            const taskBuffers = new Array(tasks.length);
            for (let i = 0; i < taskBuffers.length; i++) taskBuffers[i] = { chunks: [], done: false, count: 0 };
            let nextFlushIndex = 0;

            function tryFlushInOrder() {
              while (nextFlushIndex < taskBuffers.length && taskBuffers[nextFlushIndex].done) {
                appendText(taskBuffers[nextFlushIndex].chunks.join(""));
                overallHits += taskBuffers[nextFlushIndex].count;
                nextFlushIndex++;
              }
              r.linesFoundEl.textContent = String(overallHits);
            }

            function assign(worker) {
              if (nextTask >= tasks.length) return false;
              const idx = nextTask++;
              const t = tasks[idx];
              worker.__taskIndex = idx;
              worker.postMessage({
                cmd: "scan-utf8-fast",
                file,
                start: t.start,
                end: t.end,
                leftOverlap: 0,
                rightOverlap: 0,
                query,
                outChunk: OUT_CHUNK,
                everyOccurrence,
                labelPrefix,
                asciiCI
              });
              return true;
            }

            const workers = new Array(workersCount);

            for (let i = 0; i < workersCount; i++) {
              workers[i] = getWorker();
              workers[i].onmessage = function (ev) {
                if (myToken !== token) return;
                const d = ev.data || {};
                if (d.type === "error") {
                  try { workers.forEach(x => x.terminate()); } catch (_) {}
                  return onError(d.error);
                }
                const idx = this.__taskIndex;
                if (d.type === "chunk") {
                  taskBuffers[idx].chunks.push(encUtils.sanitizeText(d.text || ""));
                } else if (d.type === "progress") {
                  const b = d.bytes | 0;
                  bytesDone += b;
                  overallBytes += b;
                  updateStatusThrottled();
                } else if (d.type === "done") {
                  taskBuffers[idx].done = true;
                  taskBuffers[idx].count += d.count || 0;
                  if (!assign(this)) {
                    try { this.terminate(); } catch (_) {}
                    doneWorkers++;
                    if (doneWorkers === workers.length) {
                      tryFlushInOrder();
                      setSpeed("");
                      resolve();
                    }
                  } else {
                    tryFlushInOrder();
                  }
                }
              };
              assign(workers[i]);
            }
          });

        try {
          for (let qi = 0; qi < queries.length; qi++) {
            const query = queries[qi];
            for (let i = 0; i < files.length; i++) {
              if (myToken !== token) {
                active = false;
                app.state.searching = false;
                app.ui.updateSearchState();
                if (window.updateUploadButtonsState) window.updateUploadButtonsState();
                return;
              }
              await scanOne(files[i], query);
            }
          }
        } catch (_) {
        } finally {
          const totalElapsed = performance.now() - overallStarted;
          if (myToken === token) {
            let finalText = displayRef.text;
            finalText = finalText.replace(/\r?\n$/, "");
            finalText = finalText.replace(/\u2026$/, "");
            displayRef.text = finalText;
            r.bigInput.value = finalText;
            r.timeSpentEl.textContent = encUtils.formatDuration(totalElapsed);
            r.linesFoundEl.textContent = String((finalText && finalText.length) ? finalText.split(/\r?\n/).length : 0);
            r.currentSpeedEl.textContent = "";
            app.ui.updateLineNumbers();
            app.ui.updateDownloadState();
            active = false;
            app.state.searching = false;
            app.ui.updateSearchState();
            if (window.updateUploadButtonsState) window.updateUploadButtonsState();
          }
        }
      },
      cancel() {
        token++;
        app.state.searching = false;
        app.ui.updateSearchState();
        if (window.updateUploadButtonsState) window.updateUploadButtonsState();
      },
      isActive() {
        return active;
      }
    };
  }

  const controller = createController();

  function startSearch() {
    if (!app.state.selectedFiles.length) return;
    const query = (r.requestInput.value || "").trim();
    if (!query) return;
    const caseInsensitive = !r.caseSensitiveEl.checked;
    const multiple =
      app.state.selectedFiles.length > 1 ||
      !!(
        app.state.selectedFiles[0] &&
        app.state.selectedFiles[0].webkitRelativePath &&
        app.state.selectedFiles[0].webkitRelativePath.includes("/")
      );
    const showLabels = r.showFileNamesEl.checked && multiple;
    controller.start({
      files: app.state.selectedFiles,
      query,
      caseInsensitive,
      showLabels
    });
  }

  r.searchButton.addEventListener("click", () => {
    if (!r.searchButton.classList.contains("enabled")) return;
    if (!r.inputPanel.classList.contains("open")) {
      app.ui.openInputPanel();
    }
    app.ui.resetAfterSearch();
    startSearch();
  });
})();
