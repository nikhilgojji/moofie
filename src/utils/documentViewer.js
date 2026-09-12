export function spreadsheetPageLocation(sheets, requested = 1) {
  const counts = sheets.map(sheet => Math.ceil(sheet.rows / 100) * Math.ceil(sheet.columns / 30));
  const count = counts.reduce((sum, value) => sum + value, 0);
  const number = Math.max(1, Math.min(count || 1, Math.trunc(requested) || 1));
  let offset = number - 1, sheetIndex = 0;
  while (sheetIndex < counts.length - 1 && offset >= counts[sheetIndex]) offset -= counts[sheetIndex++];
  const across = Math.ceil((sheets[sheetIndex]?.columns || 1) / 30);
  return { count, number, sheetIndex, rowStart: Math.floor(offset / across) * 100, colStart: (offset % across) * 30 };
}

export function documentPageTransform(width, height, rotation, scale) {
  const angle = ((rotation % 360) + 360) % 360;
  const sideways = angle === 90 || angle === 270;
  const x = angle === 90 ? height : angle === 180 ? width : 0;
  const y = angle === 180 ? height : angle === 270 ? width : 0;
  return { width: (sideways ? height : width) * scale, height: (sideways ? width : height) * scale,
    transform: `scale(${scale}) translate(${x}px, ${y}px) rotate(${angle}deg)` };
}
