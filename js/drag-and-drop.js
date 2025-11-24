const d=document,b=d.body,hasFiles=e=>e.dataTransfer&&[...(e.dataTransfer.types||[])].includes('Files');

['dragenter','dragover'].forEach(t=>d.addEventListener(t,e=>{
  if(!hasFiles(e))return;
  e.preventDefault();
  if(t==='dragenter')b.classList.add('dragging');
}));

d.addEventListener('dragleave',e=>{
  if(!hasFiles(e))return;
  if(e.target===d||e.clientX<=0||e.clientY<=0||e.clientX>=innerWidth||e.clientY>=innerHeight)
    b.classList.remove('dragging');
});

d.addEventListener('drop',e=>{
  if(!hasFiles(e))return;
  e.preventDefault();
  b.classList.remove('dragging');
  window.App.ui.handleFiles(e.dataTransfer.files);
});

d.addEventListener('dragstart',e=>{
  const t=e.target;
  if(t instanceof Element&&(t.matches('img,svg')||t.closest('.action-icon'))) e.preventDefault();
});
