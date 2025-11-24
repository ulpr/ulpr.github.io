const { refs, ui } = window.App;
const handleFiles = e => ui.handleFiles(e.target.files);
const openFilePicker = () => { const i = refs.fileInput; i.value = '';
  i.multiple = false;
  i.removeAttribute('webkitdirectory');
  i.removeAttribute('directory');
  i.click()
};
const directoryInput = document.createElement('input');
directoryInput.type = 'file';
directoryInput.webkitdirectory = true;
directoryInput.addEventListener('change', handleFiles);
const openFolderPicker = () => directoryInput.click();
refs.uploadFileButton.addEventListener('click', openFilePicker);
refs.uploadFolderButton.addEventListener('click', openFolderPicker);
refs.fileInput.addEventListener('change', handleFiles);
