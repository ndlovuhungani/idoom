import ExcelJS from 'exceljs';

export interface ExcelData {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  linkColumnIndex: number;
  viewsColumnIndex: number;
  instagramLinks: Array<{ row: number; url: string }>;
}

// Instagram URL patterns - flexible to match various formats
const INSTAGRAM_URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;

// Fallback pattern for any instagram.com URL
const INSTAGRAM_DOMAIN_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)/i;

export function isInstagramUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().replace(/^["']|["']$/g, ''); // Remove quotes and whitespace
  return INSTAGRAM_URL_PATTERN.test(trimmed) || INSTAGRAM_DOMAIN_PATTERN.test(trimmed);
}

export function extractInstagramId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim().replace(/^["']|["']$/g, '');
  const match = trimmed.match(INSTAGRAM_URL_PATTERN);
  return match ? match[1] : null;
}

export async function parseExcelFile(file: File): Promise<ExcelData> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(arrayBuffer);

  // Get first sheet
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('No worksheets found in the Excel file');
  }
  const sheetName = worksheet.name;

  // Convert worksheet to 2D array for scanning
  const data: string[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const rowData: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      // Pad array if there are gaps
      while (rowData.length < colNumber - 1) {
        rowData.push('');
      }
      rowData[colNumber - 1] = String(cell.value || '');
    });
    // Pad to match rowNumber (1-indexed)
    while (data.length < rowNumber - 1) {
      data.push([]);
    }
    data[rowNumber - 1] = rowData;
  });

  // Auto-detect Instagram link column
  let linkColumnIndex = -1;
  let viewsColumnIndex = -1;

  // Check header row first (row 0 in our array)
  if (data.length > 0) {
    const headerRow = data[0].map((cell) => String(cell).toLowerCase().trim());

    // Look for link/url column with flexible matching
    linkColumnIndex = headerRow.findIndex(
      (h) => h.includes('link') || h.includes('url') || h.includes('instagram') || h.includes('reel') || h.includes('post')
    );

    // Look for views column
    viewsColumnIndex = headerRow.findIndex(
      (h) => h.includes('view') || h.includes('count')
    );
  }

  // If no header match, scan all columns for Instagram URLs
  if (linkColumnIndex === -1) {
    for (let col = 0; col < (data[0]?.length || 0); col++) {
      for (let row = 0; row < Math.min(data.length, 20); row++) {
        const cellValue = String(data[row]?.[col] || '').trim().replace(/^["']|["']$/g, '');
        if (isInstagramUrl(cellValue)) {
          linkColumnIndex = col;
          console.log('Found Instagram URL in column', col, 'row', row, ':', cellValue);
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

  // Extract all Instagram links with their row numbers (1-indexed for ExcelJS)
  const instagramLinks: Array<{ row: number; url: string }> = [];
  for (let row = 1; row < data.length; row++) {
    const rawValue = data[row]?.[linkColumnIndex];
    const cellValue = String(rawValue || '').trim().replace(/^["']|["']$/g, '');
    if (cellValue && isInstagramUrl(cellValue)) {
      // Store as 1-indexed row number for ExcelJS compatibility
      instagramLinks.push({ row: row + 1, url: cellValue });
    }
  }

  console.log('Total rows:', data.length, 'Instagram links found:', instagramLinks.length);
  if (instagramLinks.length === 0) {
    console.log('Sample data from link column:', data.slice(0, 5).map(r => r?.[linkColumnIndex]));
  }

  return {
    workbook,
    sheetName,
    linkColumnIndex,
    viewsColumnIndex,
    instagramLinks,
  };
}

export async function updateExcelWithViews(
  excelData: ExcelData,
  viewsMap: Map<number, number | string>
): Promise<Blob> {
  const { workbook, sheetName, viewsColumnIndex } = excelData;

  // Get the original worksheet - preserves all formatting
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    throw new Error('Worksheet not found');
  }

  // ExcelJS uses 1-based indexing
  const viewsCol = viewsColumnIndex + 1;

  // Update header if views column doesn't have a header
  const headerCell = worksheet.getCell(1, viewsCol);
  if (!headerCell.value) {
    headerCell.value = 'Views';
  }

  // Update only the cells that need views data - formatting is automatically preserved
  viewsMap.forEach((views, rowIndex) => {
    // rowIndex is already 1-indexed from parseExcelFile
    const cell = worksheet.getCell(rowIndex, viewsCol);
    const numericViews = typeof views === 'string' ? parseInt(views, 10) : views;
    cell.value = isNaN(numericViews) ? views : numericViews;
  });

  // Write to buffer - preserves all original formatting
  const buffer = await workbook.xlsx.writeBuffer();
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
