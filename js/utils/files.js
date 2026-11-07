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

// Local date and time as YYYYMMDD-HHMMSS, used to make each exported file name unique.
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

// Cleans the name for use in a file name and adds a timestamp,
// so two projects (or two exports of one project) never download under the same name.
export function safeFileName(name) {
  const base = String(name || 'edmedia').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'edmedia';
  return base + '-' + stamp();
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
