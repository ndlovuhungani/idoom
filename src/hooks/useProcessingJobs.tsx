import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useEffect } from 'react';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ProcessingJob {
  id: string;
  user_id: string;
  file_name: string;
  total_links: number;
  processed_links: number;
  failed_links: number;
  status: JobStatus;
  result_file_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  source_file_path: string | null;
  result_file_path: string | null;
}

export function useProcessingJobs() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['processing-jobs', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processing_jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ProcessingJob[];
    },
    enabled: !!user,
  });
}

export function useActiveJob() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['active-job', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processing_jobs')
        .select('*')
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as ProcessingJob | null;
    },
    enabled: !!user,
    refetchInterval: (query) => {
      // Poll every 2 seconds if there's an active job
      return query.state.data ? 2000 : false;
    },
  });

  // Subscribe to realtime updates for the active job
  useEffect(() => {
    if (!query.data?.id) return;

    const channel = supabase
      .channel(`job-${query.data.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'processing_jobs',
          filter: `id=eq.${query.data.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['active-job'] });
          queryClient.invalidateQueries({ queryKey: ['processing-jobs'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query.data?.id, queryClient]);

  return query;
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ fileName, totalLinks, sourceFilePath }: { fileName: string; totalLinks: number; sourceFilePath: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('processing_jobs')
        .insert({
          user_id: user.id,
          file_name: fileName,
          total_links: totalLinks,
          status: 'pending',
          source_file_path: sourceFilePath,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ProcessingJob;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processing-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['active-job'] });
    },
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<ProcessingJob> & { id: string }) => {
      const { error } = await supabase
        .from('processing_jobs')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processing-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['active-job'] });
    },
  });
}
