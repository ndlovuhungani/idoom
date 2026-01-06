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

interface LinkInfo {
  row: number;
  col: number;
  url: string;
  viewsRow: number;
  viewsCol: number;
}

interface ApifyResult {
  url?: string;
  inputUrl?: string;
  videoPlayCount?: number;
  playCount?: number;
}

interface HikerResult {
  play_count?: number;
  video_play_count?: number;
}

async function fetchWithApify(urls: string[], apiKey: string): Promise<Record<string, number | string>> {
  const actorId = 'apify/instagram-reel-scraper';
  const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiKey}`;

  const response = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: urls }),
  });

  if (!response.ok) {
    throw new Error(`Apify API error: ${response.status}`);
  }

  const results: ApifyResult[] = await response.json();
  const viewsMap: Record<string, number | string> = {};
  
  for (const result of results) {
    const url = result.inputUrl || result.url;
    if (url) {
      const views = result.videoPlayCount ?? result.playCount;
      viewsMap[url] = views !== undefined && views !== null ? views : 'N/A';
    }
  }

  for (const url of urls) {
    if (!(url in viewsMap)) {
      viewsMap[url] = 'Error';
    }
  }

  return viewsMap;
}

async function fetchWithHiker(urls: string[], apiKey: string): Promise<Record<string, number | string>> {
  const viewsMap: Record<string, number | string> = {};

  for (const url of urls) {
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
        viewsMap[url] = 'Error';
        continue;
      }

      const result: HikerResult = await response.json();
      const views = result.play_count ?? result.video_play_count;
      viewsMap[url] = views !== undefined && views !== null ? views : 'N/A';
    } catch {
      viewsMap[url] = 'Error';
    }
  }

  return viewsMap;
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

    // Parse Excel file using SheetJS (works in Deno)
    const { default: ExcelJS } = await import("https://esm.sh/exceljs@4.4.0");
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await fileData.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('No worksheets found');
    }

    // Find Instagram links
    const instagramLinks: LinkInfo[] = [];
    
    worksheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
      row.eachCell({ includeEmpty: false }, (cell: any, colNumber: number) => {
        let value = '';
        if (cell.value) {
          if (typeof cell.value === 'object' && 'hyperlink' in cell.value) {
            value = String(cell.value.hyperlink || cell.value.text || '');
          } else if (typeof cell.value === 'object' && 'richText' in cell.value) {
            value = cell.value.richText.map((rt: any) => rt.text).join('');
          } else {
            value = String(cell.value);
          }
        }

        if (isInstagramUrl(value)) {
          instagramLinks.push({
            row: rowNumber,
            col: colNumber,
            url: value.trim().replace(/^["']|["']$/g, ''),
            viewsRow: rowNumber,
            viewsCol: colNumber + 1,
          });
        }
      });
    });

    console.log(`Found ${instagramLinks.length} Instagram links`);

    // Get app settings for API mode
    const { data: settings } = await supabase
      .from('app_settings')
      .select('api_mode')
      .single();

    const apiMode = settings?.api_mode || 'demo';
    console.log(`Using API mode: ${apiMode}`);

    // Fetch views
    const viewsMap: Record<string, number | string> = {};
    const batchSize = 10;
    let processedCount = 0;
    let failedCount = 0;

    if (apiMode === 'demo') {
      for (let i = 0; i < instagramLinks.length; i++) {
        const link = instagramLinks[i];
        viewsMap[link.url] = generateDemoViews();
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
    } else {
      const urls = instagramLinks.map(l => l.url);
      
      for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        
        try {
          let batchViews: Record<string, number | string>;
          
          if (apiMode === 'hiker') {
            const apiKey = Deno.env.get('HIKER_API_KEY');
            if (!apiKey) throw new Error('HIKER_API_KEY not configured');
            batchViews = await fetchWithHiker(batch, apiKey);
          } else {
            const apiKey = Deno.env.get('APIFY_API_KEY');
            if (!apiKey) throw new Error('APIFY_API_KEY not configured');
            batchViews = await fetchWithApify(batch, apiKey);
          }

          Object.entries(batchViews).forEach(([url, views]) => {
            viewsMap[url] = views;
            if (views === 'Error') failedCount++;
          });
        } catch (error) {
          console.error('Batch error:', error);
          batch.forEach(url => {
            viewsMap[url] = 'Error';
            failedCount++;
          });
        }

        processedCount = Math.min(i + batchSize, urls.length);
        await supabase
          .from('processing_jobs')
          .update({ processed_links: processedCount, failed_links: failedCount })
          .eq('id', jobId);
      }
    }

    // Update Excel with views
    for (const link of instagramLinks) {
      const views = viewsMap[link.url];
      if (views === undefined) continue;

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
