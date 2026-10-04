// js/utils/files.js

// Opens the device photo picker. Resolves a File, or null when cancelled or not an image.
export function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    function done(file) {
      input.remove();
      resolve(file && file.type && file.type.startsWith('image/') ? file : null);
    }
    input.addEventListener('change', () => done(input.files && input.files[0]));
    input.addEventListener('cancel', () => done(null));
    document.body.append(input);
    input.click();
  });
}

export function safeFileName(name) {
  return String(name || 'edmedia').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'edmedia';
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
