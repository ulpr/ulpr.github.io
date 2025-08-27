const app = window.App;
const { refs } = app;

const openFilePicker = () => {
  const { fileInput } = refs;
  fileInput.value = '';
  fileInput.multiple = false;
  fileInput.removeAttribute('webkitdirectory');
  fileInput.removeAttribute('directory');
  fileInput.click();
};

const openFolderPicker = () => {
  const directoryInput = document.createElement('input');
  directoryInput.type = 'file';
  directoryInput.webkitdirectory = true;
  directoryInput.addEventListener('change', (event) => {
    app.ui.handleFiles(event.target.files);
  });
  directoryInput.click();
};

const handleFileInputChange = (event) => {
  app.ui.handleFiles(event.target.files);
};

refs.uploadFileButton.addEventListener('click', openFilePicker);
refs.uploadFolderButton.addEventListener('click', openFolderPicker);
refs.fileInput.addEventListener('change', handleFileInputChange);
