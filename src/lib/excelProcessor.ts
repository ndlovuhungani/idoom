import ExcelJS from 'exceljs';

export type FileFormat = 'vertical' | 'horizontal' | 'alternating';

export interface LinkInfo {
  row: number;       // 1-indexed row
  col: number;       // 1-indexed column  
  url: string;
  viewsRow: number;  // Where to write the views (row)
  viewsCol: number;  // Where to write the views (column)
}

export interface ExcelData {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  format: FileFormat;
  instagramLinks: LinkInfo[];
}

// Instagram URL patterns
const INSTAGRAM_URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;
const INSTAGRAM_DOMAIN_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)/i;

export function isInstagramUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().replace(/^["']|["']$/g, '');
  return INSTAGRAM_URL_PATTERN.test(trimmed) || INSTAGRAM_DOMAIN_PATTERN.test(trimmed);
}

export function extractInstagramId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim().replace(/^["']|["']$/g, '');
  const match = trimmed.match(INSTAGRAM_URL_PATTERN);
  return match ? match[1] : null;
}

function getCellValue(cell: ExcelJS.Cell): string {
  if (!cell || !cell.value) return '';
  
  // Handle hyperlinks
  if (typeof cell.value === 'object' && 'hyperlink' in cell.value) {
    return String(cell.value.hyperlink || cell.value.text || '');
  }
  
  // Handle rich text
  if (typeof cell.value === 'object' && 'richText' in cell.value) {
    return cell.value.richText.map((rt: any) => rt.text).join('');
  }
  
  return String(cell.value);
}

function isViewsHeader(value: string): boolean {
  const lower = value.toLowerCase().trim();
  return lower.includes('view') || lower.includes('og view') || lower === 'views';
}

export async function parseExcelFile(file: File): Promise<ExcelData> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('No worksheets found in the Excel file');
  }
  const sheetName = worksheet.name;

  // Scan the entire sheet to find Instagram links and detect format
  const instagramLinks: LinkInfo[] = [];
  const linkColumnCounts: Map<number, number> = new Map();
  let existingViewsColumns: Map<number, number> = new Map(); // linkCol -> viewsCol

  // First pass: Find all Instagram links and their positions
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const value = getCellValue(cell);
      if (isInstagramUrl(value)) {
        linkColumnCounts.set(colNumber, (linkColumnCounts.get(colNumber) || 0) + 1);
        instagramLinks.push({
          row: rowNumber,
          col: colNumber,
          url: value.trim().replace(/^["']|["']$/g, ''),
          viewsRow: rowNumber,
          viewsCol: colNumber + 1, // Default: next column
        });
      }
    });
  });

  if (instagramLinks.length === 0) {
    throw new Error('Could not find any Instagram URLs in the file');
  }

  // Group links by row to detect format
  const linksPerRow = new Map<number, LinkInfo[]>();
  for (const link of instagramLinks) {
    if (!linksPerRow.has(link.row)) {
      linksPerRow.set(link.row, []);
    }
    linksPerRow.get(link.row)!.push(link);
  }

  // Detect format: If any row has multiple links, check if it's alternating or horizontal-below
  const hasMultipleLinksPerRow = Array.from(linksPerRow.values()).some(
    links => links.length > 1
  );

  const uniqueLinkCols = Array.from(linkColumnCounts.keys()).sort((a, b) => a - b);
  let format: FileFormat = 'vertical';

  // Check for alternating pattern FIRST (Link | Views | Link | Views)
  // This takes priority even when there are multiple links per row
  if (uniqueLinkCols.length >= 2) {
    const gaps = [];
    for (let i = 1; i < uniqueLinkCols.length; i++) {
      gaps.push(uniqueLinkCols[i] - uniqueLinkCols[i - 1]);
    }
    // If all gaps are 2, it's alternating (col 1, 3, 5... or col 2, 4, 6...)
    if (gaps.every(g => g === 2)) {
      format = 'alternating';
    }
  }

  // If not alternating, check for horizontal format using majority-vote heuristic
  if (format !== 'alternating' && hasMultipleLinksPerRow) {
    // Sample links to determine if views go RIGHT or BELOW
    let preferRight = 0;
    let preferBelow = 0;

    for (const link of instagramLinks) {
      const rightCell = worksheet.getCell(link.row, link.col + 1);
      const belowCell = worksheet.getCell(link.row + 1, link.col);
      const rightValue = getCellValue(rightCell);
      const belowValue = getCellValue(belowCell);

      // CRITICAL: If below cell contains an Instagram URL, views CANNOT go below
      if (isInstagramUrl(belowValue)) {
        preferRight++;
        continue;
      }
      // CRITICAL: If right cell contains an Instagram URL, views CANNOT go right
      if (isInstagramUrl(rightValue)) {
        preferBelow++;
        continue;
      }

      // Check if right cell is empty or numeric (likely views placeholder)
      const rightIsEmpty = !rightValue || rightValue.trim() === '';
      const rightIsNumeric = !isNaN(Number(rightValue));
      
      // Check if below cell is empty or numeric
      const belowIsEmpty = !belowValue || belowValue.trim() === '';
      const belowIsNumeric = !isNaN(Number(belowValue));

      // Prefer RIGHT if right cell is empty/numeric AND below is NOT empty/numeric
      // Prefer BELOW if below cell is empty/numeric AND right is NOT empty/numeric
      if ((rightIsEmpty || rightIsNumeric) && !belowIsEmpty && !belowIsNumeric) {
        preferRight++;
      } else if ((belowIsEmpty || belowIsNumeric) && !rightIsEmpty && !rightIsNumeric) {
        preferBelow++;
      } else if (rightIsEmpty && belowIsEmpty) {
        // Both empty - default to right (same row)
        preferRight++;
      } else if (rightIsNumeric && !belowIsNumeric) {
        // Right has existing numbers (views), prefer right
        preferRight++;
      } else if (belowIsNumeric && !rightIsNumeric) {
        // Below has existing numbers (views), prefer below
        preferBelow++;
      }
    }

    console.log('Placement vote:', { preferRight, preferBelow });

    // Use majority vote - if more prefer below, use horizontal format
    if (preferBelow > preferRight) {
      format = 'horizontal';
    }
  }

  // Apply placement rules based on detected format
  if (format === 'horizontal') {
    // Horizontal format: views go in row BELOW the link, same column
    for (const link of instagramLinks) {
      link.viewsRow = link.row + 1;
      link.viewsCol = link.col;
    }
  } else {
    // Vertical or Alternating: views go in column AFTER the link, same row
    // Find existing views columns by checking headers (only if header is adjacent to link column)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const value = getCellValue(cell);
      if (isViewsHeader(value)) {
        for (const linkCol of uniqueLinkCols) {
          // Only map if views header is exactly at linkCol + 1 (adjacent)
          if (colNumber === linkCol + 1) {
            existingViewsColumns.set(linkCol, colNumber);
          }
        }
      }
    });

    // Update viewsCol for vertical/alternating format
    for (const link of instagramLinks) {
      link.viewsRow = link.row; // Same row
      link.viewsCol = existingViewsColumns.get(link.col) || link.col + 1;
      
      // SAFETY: viewsCol must NEVER be the same as linkCol (would overwrite link)
      if (link.viewsCol === link.col) {
        link.viewsCol = link.col + 1;
      }
    }
  }

  // POST-PROCESSING VALIDATION: Ensure no target cell contains an Instagram URL
  for (const link of instagramLinks) {
    const targetCell = worksheet.getCell(link.viewsRow, link.viewsCol);
    const targetValue = getCellValue(targetCell);
    
    if (isInstagramUrl(targetValue)) {
      console.warn(`Target cell (${link.viewsRow}, ${link.viewsCol}) contains Instagram URL, finding safer alternative`);
      
      // Try alternative placements: right first, then below
      const rightCell = worksheet.getCell(link.row, link.col + 1);
      const rightValue = getCellValue(rightCell);
      
      if (!isInstagramUrl(rightValue) && link.col + 1 !== link.col) {
        link.viewsRow = link.row;
        link.viewsCol = link.col + 1;
      } else {
        const belowCell = worksheet.getCell(link.row + 1, link.col);
        const belowValue = getCellValue(belowCell);
        
        if (!isInstagramUrl(belowValue)) {
          link.viewsRow = link.row + 1;
          link.viewsCol = link.col;
        } else {
          // Mark as invalid - will be skipped during write
          console.warn(`No safe cell found for link at (${link.row}, ${link.col})`);
        }
      }
    }
  }

  console.log('Detected format:', format);
  console.log('Links per row:', Array.from(linksPerRow.entries()).map(([row, links]) => `Row ${row}: ${links.length} links`));
  console.log('Total Instagram links found:', instagramLinks.length);
  
  // Debug: log sample mapping
  if (instagramLinks.length > 0) {
    console.log('Sample link mapping:', {
      linkRow: instagramLinks[0].row,
      linkCol: instagramLinks[0].col,
      viewsRow: instagramLinks[0].viewsRow,
      viewsCol: instagramLinks[0].viewsCol,
    });
  }

  return {
    workbook,
    sheetName,
    format,
    instagramLinks,
  };
}

// Find a safe cell to write views (not a link cell)
function findSafeViewsCell(
  worksheet: ExcelJS.Worksheet,
  link: LinkInfo
): { row: number; col: number } | null {
  // Candidate cells in priority order
  const candidates = [
    { row: link.viewsRow, col: link.viewsCol },  // Preferred from mapping
    { row: link.row, col: link.col + 1 },        // Right of link
    { row: link.row + 1, col: link.col },        // Below link
  ];

  for (const candidate of candidates) {
    // Never write to the link cell itself
    if (candidate.row === link.row && candidate.col === link.col) {
      continue;
    }

    const cell = worksheet.getCell(candidate.row, candidate.col);
    const value = getCellValue(cell);

    // Skip if this cell contains an Instagram URL
    if (isInstagramUrl(value)) {
      continue;
    }

    // Safe cell: empty, numeric, or non-Instagram text
    const isEmpty = !value || value.trim() === '';
    const isNumeric = !isEmpty && !isNaN(Number(value));
    
    if (isEmpty || isNumeric) {
      return candidate;
    }
  }

  return null; // No safe cell found
}

export async function updateExcelWithViews(
  excelData: ExcelData,
  viewsMap: Map<string, number | string> // Map of URL -> views
): Promise<Blob> {
  const { workbook, sheetName, instagramLinks } = excelData;

  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    throw new Error('Worksheet not found');
  }

  let writtenCount = 0;
  let skippedCount = 0;

  // Update views for each link at its designated position
  for (const link of instagramLinks) {
    const views = viewsMap.get(link.url);
    if (views === undefined) continue;

    // Find a safe cell that won't overwrite links
    const safeCell = findSafeViewsCell(worksheet, link);
    
    if (!safeCell) {
      console.warn(`Skipped write for link at (${link.row}, ${link.col}): no safe cell found`);
      skippedCount++;
      continue;
    }

    const cell = worksheet.getCell(safeCell.row, safeCell.col);
    const originalValue = getCellValue(cell);
    
    // Double-check: NEVER overwrite an Instagram URL
    if (isInstagramUrl(originalValue)) {
      console.warn(`BLOCKED overwrite of Instagram link at (${safeCell.row}, ${safeCell.col})`);
      skippedCount++;
      continue;
    }

    const numericViews = typeof views === 'string' ? parseInt(views, 10) : views;
    cell.value = isNaN(numericViews) ? views : numericViews;
    writtenCount++;
  }

  console.log(`Views written: ${writtenCount}, skipped: ${skippedCount}`);

  // Write to buffer - preserves all original formatting
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function generateDemoViews(): number {
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
