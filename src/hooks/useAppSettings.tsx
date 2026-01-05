import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ApiMode = 'apify' | 'hiker' | 'demo';

interface AppSettings {
  id: string;
  api_mode: ApiMode;
  apify_api_key: string | null;
  hiker_api_key: string | null;
  updated_at: string;
}

export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      if (error) throw error;
      return data as AppSettings;
    },
  });
}

export function useUpdateApiMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mode: ApiMode) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ api_mode: mode })
        .eq('id', (await supabase.from('app_settings').select('id').single()).data?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast.success('API mode updated');
    },
    onError: (error) => {
      toast.error('Failed to update API mode');
      console.error(error);
    },
  });
}
