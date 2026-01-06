import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApifyInput {
  directUrls: string[];
  resultsLimit: number;
}

interface ApifyResult {
  url?: string;
  inputUrl?: string;
  videoPlayCount?: number;
  playCount?: number;
  error?: string;
}

interface HikerResult {
  play_count?: number;
  video_play_count?: number;
}

async function fetchWithApify(urls: string[], apiKey: string): Promise<Record<string, number | string>> {
  const actorId = 'apify~instagram-scraper';
  const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiKey}`;

  const input: ApifyInput = {
    directUrls: urls,
    resultsLimit: urls.length,
  };

  console.log('Calling Apify API...');
  const response = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Apify API error:', response.status, errorText);
    throw new Error(`Apify API error: ${response.status}`);
  }

  const results: ApifyResult[] = await response.json();
  console.log(`Received ${results.length} results from Apify`);

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
      console.log(`Fetching views for: ${url}`);
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
        console.error(`Hiker API error for ${url}:`, response.status);
        viewsMap[url] = 'Error';
        continue;
      }

      const result: HikerResult = await response.json();
      const views = result.play_count ?? result.video_play_count;
      viewsMap[url] = views !== undefined && views !== null ? views : 'N/A';
    } catch (error) {
      console.error(`Error fetching ${url}:`, error);
      viewsMap[url] = 'Error';
    }
  }

  return viewsMap;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { urls, mode = 'apify' } = await req.json();
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'urls array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${urls.length} Instagram URLs via ${mode}`);

    let viewsMap: Record<string, number | string>;

    if (mode === 'hiker') {
      const HIKER_API_KEY = Deno.env.get('HIKER_API_KEY');
      if (!HIKER_API_KEY) {
        console.error('HIKER_API_KEY is not configured');
        return new Response(
          JSON.stringify({ error: 'HIKER_API_KEY is not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      viewsMap = await fetchWithHiker(urls, HIKER_API_KEY);
    } else {
      const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');
      if (!APIFY_API_KEY) {
        console.error('APIFY_API_KEY is not configured');
        return new Response(
          JSON.stringify({ error: 'APIFY_API_KEY is not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      viewsMap = await fetchWithApify(urls, APIFY_API_KEY);
    }

    console.log('Successfully processed all URLs');
    return new Response(
      JSON.stringify({ views: viewsMap }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-instagram-views:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
