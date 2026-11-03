export function imageFileFromClipboard(event: ClipboardEvent): File | null {
  const data = event.clipboardData;
  if (!data) return null;
  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/')) return file;
  }
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}
