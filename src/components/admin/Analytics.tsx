import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  FileSpreadsheet,
  Eye,
  Zap,
  TrendingUp,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StatsCard from '@/components/dashboard/StatsCard';
import { useAnalytics } from '@/hooks/useAnalytics';

export default function Analytics() {
  const { data: analytics, isLoading } = useAnalytics();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Jobs"
          value={analytics?.totalJobs || 0}
          icon={FileSpreadsheet}
        />
        <StatsCard
          title="API Calls"
          value={formatNumber(analytics?.totalApiCalls || 0)}
          icon={Zap}
        />
        <StatsCard
          title="Views Fetched"
          value={formatNumber(analytics?.totalViewsFetched || 0)}
          icon={Eye}
        />
        <StatsCard
          title="Success Rate"
          value={
            analytics?.totalJobs
              ? `${Math.round((analytics.jobsByStatus.completed / analytics.totalJobs) * 100)}%`
              : '0%'
          }
          icon={TrendingUp}
        />
      </div>

      {/* Job Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Job Status Breakdown</CardTitle>
          <CardDescription>Overview of all processing jobs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-success/10 rounded-lg text-center">
              <CheckCircle2 className="w-6 h-6 text-success mx-auto mb-2" />
              <p className="text-2xl font-bold">{analytics?.jobsByStatus.completed || 0}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div className="p-4 bg-primary/10 rounded-lg text-center">
              <Loader2 className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">{analytics?.jobsByStatus.processing || 0}</p>
              <p className="text-xs text-muted-foreground">Processing</p>
            </div>
            <div className="p-4 bg-muted rounded-lg text-center">
              <Clock className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-2xl font-bold">{analytics?.jobsByStatus.pending || 0}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="p-4 bg-destructive/10 rounded-lg text-center">
              <XCircle className="w-6 h-6 text-destructive mx-auto mb-2" />
              <p className="text-2xl font-bold">{analytics?.jobsByStatus.failed || 0}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest processing jobs across all users</CardDescription>
        </CardHeader>
        <CardContent>
          {analytics?.recentJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No activity yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {analytics?.recentJobs.map((job, index) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-4 h-4 text-secondary-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate text-sm">{job.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.user_email || 'Unknown user'} •{' '}
                        {format(new Date(job.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{job.total_links} links</span>
                    <Badge
                      variant={
                        job.status === 'completed'
                          ? 'default'
                          : job.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {job.status}
                    </Badge>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
