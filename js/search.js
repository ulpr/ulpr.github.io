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
    const liveWorkers = new Set();

    function spawnWorker() {
      const w = getWorker();
      liveWorkers.add(w);
      return w;
    }

    function stopWorker(w) {
      try { w.terminate(); } catch (_) {}
      liveWorkers.delete(w);
    }

    function stopAllWorkers() {
      liveWorkers.forEach(w => {
        try { w.terminate(); } catch (_) {}
      });
      liveWorkers.clear();
    }

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
        stopAllWorkers();
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

        const pool = [];

        function acquireWorker() {
          return pool.length ? pool.pop() : spawnWorker();
        }

        function releaseWorker(w) {
          w.onmessage = null;
          pool.push(w);
        }

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

        const results = new Array(queries.length);
        for (let qi = 0; qi < queries.length; qi++) results[qi] = new Array(files.length);
        let headQ = 0;
        let headF = 0;
        let headT = 0;

        function newSegment() {
          return { chunks: [], done: false };
        }

        function pump() {
          while (headQ < queries.length) {
            const list = results[headQ][headF];
            if (list === undefined) break;
            if (headT >= list.length) {
              headT = 0;
              headF++;
              if (headF >= files.length) {
                headF = 0;
                headQ++;
              }
              continue;
            }
            const seg = list[headT];
            if (seg.chunks.length) {
              const text = seg.chunks.length === 1 ? seg.chunks[0] : seg.chunks.join("");
              seg.chunks = [];
              appendText(text);
            }
            if (!seg.done) break;
            list[headT] = null;
            headT++;
          }
        }

        async function buildLineAlignedTasks(file, baseOffset, totalSize, chunkSize) {
          const endAll = baseOffset + totalSize;
          const PROBE = 131072;
          const marks = [];
          for (let p = baseOffset + chunkSize; p < endAll; p += chunkSize) marks.push(p);
          const found = new Array(marks.length);
          let nextMark = 0;
          const readers = [];
          const lanes = Math.min(32, marks.length);
          for (let l = 0; l < lanes; l++) {
            readers.push((async () => {
              while (nextMark < marks.length) {
                const i = nextMark++;
                const p = marks[i];
                const probe = await encUtils.readRange(file, p, Math.min(p + PROBE, endAll));
                found[i] = probe.indexOf(0x0a);
              }
            })());
          }
          await Promise.all(readers);
          const tasks = [];
          let cur = baseOffset;
          let aligned = true;
          for (let i = 0; i < marks.length; i++) {
            let b = marks[i];
            let nextAligned = false;
            if (found[i] !== -1) {
              b += found[i] + 1;
              nextAligned = true;
            }
            if (b <= cur) continue;
            if (b >= endAll) break;
            tasks.push({ start: cur, end: b, aligned });
            cur = b;
            aligned = nextAligned;
          }
          tasks.push({ start: cur, end: endAll, aligned });
          return tasks;
        }

        function runFast(file, fi, skip, idxs, asciiCI, labelPrefix) {
          return new Promise((resolve, reject) => {
            (async () => {
              const baseOffset = skip;
              const totalSize = Math.max(0, file.size - baseOffset);
              if (totalSize <= 0) {
                for (let k = 0; k < idxs.length; k++) results[idxs[k]][fi] = [];
                pump();
                setSpeed("");
                resolve();
                return;
              }

              const started = performance.now();
              let bytesDone = 0;

              const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
              let workersCount = Math.min(Math.max((cores * 3) | 0, 6), 24);

              let CHUNK_SIZE = 192 * 1024 * 1024;
              CHUNK_SIZE = Math.min(Math.max(32 * 1024 * 1024, CHUNK_SIZE), Math.ceil(totalSize / Math.max(1, workersCount)));
              CHUNK_SIZE = Math.min(CHUNK_SIZE, 256 * 1024 * 1024);
              CHUNK_SIZE = Math.max(CHUNK_SIZE, 1024 * 1024);

              const tasks = await buildLineAlignedTasks(file, baseOffset, totalSize, CHUNK_SIZE);
              if (myToken !== token) return;

              if (tasks.length < workersCount) workersCount = tasks.length;

              const qs = idxs.map(i => queries[i]);
              const segs = new Array(idxs.length);
              for (let k = 0; k < idxs.length; k++) {
                const list = new Array(tasks.length);
                for (let t = 0; t < tasks.length; t++) list[t] = newSegment();
                segs[k] = list;
                results[idxs[k]][fi] = list;
              }
              pump();

              const updateStatusThrottled = encUtils.makeThrottled(() => {
                const elapsed = performance.now() - started;
                const speed = elapsed > 0 ? ((bytesDone / (1024 * 1024)) / (elapsed / 1000)).toFixed(0) : "0";
                setSpeed(`${speed} MB/s`);
                updateOverallSpeed();
              }, 180);

              let nextTask = 0;
              let doneWorkers = 0;
              let failed = false;
              const workers = new Array(workersCount);

              function assign(worker) {
                if (nextTask >= tasks.length) return false;
                const idx = nextTask++;
                const t = tasks[idx];
                worker.__taskIndex = idx;
                worker.postMessage({
                  cmd: "scan-utf8-multi",
                  file,
                  start: t.start,
                  end: t.end,
                  aligned: t.aligned,
                  queries: qs,
                  outChunk: OUT_CHUNK,
                  everyOccurrence,
                  labelPrefix,
                  asciiCI
                });
                return true;
              }

              for (let i = 0; i < workersCount; i++) {
                const w = acquireWorker();
                workers[i] = w;
                w.onmessage = function (ev) {
                  if (myToken !== token || failed) return;
                  const d = ev.data || {};
                  if (d.type === "error") {
                    failed = true;
                    reject(new Error(d.error));
                    return;
                  }
                  const idx = w.__taskIndex;
                  if (d.type === "chunk") {
                    segs[d.q][idx].chunks.push(d.text || "");
                    pump();
                  } else if (d.type === "progress") {
                    const b = d.bytes | 0;
                    bytesDone += b;
                    overallBytes += b;
                    updateStatusThrottled();
                  } else if (d.type === "done") {
                    const counts = d.counts || [];
                    for (let k = 0; k < segs.length; k++) {
                      segs[k][idx].done = true;
                      overallHits += counts[k] || 0;
                    }
                    pump();
                    r.linesFoundEl.textContent = String(overallHits);
                    if (!assign(w)) {
                      releaseWorker(w);
                      doneWorkers++;
                      if (doneWorkers === workers.length) {
                        setSpeed("");
                        resolve();
                      }
                    }
                  }
                };
              }
              for (let i = 0; i < workersCount; i++) assign(workers[i]);
            })().catch(reject);
          });
        }

        function runGeneric(file, fi, enc, skip, idxs, labelPrefix) {
          return new Promise((resolve, reject) => {
            const segs = new Array(idxs.length);
            for (let k = 0; k < idxs.length; k++) {
              const seg = newSegment();
              segs[k] = seg;
              results[idxs[k]][fi] = [seg];
            }
            pump();
            const w = acquireWorker();
            w.onmessage = function (ev) {
              if (myToken !== token) return;
              const d = ev.data || {};
              if (d.type === "error") {
                reject(new Error(d.error));
                return;
              }
              if (d.type === "chunk") {
                segs[d.q].chunks.push(d.text || "");
                pump();
              } else if (d.type === "done") {
                const counts = d.counts || [];
                for (let k = 0; k < segs.length; k++) {
                  segs[k].done = true;
                  overallHits += counts[k] || 0;
                }
                overallBytes += file.size;
                releaseWorker(w);
                pump();
                r.linesFoundEl.textContent = String(overallHits);
                setSpeed("");
                resolve();
              }
            };
            w.postMessage({
              cmd: "scan-generic-multi",
              file,
              enc,
              skip,
              queries: idxs.map(i => queries[i]),
              outChunk: OUT_CHUNK,
              ci: caseInsensitive,
              everyOccurrence,
              labelPrefix
            });
          });
        }

        async function scanFile(file, fi) {
          const labelPrefix = prefixLabel(file);
          const head = await encUtils.readHead(file, 4096);
          if (myToken !== token) return new Promise(() => {});
          const det = encUtils.detectBOM(head);
          const enc = det.enc;
          const skip = det.skip;
          const fastIdx = [];
          const genIdx = [];
          for (let qi = 0; qi < queries.length; qi++) {
            const q = queries[qi];
            const asciiCI = !!(caseInsensitive && encUtils.isAscii(q));
            const useFastUtf8 = enc === "utf-8" && (!caseInsensitive || asciiCI);
            if (useFastUtf8) fastIdx.push(qi);
            else genIdx.push(qi);
          }
          const jobs = [];
          if (genIdx.length) jobs.push(runGeneric(file, fi, enc, skip, genIdx, labelPrefix));
          if (fastIdx.length) jobs.push(runFast(file, fi, skip, fastIdx, caseInsensitive, labelPrefix));
          await Promise.all(jobs);
        }

        try {
          for (let fi = 0; fi < files.length; fi++) {
            if (myToken !== token) {
              active = false;
              app.state.searching = false;
              app.ui.updateSearchState();
              if (window.updateUploadButtonsState) window.updateUploadButtonsState();
              return;
            }
            await scanFile(files[fi], fi);
          }
        } catch (_) {
          if (myToken === token) stopAllWorkers();
        } finally {
          const totalElapsed = performance.now() - overallStarted;
          pool.forEach(stopWorker);
          pool.length = 0;
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
        stopAllWorkers();
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
