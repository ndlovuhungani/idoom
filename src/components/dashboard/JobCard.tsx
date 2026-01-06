import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProcessingJob, JobStatus } from '@/hooks/useProcessingJobs';
import { cn } from '@/lib/utils';

interface JobCardProps {
  job: ProcessingJob;
  onDownload?: (job: ProcessingJob) => void;
}

const statusConfig: Record<
  JobStatus,
  { label: string; icon: typeof CheckCircle2; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  completed: { label: 'Completed', icon: CheckCircle2, variant: 'default' },
  failed: { label: 'Failed', icon: XCircle, variant: 'destructive' },
  processing: { label: 'Processing', icon: Loader2, variant: 'secondary' },
  pending: { label: 'Pending', icon: Clock, variant: 'outline' },
};

export default function JobCard({ job, onDownload }: JobCardProps) {
  const status = statusConfig[job.status];
  const StatusIcon = status.icon;
  const progress =
    job.total_links > 0 ? Math.round((job.processed_links / job.total_links) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border rounded-xl p-4 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-4">
        {/* File Icon */}
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-5 h-5 text-secondary-foreground" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="font-medium truncate">{job.file_name}</h3>
              <p className="text-xs text-muted-foreground">
                {format(new Date(job.created_at), 'MMM d, yyyy • h:mm a')}
              </p>
            </div>
            <Badge
              variant={status.variant}
              className={cn(
                'shrink-0',
                job.status === 'processing' && 'animate-pulse'
              )}
            >
              <StatusIcon
                className={cn(
                  'w-3 h-3 mr-1',
                  job.status === 'processing' && 'animate-spin'
                )}
              />
              {status.label}
            </Badge>
          </div>

          {/* Progress Bar (for processing/completed jobs) */}
          {(job.status === 'processing' || job.status === 'completed') && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>
                  {job.processed_links} of {job.total_links} links
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5 }}
                  className={cn(
                    'h-full rounded-full',
                    job.status === 'completed' ? 'bg-success' : 'gradient-primary'
                  )}
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {job.status === 'failed' && job.error_message && (
            <p className="text-xs text-destructive mb-3">{job.error_message}</p>
          )}

          {/* Stats Row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{job.total_links} links</span>
            {job.failed_links > 0 && (
              <span className="text-destructive">{job.failed_links} failed</span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      {(job.status === 'processing' || (job.status === 'completed' && job.result_file_url)) && (
        <div className="flex flex-col sm:flex-row items-stretch gap-2 mt-4 pt-4 border-t">
          {job.status === 'processing' && (
            <Button variant="outline" size="sm" asChild className="flex-1 min-h-[44px]">
              <Link to={`/status/${job.id}`}>
                <ExternalLink className="w-4 h-4 mr-2" />
                View Progress
              </Link>
            </Button>
          )}
          {job.status === 'completed' && job.result_file_url && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 gradient-primary min-h-[44px]"
              onClick={() => onDownload?.(job)}
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
