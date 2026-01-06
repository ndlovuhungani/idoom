import { supabase } from '@/integrations/supabase/client';

export interface FetchViewsResult {
  views: Record<string, number | string>;
}

/**
 * Fetch Instagram reel view counts via the Apify edge function
 * @param urls Array of Instagram reel URLs
 * @returns Map of URL to view count (number or 'Error'/'N/A')
 */
export async function fetchInstagramViews(
  urls: string[]
): Promise<Map<string, number | string>> {
  const { data, error } = await supabase.functions.invoke<FetchViewsResult>(
    'fetch-instagram-views',
    {
      body: { urls },
    }
  );

  if (error) {
    console.error('Error fetching Instagram views:', error);
    throw new Error(error.message || 'Failed to fetch Instagram views');
  }

  if (!data?.views) {
    throw new Error('Invalid response from API');
  }

  // Convert object to Map
  return new Map(Object.entries(data.views));
}

/**
 * Fetch Instagram views in batches to avoid timeouts
 * @param urls Array of Instagram reel URLs
 * @param batchSize Number of URLs per batch (default 10)
 * @param onProgress Callback for progress updates
 * @returns Map of URL to view count
 */
export async function fetchInstagramViewsBatched(
  urls: string[],
  batchSize = 10,
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, number | string>> {
  const allViews = new Map<string, number | string>();
  
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    
    try {
      const batchViews = await fetchInstagramViews(batch);
      batchViews.forEach((value, key) => allViews.set(key, value));
    } catch (error) {
      console.error(`Error processing batch ${i / batchSize + 1}:`, error);
      // Mark failed batch URLs as errors
      batch.forEach((url) => allViews.set(url, 'Error'));
    }
    
    onProgress?.(Math.min(i + batchSize, urls.length), urls.length);
  }
  
  return allViews;
}
