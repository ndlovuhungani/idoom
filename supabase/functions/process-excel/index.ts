import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Instagram URL patterns
const INSTAGRAM_URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;
const INSTAGRAM_DOMAIN_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)/i;

function isInstagramUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().replace(/^["']|["']$/g, '');
  return INSTAGRAM_URL_PATTERN.test(trimmed) || INSTAGRAM_DOMAIN_PATTERN.test(trimmed);
}

// Extract Instagram ID (shortcode) from URL - used for matching
function extractInstagramId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim().replace(/^["']|["']$/g, '');
  const match = trimmed.match(INSTAGRAM_URL_PATTERN);
  return match ? match[1] : null;
}

interface LinkInfo {
  row: number;
  col: number;
  url: string;
  igId: string; // Instagram shortcode for matching
  viewsRow: number;
  viewsCol: number;
}

type FileFormat = 'vertical' | 'horizontal-below' | 'alternating';

interface ApifyResult {
  url?: string;
  inputUrl?: string;
  videoPlayCount?: number;
  playCount?: number;
}

interface HikerResult {
  view_count?: number;       // Primary field for reels/videos
  play_count?: number;
  video_play_count?: number;
}

// Helper to check if a cell value looks like a "Views" header
function isViewsHeader(value: string): boolean {
  if (!value) return false;
  const lower = value.toLowerCase().trim();
  return lower === 'views' || lower === 'view' || lower === 'visualizações' || 
         lower === 'vistas' || lower === 'vues' || lower === 'aufrufe';
}

// Helper to get cell value as string
function getCellValue(cell: any): string {
  if (!cell || !cell.value) return '';
  const val = cell.value;
  if (typeof val === 'object' && 'hyperlink' in val) {
    return String(val.hyperlink || val.text || '');
  } else if (typeof val === 'object' && 'richText' in val) {
    return val.richText.map((rt: any) => rt.text).join('');
  }
  return String(val);
}

// Detect the layout format of the Excel file
function detectFormat(worksheet: any, links: { row: number; col: number }[]): FileFormat {
  if (links.length < 2) return 'vertical';
  
  // Check for alternating pattern (Link|Views|Link|Views in same row)
  const rowGroups = new Map<number, number[]>();
  for (const link of links) {
    const cols = rowGroups.get(link.row) || [];
    cols.push(link.col);
    rowGroups.set(link.row, cols);
  }
  
  // If multiple links in same row with gaps, likely alternating
  for (const [_row, cols] of rowGroups) {
    if (cols.length >= 2) {
      cols.sort((a, b) => a - b);
      // Check if there's a gap of 2 (Link|Views|Link pattern)
      for (let i = 1; i < cols.length; i++) {
        if (cols[i] - cols[i - 1] === 2) {
          return 'alternating';
        }
      }
    }
  }
  
  // Check first few links for vertical vs horizontal
  const firstLink = links[0];
  const secondLink = links[1];
  
  if (firstLink.row === secondLink.row) {
    // Same row = horizontal layout, views go below
    return 'horizontal-below';
  }
  
  // Check if there's a "Views" header to the right
  const rightCell = worksheet.getCell(firstLink.row, firstLink.col + 1);
  const rightValue = getCellValue(rightCell);
  if (isViewsHeader(rightValue) || !isInstagramUrl(rightValue)) {
    return 'vertical';
  }
  
  return 'vertical';
}

// Find a safe cell to write views (won't overwrite Instagram links)
function findSafeViewsCell(
  worksheet: any, 
  link: { row: number; col: number }, 
  format: FileFormat,
  allLinks: Set<string>
): { row: number; col: number } {
  const cellKey = (r: number, c: number) => `${r}:${c}`;
  
  if (format === 'horizontal-below') {
    // Views go in the row below
    const targetRow = link.row + 1;
    const targetCol = link.col;
    
    // Check if safe
    const cell = worksheet.getCell(targetRow, targetCol);
    const value = getCellValue(cell);
    if (!isInstagramUrl(value) && !allLinks.has(cellKey(targetRow, targetCol))) {
      return { row: targetRow, col: targetCol };
    }
    
    // Try row + 2 as fallback
    return { row: link.row + 2, col: link.col };
  }
  
  // Vertical or alternating: views go to the right
  let targetCol = link.col + 1;
  
  // Check if the target cell contains an Instagram URL
  const rightCell = worksheet.getCell(link.row, targetCol);
  const rightValue = getCellValue(rightCell);
  
  if (isInstagramUrl(rightValue) || allLinks.has(cellKey(link.row, targetCol))) {
    // Try next column
    targetCol = link.col + 2;
    const nextCell = worksheet.getCell(link.row, targetCol);
    const nextValue = getCellValue(nextCell);
    
    if (isInstagramUrl(nextValue) || allLinks.has(cellKey(link.row, targetCol))) {
      // Last resort: try below the link
      return { row: link.row + 1, col: link.col };
    }
  }
  
  return { row: link.row, col: targetCol };
}

async function fetchWithApify(urls: string[], apiKey: string): Promise<Record<string, number | string>> {
  const actorId = 'apify~instagram-reel-scraper';
  const runUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`;
  
  const input = {
    username: urls,
    resultsLimit: urls.length * 5,
  };

  console.log(`Starting Apify actor run with ${urls.length} URLs...`);
  const runResponse = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!runResponse.ok) {
    const errorText = await runResponse.text();
    console.error('Apify run start error:', runResponse.status, errorText);
    throw new Error(`Apify API error: ${runResponse.status}`);
  }

  const runData = await runResponse.json();
  const runId = runData.data.id;
  const datasetId = runData.data.defaultDatasetId;
  
  console.log(`Actor run started: ${runId}, waiting for completion...`);
  
  // Poll for run completion (max 2 minutes)
  let attempts = 0;
  const maxAttempts = 24;
  
  while (attempts < maxAttempts) {
    const statusResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`
    );
    const statusData = await statusResponse.json();
    const status = statusData.data.status;
    
    if (status === 'SUCCEEDED') {
      console.log('Actor run completed successfully');
      break;
    } else if (status === 'FAILED' || status === 'ABORTED') {
      throw new Error(`Actor run ${status}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('Actor run timed out');
  }
  
  // Fetch results from dataset
  const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}`;
  const resultsResponse = await fetch(datasetUrl);
  const results: ApifyResult[] = await resultsResponse.json();
  
  console.log(`Received ${results.length} results from Apify`);

  // Build map by Instagram ID, not URL string
  const viewsByIgId: Record<string, number | string> = {};
  
  for (const result of results) {
    const resultUrl = result.inputUrl || result.url;
    if (resultUrl) {
      const igId = extractInstagramId(resultUrl);
      if (igId) {
        const views = result.videoPlayCount ?? result.playCount;
        viewsByIgId[igId] = views !== undefined && views !== null ? views : 'N/A';
        console.log(`Apify result: ID=${igId}, views=${views}`);
      }
    }
  }

  // Mark any requested IDs not in results as Error
  for (const url of urls) {
    const igId = extractInstagramId(url);
    if (igId && !(igId in viewsByIgId)) {
      viewsByIgId[igId] = 'Error';
    }
  }

  console.log(`Apify final map has ${Object.keys(viewsByIgId).length} entries`);
  return viewsByIgId;
}

async function fetchSingleHikerUrl(url: string, apiKey: string): Promise<{ igId: string; views: number | string }> {
  const igId = extractInstagramId(url);
  if (!igId) {
    console.log(`Hiker: Could not extract ID from ${url}`);
    return { igId: '', views: 'Error' };
  }

  try {
    const response = await fetch(
      `https://api.hikerapi.com/v2/media/by/url?url=${encodeURIComponent(url)}`,
      {
        headers: {
          'accept': 'application/json',
          'x-access-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      console.log(`Hiker: Error ${response.status} for ID=${igId}`);
      return { igId, views: 'Error' };
    }

    const result: HikerResult = await response.json();
    // Check view_count first (primary field for reels), then fallbacks
    const views = result.view_count ?? result.play_count ?? result.video_play_count;
    console.log(`Hiker result: ID=${igId}, view_count=${result.view_count}, play_count=${result.play_count}, final=${views}`);
    return { igId, views: views !== undefined && views !== null ? views : 'N/A' };
  } catch (error) {
    console.error(`Hiker: Exception for ID=${igId}:`, error);
    return { igId, views: 'Error' };
  }
}

function generateDemoViews(): number {
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

async function processJob(jobId: string, supabase: any) {
  console.log(`Starting background processing for job: ${jobId}`);
  
  try {
    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      console.error('Job not found:', jobError);
      return;
    }

    const sourceFilePath = job.source_file_path as string;
    if (!sourceFilePath) {
      throw new Error('No source file path in job');
    }

    // Update status to processing
    await supabase
      .from('processing_jobs')
      .update({ status: 'processing' })
      .eq('id', jobId);

    // Download source file from storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('excel-files')
      .download(sourceFilePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // Parse Excel file
    const { default: ExcelJS } = await import("https://esm.sh/exceljs@4.4.0");
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await fileData.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('No worksheets found');
    }

    // Find Instagram links and extract IDs
    const rawLinks: { row: number; col: number; url: string; igId: string }[] = [];
    
    worksheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
      row.eachCell({ includeEmpty: false }, (cell: any, colNumber: number) => {
        const value = getCellValue(cell);
        
        if (isInstagramUrl(value)) {
          const cleanUrl = value.trim().replace(/^["']|["']$/g, '');
          const igId = extractInstagramId(cleanUrl);
          if (igId) {
            rawLinks.push({
              row: rowNumber,
              col: colNumber,
              url: cleanUrl,
              igId,
            });
          }
        }
      });
    });

    console.log(`Found ${rawLinks.length} Instagram links`);

    // Detect file format
    const format = detectFormat(worksheet, rawLinks);
    console.log(`Detected format: ${format}`);

    // Build set of all link cell positions
    const allLinkCells = new Set(rawLinks.map(l => `${l.row}:${l.col}`));

    // Calculate views cell for each link
    const instagramLinks: LinkInfo[] = rawLinks.map(link => {
      const viewsCell = findSafeViewsCell(worksheet, link, format, allLinkCells);
      return {
        ...link,
        viewsRow: viewsCell.row,
        viewsCol: viewsCell.col,
      };
    });

    // Update job with total links count
    await supabase
      .from('processing_jobs')
      .update({ total_links: instagramLinks.length })
      .eq('id', jobId);

    // Get app settings for API mode
    const { data: settings } = await supabase
      .from('app_settings')
      .select('api_mode')
      .single();

    const apiMode = settings?.api_mode || 'demo';
    console.log(`Using API mode: ${apiMode}`);

    // Fetch views - keyed by Instagram ID
    const viewsByIgId: Record<string, number | string> = {};
    const batchSize = 10;
    let processedCount = 0;
    let failedCount = 0;

    if (apiMode === 'demo') {
      for (let i = 0; i < instagramLinks.length; i++) {
        const link = instagramLinks[i];
        viewsByIgId[link.igId] = generateDemoViews();
        processedCount++;

        // Update progress every 10 links
        if ((i + 1) % batchSize === 0 || i === instagramLinks.length - 1) {
          await supabase
            .from('processing_jobs')
            .update({ processed_links: processedCount })
            .eq('id', jobId);
        }

        // Small delay to simulate API calls
        await new Promise(r => setTimeout(r, 50));
      }
    } else if (apiMode === 'hiker') {
      // Hiker: Process each URL individually for gradual progress
      const apiKey = Deno.env.get('HIKER_API_KEY');
      if (!apiKey) throw new Error('HIKER_API_KEY not configured');
      
      for (let i = 0; i < instagramLinks.length; i++) {
        const link = instagramLinks[i];
        const result = await fetchSingleHikerUrl(link.url, apiKey);
        
        if (result.igId) {
          viewsByIgId[result.igId] = result.views;
          if (result.views === 'Error') failedCount++;
        }
        
        processedCount = i + 1;
        // Update progress after each URL
        await supabase
          .from('processing_jobs')
          .update({ processed_links: processedCount, failed_links: failedCount })
          .eq('id', jobId);
      }
    } else {
      // Apify: Process in batches
      const apiKey = Deno.env.get('APIFY_API_KEY');
      if (!apiKey) throw new Error('APIFY_API_KEY not configured');
      
      const urls = instagramLinks.map(l => l.url);
      
      for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        
        try {
          const batchViews = await fetchWithApify(batch, apiKey);

          // Merge batch results
          Object.entries(batchViews).forEach(([igId, views]) => {
            viewsByIgId[igId] = views;
            if (views === 'Error') failedCount++;
          });
        } catch (error) {
          console.error('Batch error:', error);
          // Mark all in batch as Error by their IDs
          batch.forEach(url => {
            const igId = extractInstagramId(url);
            if (igId) {
              viewsByIgId[igId] = 'Error';
              failedCount++;
            }
          });
        }

        processedCount = Math.min(i + batchSize, urls.length);
        await supabase
          .from('processing_jobs')
          .update({ processed_links: processedCount, failed_links: failedCount })
          .eq('id', jobId);
      }
    }

    // Log summary
    const successCount = Object.values(viewsByIgId).filter(v => typeof v === 'number').length;
    const naCount = Object.values(viewsByIgId).filter(v => v === 'N/A').length;
    const errorCount = Object.values(viewsByIgId).filter(v => v === 'Error').length;
    console.log(`Views summary: ${successCount} success, ${naCount} N/A, ${errorCount} Error`);

    // Update Excel with views - lookup by Instagram ID
    for (const link of instagramLinks) {
      const views = viewsByIgId[link.igId];
      if (views === undefined) {
        console.log(`No views found for ID=${link.igId}`);
        continue;
      }

      const cell = worksheet.getCell(link.viewsRow, link.viewsCol);
      const numericViews = typeof views === 'string' ? parseInt(views, 10) : views;
      cell.value = isNaN(numericViews) ? views : numericViews;
    }

    // Write updated workbook to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const resultBlob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    // Upload result file to storage
    const resultPath = sourceFilePath.replace(/\.xlsx?$/i, '_processed.xlsx');
    const { error: uploadError } = await supabase
      .storage
      .from('excel-files')
      .upload(resultPath, resultBlob, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload result: ${uploadError.message}`);
    }

    // Mark job as completed
    await supabase
      .from('processing_jobs')
      .update({
        status: 'completed',
        result_file_path: resultPath,
        processed_links: instagramLinks.length,
        failed_links: failedCount,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    console.log(`Job ${jobId} completed successfully`);

  } catch (error) {
    console.error('Processing error:', error);
    await supabase
      .from('processing_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', jobId);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId } = await req.json();
    
    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'jobId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role for background processing
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Start background processing
    EdgeRuntime.waitUntil(processJob(jobId, supabase));

    // Return immediately - processing continues in background
    return new Response(
      JSON.stringify({ success: true, message: 'Processing started' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
