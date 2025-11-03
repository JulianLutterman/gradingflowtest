export function sanitizeFilename(filename) {
  if (!filename) return '';
  return filename.replace(/[\s%20]+/g, '_');
}
