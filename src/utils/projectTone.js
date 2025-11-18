const projectColors = [
  '#eef2ff', // indigo 50
  '#ecfeff', // cyan 50
  '#f0fdf4', // green 50
  '#fff7ed', // orange 50
  '#fdf2f8', // pink 50
  '#f0f9ff', // sky 50
  '#fef3c7', // amber 100
  '#e0f2fe', // blue 100
  '#f5f3ff', // violet 50
  '#e7f5ff', // light blue
  '#fff0f6', // rose 50
  '#f2fce7', // lime 50
  '#fef9c3', // yellow 100
  '#e4e8ff', // periwinkle
  '#e8fff3', // mint
  '#fdf4ff', // fuchsia 50
];

export const projectTone = (projectName) => {
  let hash = 0;
  for (const ch of projectName || '') {
    hash = (hash + ch.charCodeAt(0)) % 997;
  }
  return projectColors[hash % projectColors.length];
};

export const tones = projectColors;
