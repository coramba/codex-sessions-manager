const projectColors = [
  '#ecf1ff', // indigo softer
  '#e2fcfe', // cyan softer
  '#eafdf1', // green softer
  '#fff4e6', // orange softer
  '#fdf1f8', // pink softer
  '#ecf7fe', // sky softer
  '#fef0b9', // amber softer
  '#d9e9fe', // blue softer
  '#ebe6fe', // violet softer
  '#d6f0fe', // light sky softer
  '#ffeff0', // rose softer
  '#e8fbc4', // lime softer
  '#fef8dd', // yellow softer
  '#dde4fe', // periwinkle softer
  '#d6fae3', // mint softer
  '#f9e3fe', // fuchsia softer
  '#fee1e5', // rose blush
  '#ddfbe0', // soft mint
  '#fff1d6', // amber light
  '#dfefff', // powder blue
  '#daf8ff', // aqua soft
  '#ffe6ff', // light magenta
  '#e3fcef', // emerald soft
  '#fde2f1', // pink blush
];

const assignedColors = new Map();
const usedIndexes = new Set();

export const projectTone = (projectName) => {
  // djb2 hash gives a quick, stable spread across the palette
  let hash = 5381;
  for (const ch of projectName || '') {
    hash = (hash * 33) ^ ch.charCodeAt(0);
  }

  if (assignedColors.has(projectName)) {
    return assignedColors.get(projectName);
  }

  const paletteSize = projectColors.length;
  const baseIndex = (hash >>> 0) % paletteSize;
  let index = baseIndex;

  // Avoid reusing a color already taken on the current page; walk forward to the next free slot.
  for (let i = 0; i < paletteSize; i += 1) {
    if (!usedIndexes.has(index)) {
      break;
    }
    index = (index + 1) % paletteSize;
  }

  // If all colors are used, fall back to the base index (duplicates unavoidable).
  usedIndexes.add(index);
  const color = projectColors[index];
  assignedColors.set(projectName, color);
  return color;
};

export const tones = projectColors;
