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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');
    if (!APIFY_API_KEY) {
      console.error('APIFY_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'APIFY_API_KEY is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { urls } = await req.json();
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'urls array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${urls.length} Instagram URLs via Apify`);

    // Use Instagram Scraper actor - this fetches reel/post data including view counts
    const actorId = 'apify~instagram-scraper';
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}`;

    const input: ApifyInput = {
      directUrls: urls,
      resultsLimit: urls.length,
    };

    console.log('Calling Apify API...');
    const response = await fetch(runUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Apify API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Apify API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: ApifyResult[] = await response.json();
    console.log(`Received ${results.length} results from Apify`);

    // Map results to URL -> view count
    const viewsMap: Record<string, number | string> = {};
    
    for (const result of results) {
      const url = result.inputUrl || result.url;
      if (url) {
        // Try different field names for view count
        const views = result.videoPlayCount ?? result.playCount;
        if (views !== undefined && views !== null) {
          viewsMap[url] = views;
        } else {
          viewsMap[url] = 'N/A';
        }
      }
    }

    // For any URLs that didn't get results, mark as error
    for (const url of urls) {
      if (!(url in viewsMap)) {
        viewsMap[url] = 'Error';
      }
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
