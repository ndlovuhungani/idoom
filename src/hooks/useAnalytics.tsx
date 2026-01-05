import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface AnalyticsSummary {
  totalJobs: number;
  totalApiCalls: number;
  totalViewsFetched: number;
  jobsByStatus: {
    completed: number;
    failed: number;
    processing: number;
    pending: number;
  };
  recentJobs: Array<{
    id: string;
    file_name: string;
    total_links: number;
    status: string;
    created_at: string;
    user_email?: string;
  }>;
}

export function useAnalytics() {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['analytics'],
    queryFn: async (): Promise<AnalyticsSummary> => {
      // Get all jobs
      const { data: jobs, error: jobsError } = await supabase
        .from('processing_jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;

      // Get analytics data
      const { data: analytics, error: analyticsError } = await supabase
        .from('analytics')
        .select('*');

      if (analyticsError) throw analyticsError;

      // Get profiles for user emails (admin only)
      let profiles: Array<{ user_id: string; email: string }> = [];
      if (isAdmin) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, email');
        profiles = profilesData || [];
      }

      const emailMap = new Map(profiles.map((p) => [p.user_id, p.email]));

      const jobsByStatus = {
        completed: jobs?.filter((j) => j.status === 'completed').length || 0,
        failed: jobs?.filter((j) => j.status === 'failed').length || 0,
        processing: jobs?.filter((j) => j.status === 'processing').length || 0,
        pending: jobs?.filter((j) => j.status === 'pending').length || 0,
      };

      const totalApiCalls = analytics?.reduce((sum, a) => sum + (a.api_calls_made || 0), 0) || 0;
      const totalViewsFetched = analytics?.reduce((sum, a) => sum + Number(a.views_fetched || 0), 0) || 0;

      const recentJobs = (jobs || []).slice(0, 10).map((job) => ({
        id: job.id,
        file_name: job.file_name,
        total_links: job.total_links,
        status: job.status,
        created_at: job.created_at,
        user_email: emailMap.get(job.user_id),
      }));

      return {
        totalJobs: jobs?.length || 0,
        totalApiCalls,
        totalViewsFetched,
        jobsByStatus,
        recentJobs,
      };
    },
    enabled: isAdmin,
  });
}
