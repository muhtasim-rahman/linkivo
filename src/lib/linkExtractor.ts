import JSZip from 'jszip';

export const extractLinksFromText = (text: string): string[] => {
  const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches)];
};

export const extractLinks = async (file: File): Promise<string[]> => {
  let text = '';

  try {
    if (file.name.endsWith('.zip')) {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      for (const filename of Object.keys(contents.files)) {
        if (!contents.files[filename].dir) {
          const fileData = await contents.files[filename].async('text');
          text += fileData + '\n';
        }
      }
    } else {
      // Fallback for text, html, json, and raw binary of pdf/images
      text = await file.text();
    }
  } catch (error) {
    console.error("Error reading file:", error);
  }

  return extractLinksFromText(text);
};
