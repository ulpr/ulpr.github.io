(() => {
  const App = (window.App = window.App || {});
  App.downloadResults = () => {
    const refs = App.refs || {};
    if (!refs.downloadResultsButton || refs.downloadResultsButton.classList.contains("disabled")) return;
    const reqInput = refs.requestInput;
    const bigInput = refs.bigInput;
    const req = reqInput && reqInput.value ? reqInput.value.trim() : "";
    const safe = req.replace(/[^a-zA-Z0-9@._-]+/g, "_");
    const filename = safe ? `result_${safe}.txt` : "result.txt";
    const content = bigInput && typeof bigInput.value === "string" ? bigInput.value : "";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  };
})();
