import { supabase } from '@/integrations/supabase/client';

export type ApiMode = 'apify' | 'hiker';

export interface FetchViewsResult {
  views: Record<string, number | string>;
}

/**
 * Fetch Instagram reel view counts via edge function
 * @param urls Array of Instagram reel URLs
 * @param mode API mode ('apify' or 'hiker')
 * @returns Map of URL to view count (number or 'Error'/'N/A')
 */
export async function fetchInstagramViews(
  urls: string[],
  mode: ApiMode = 'apify'
): Promise<Map<string, number | string>> {
  const { data, error } = await supabase.functions.invoke<FetchViewsResult>(
    'fetch-instagram-views',
    {
      body: { urls, mode },
    }
  );

  if (error) {
    console.error('Error fetching Instagram views:', error);
    throw new Error(error.message || 'Failed to fetch Instagram views');
  }

  if (!data?.views) {
    throw new Error('Invalid response from API');
  }

  return new Map(Object.entries(data.views));
}

/**
 * Fetch Instagram views in batches to avoid timeouts
 * @param urls Array of Instagram reel URLs
 * @param mode API mode ('apify' or 'hiker')
 * @param batchSize Number of URLs per batch (default 10)
 * @param onProgress Callback for progress updates
 * @returns Map of URL to view count
 */
export async function fetchInstagramViewsBatched(
  urls: string[],
  mode: ApiMode = 'apify',
  batchSize = 10,
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, number | string>> {
  const allViews = new Map<string, number | string>();
  
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    
    try {
      const batchViews = await fetchInstagramViews(batch, mode);
      batchViews.forEach((value, key) => allViews.set(key, value));
    } catch (error) {
      console.error(`Error processing batch ${i / batchSize + 1}:`, error);
      batch.forEach((url) => allViews.set(url, 'Error'));
    }
    
    onProgress?.(Math.min(i + batchSize, urls.length), urls.length);
  }
  
  return allViews;
}
