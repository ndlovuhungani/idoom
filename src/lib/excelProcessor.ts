import * as XLSX from 'xlsx';

export interface ExcelData {
  workbook: XLSX.WorkBook;
  sheetName: string;
  data: string[][];
  linkColumnIndex: number;
  viewsColumnIndex: number;
  instagramLinks: Array<{ row: number; url: string }>;
}

// Instagram URL patterns
const INSTAGRAM_URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/i;

export function isInstagramUrl(url: string): boolean {
  return INSTAGRAM_URL_PATTERN.test(url);
}

export function extractInstagramId(url: string): string | null {
  const match = url.match(INSTAGRAM_URL_PATTERN);
  return match ? match[1] : null;
}

export async function parseExcelFile(file: File): Promise<ExcelData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to 2D array
        const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
          header: 1,
          defval: '',
        });

        // Auto-detect Instagram link column
        let linkColumnIndex = -1;
        let viewsColumnIndex = -1;

        // Check header row first
        if (jsonData.length > 0) {
          const headerRow = jsonData[0].map((cell) => String(cell).toLowerCase());
          
          // Look for link/url column
          linkColumnIndex = headerRow.findIndex(
            (h) => h.includes('link') || h.includes('url') || h.includes('instagram')
          );

          // Look for views column
          viewsColumnIndex = headerRow.findIndex(
            (h) => h.includes('view') || h.includes('count')
          );
        }

        // If no header match, scan for Instagram URLs
        if (linkColumnIndex === -1) {
          for (let row = 0; row < Math.min(jsonData.length, 10); row++) {
            for (let col = 0; col < (jsonData[row]?.length || 0); col++) {
              const cellValue = String(jsonData[row][col] || '');
              if (isInstagramUrl(cellValue)) {
                linkColumnIndex = col;
                break;
              }
            }
            if (linkColumnIndex !== -1) break;
          }
        }

        // If views column not found, use the column right after links
        if (viewsColumnIndex === -1 && linkColumnIndex !== -1) {
          viewsColumnIndex = linkColumnIndex + 1;
        }

        if (linkColumnIndex === -1) {
          throw new Error('Could not find a column with Instagram URLs');
        }

        // Extract all Instagram links with their row numbers
        const instagramLinks: Array<{ row: number; url: string }> = [];
        for (let row = 1; row < jsonData.length; row++) {
          const cellValue = String(jsonData[row]?.[linkColumnIndex] || '');
          if (isInstagramUrl(cellValue)) {
            instagramLinks.push({ row, url: cellValue });
          }
        }

        resolve({
          workbook,
          sheetName,
          data: jsonData as string[][],
          linkColumnIndex,
          viewsColumnIndex,
          instagramLinks,
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function updateExcelWithViews(
  excelData: ExcelData,
  viewsMap: Map<number, number | string>
): Blob {
  const { workbook, sheetName, data, viewsColumnIndex } = excelData;

  // Update the data array with views
  const updatedData = data.map((row, index) => {
    if (index === 0) {
      // Ensure header has views column
      const newRow = [...row];
      if (!newRow[viewsColumnIndex]) {
        newRow[viewsColumnIndex] = 'Views';
      }
      return newRow;
    }

    const views = viewsMap.get(index);
    if (views !== undefined) {
      const newRow = [...row];
      newRow[viewsColumnIndex] = String(views);
      return newRow;
    }

    return row;
  });

  // Create new worksheet from updated data
  const newWorksheet = XLSX.utils.aoa_to_sheet(updatedData);
  workbook.Sheets[sheetName] = newWorksheet;

  // Write to buffer
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function generateDemoViews(): number {
  // Generate realistic-looking view counts
  const ranges = [
    { min: 1000, max: 10000, weight: 0.4 },
    { min: 10000, max: 100000, weight: 0.35 },
    { min: 100000, max: 1000000, weight: 0.2 },
    { min: 1000000, max: 10000000, weight: 0.05 },
  ];

  const random = Math.random();
  let cumWeight = 0;

  for (const range of ranges) {
    cumWeight += range.weight;
    if (random <= cumWeight) {
      return Math.floor(Math.random() * (range.max - range.min) + range.min);
    }
  }

  return Math.floor(Math.random() * 50000 + 5000);
}
