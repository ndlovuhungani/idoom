import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSpreadsheet,
  RotateCcw,
  Pause,
  Play,
  RefreshCw,
  Timer,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useJob, useUpdateJob, usePauseJob, useResumeJob } from '@/hooks/useProcessingJobs';
import { supabase } from '@/integrations/supabase/client';
import { cn, formatDuration } from '@/lib/utils';
import { toast } from 'sonner';

export default function ProcessingStatus() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingPartial, setIsDownloadingPartial] = useState(false);

  const { data: job } = useJob(jobId);
  const updateJob = useUpdateJob();
  const pauseJob = usePauseJob();
  const resumeJob = useResumeJob();

  // Guard against division by zero
  const progress = job && job.total_links > 0 
    ? Math.round((job.processed_links / job.total_links) * 100) 
    : 0;

  // Time tracking
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (job?.status !== 'processing') return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [job?.status]);

  const timeInfo = useMemo(() => {
    if (!job) return null;

    const startTime = new Date(job.created_at).getTime();

    if (job.status === 'completed' && job.completed_at) {
      const endTime = new Date(job.completed_at).getTime();
      return { type: 'completed' as const, duration: endTime - startTime };
    }

    if (job.status === 'processing' && job.processed_links > 0) {
      const elapsedMs = now - startTime;
      const avgTimePerLink = elapsedMs / job.processed_links;
      const remainingLinks = job.total_links - job.processed_links;
      const estimatedRemainingMs = avgTimePerLink * remainingLinks;
      return { type: 'processing' as const, remaining: estimatedRemainingMs };
    }

    return null;
  }, [job, now]);

  const handleDownload = async (isPartial = false) => {
    if (!job) return;
    
    const setLoading = isPartial ? setIsDownloadingPartial : setIsDownloading;
    const filePath = isPartial ? job.partial_result_path : job.result_file_path;
    const fileName = isPartial ? `partial_${job.file_name}` : `processed_${job.file_name}`;
    
    setLoading(true);
    try {
      if (filePath) {
        const { data, error } = await supabase.storage
          .from('excel-files')
          .download(filePath);

        if (error) throw error;

        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(isPartial ? 'Partial file downloaded' : 'File downloaded');
      } else if (!isPartial && job.result_file_url) {
        // Legacy: blob URL support
        const link = document.createElement('a');
        link.href = job.result_file_url;
        link.download = fileName;
        link.click();
      } else {
        toast.error('No file available to download');
      }
    } catch (error) {
      toast.error('Failed to download file');
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    if (!job) return;
    try {
      await pauseJob.mutateAsync(job.id);
      toast.success('Pausing job... It will stop at the next checkpoint.');
    } catch (error) {
      toast.error('Failed to pause job');
    }
  };

  const handleResume = async () => {
    if (!job) return;
    try {
      await resumeJob.mutateAsync(job.id);
      toast.success('Resuming processing...');
    } catch (error) {
      toast.error('Failed to resume job');
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    try {
      await updateJob.mutateAsync({
        id: job.id,
        status: 'failed',
        error_message: 'Job cancelled by user',
      });
      toast.success('Job cancelled.');
    } catch (error) {
      toast.error('Failed to cancel job');
    }
  };

  const handleRetryFailed = async () => {
    if (!job) return;
    // Reset the job to retry from the current position
    try {
      await resumeJob.mutateAsync(job.id);
      toast.success('Retrying failed links...');
    } catch (error) {
      toast.error('Failed to retry');
    }
  };

  if (!job) {
    return (
      <AppLayout>
        <div className="p-6 lg:p-8 max-w-4xl mx-auto">
          <div className="text-center py-16">
            <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-medium mb-2">Job not found</h2>
            <p className="text-muted-foreground mb-4">
              This job may have been deleted or doesn't exist.
            </p>
            <Button onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const isPaused = job.status === 'paused';
  const isProcessing = job.status === 'processing';
  const isFailed = job.status === 'failed';
  const isCompleted = job.status === 'completed';
  const hasPartialResults = !!job.partial_result_path;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Back Button */}
        <Button variant="ghost" size="sm" asChild className="mb-6">
          <Link to="/dashboard">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>

        {/* Status Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6 text-secondary-foreground" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-lg sm:text-xl truncate">{job.file_name}</CardTitle>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Started {format(new Date(job.created_at), 'MMM d, yyyy • h:mm a')}
                  </p>
                </div>
              </div>
              <Badge
                variant={
                  isCompleted
                    ? 'default'
                    : isFailed
                    ? 'destructive'
                    : isPaused
                    ? 'outline'
                    : 'secondary'
                }
                className={cn(isProcessing && 'animate-pulse')}
              >
                {isProcessing && (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                )}
                {isCompleted && (
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                )}
                {isFailed && <XCircle className="w-3 h-3 mr-1" />}
                {isPaused && <Pause className="w-3 h-3 mr-1" />}
                {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {/* Progress Section */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Processing Progress</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pt-4">
                <div className="text-center p-3 sm:p-4 bg-muted rounded-lg">
                  <p className="text-xl sm:text-2xl font-bold">{job.total_links}</p>
                  <p className="text-xs text-muted-foreground">Total Links</p>
                </div>
                <div className="text-center p-3 sm:p-4 bg-success/10 rounded-lg">
                  <p className="text-xl sm:text-2xl font-bold text-success">{job.processed_links}</p>
                  <p className="text-xs text-muted-foreground">Processed</p>
                </div>
                <div className="text-center p-3 sm:p-4 bg-destructive/10 rounded-lg">
                  <p className="text-xl sm:text-2xl font-bold text-destructive">{job.failed_links}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>

              {/* Paused State */}
              {isPaused && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-muted border border-border rounded-lg space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Pause className="w-4 h-4 text-muted-foreground" />
                    <span>Processing paused at {job.processed_links} of {job.total_links} links</span>
                  </div>
                  {job.paused_at && (
                    <p className="text-xs text-muted-foreground">
                      Paused {format(new Date(job.paused_at), 'MMM d, yyyy • h:mm a')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={handleResume}
                      className="gradient-primary text-primary-foreground"
                      disabled={resumeJob.isPending}
                    >
                      {resumeJob.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Resume Processing
                    </Button>
                    {hasPartialResults && (
                      <Button
                        variant="outline"
                        onClick={() => handleDownload(true)}
                        disabled={isDownloadingPartial}
                      >
                        {isDownloadingPartial ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2" />
                        )}
                        Download Partial Results
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={handleCancel}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel Job
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Error Message */}
              {isFailed && job.error_message && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg space-y-3">
                  <p className="text-sm text-destructive">{job.error_message}</p>
                  <div className="flex flex-wrap gap-2">
                    {hasPartialResults && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(true)}
                        disabled={isDownloadingPartial}
                      >
                        {isDownloadingPartial ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2" />
                        )}
                        Download Partial Results
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/dashboard')}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Try Again with New Upload
                    </Button>
                  </div>
                </div>
              )}

              {/* Download Button */}
              {isCompleted && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="pt-4"
                >
                  <Button
                    onClick={() => handleDownload(false)}
                    className="w-full gradient-primary text-primary-foreground"
                    size="lg"
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    Download Processed File
                  </Button>
                  <div className="text-center mt-2 space-y-1">
                    {timeInfo?.type === 'completed' && (
                      <p className="text-sm font-medium text-success flex items-center justify-center gap-1">
                        <Timer className="w-4 h-4" />
                        Completed in {formatDuration(timeInfo.duration)}
                      </p>
                    )}
                    {job.completed_at && (
                      <p className="text-xs text-muted-foreground">
                        Finished {format(new Date(job.completed_at), 'MMM d, yyyy • h:mm a')}
                      </p>
                    )}
                  </div>
                  {job.failed_links > 0 && (
                    <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-lg">
                      <p className="text-sm text-warning-foreground">
                        {job.failed_links} links failed to fetch views. They are marked as "Error" in the file.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Processing Animation */}
              {isProcessing && (
                <div className="space-y-4 py-4">
                  <div className="flex flex-col items-center justify-center gap-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing links... ({job.processed_links}/{job.total_links})</span>
                    </div>
                    {timeInfo?.type === 'processing' && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        Estimated: ~{formatDuration(timeInfo.remaining)} remaining
                      </p>
                    )}
                    {job.processed_links === 0 && (
                      <p className="text-xs text-muted-foreground">Calculating time...</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={handlePause}
                      disabled={pauseJob.isPending}
                    >
                      {pauseJob.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Pause className="w-4 h-4 mr-2" />
                      )}
                      Pause Processing
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleCancel}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                  {hasPartialResults && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => handleDownload(true)}
                      disabled={isDownloadingPartial}
                    >
                      {isDownloadingPartial ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      Download Current Progress
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
