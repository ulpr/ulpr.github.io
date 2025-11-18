document.addEventListener('dragenter', (e) => {
  const hasFiles = e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  if (!hasFiles) return;
  e.preventDefault();
  document.body.classList.add('dragging');
});

document.addEventListener('dragover', (e) => {
  const hasFiles = e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  if (!hasFiles) return;
  e.preventDefault();
});

document.addEventListener('dragleave', (e) => {
  const hasFiles = e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  if (!hasFiles) return;
  const leftDocument = e.target === document;
  const leftViewport =
    e.clientX <= 0 ||
    e.clientY <= 0 ||
    e.clientX >= window.innerWidth ||
    e.clientY >= window.innerHeight;

  if (leftDocument || leftViewport) {
    document.body.classList.remove('dragging');
  }
});

document.addEventListener('drop', (e) => {
  const hasFiles = e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  if (!hasFiles) return;
  e.preventDefault();
  document.body.classList.remove('dragging');
  const files = e.dataTransfer.files;
  window.App.ui.handleFiles(files);
});

document.addEventListener('dragstart', (e) => {
  const t = e.target;
  if (t instanceof Element && (t.matches('img, svg') || t.closest('.action-icon'))) {
    e.preventDefault();
  }
});
