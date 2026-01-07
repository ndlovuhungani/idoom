import { useState } from 'react';
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
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useJob, useUpdateJob } from '@/hooks/useProcessingJobs';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function ProcessingStatus() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [isResetting, setIsResetting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: job } = useJob(jobId);
  const updateJob = useUpdateJob();

  // Guard against division by zero
  const progress = job && job.total_links > 0 
    ? Math.round((job.processed_links / job.total_links) * 100) 
    : 0;

  const handleDownload = async () => {
    if (!job) return;
    
    setIsDownloading(true);
    try {
      if (job.result_file_path) {
        const { data, error } = await supabase.storage
          .from('excel-files')
          .download(job.result_file_path);

        if (error) throw error;

        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = `processed_${job.file_name}`;
        link.click();
        URL.revokeObjectURL(url);
      } else if (job.result_file_url) {
        // Legacy: blob URL support
        const link = document.createElement('a');
        link.href = job.result_file_url;
        link.download = `processed_${job.file_name}`;
        link.click();
      }
    } catch (error) {
      toast.error('Failed to download file');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRetry = async () => {
    if (!job) return;
    setIsResetting(true);
    try {
      await updateJob.mutateAsync({
        id: job.id,
        status: 'failed',
        error_message: 'Job cancelled by user',
      });
      toast.success('Job marked as failed. You can upload the file again.');
      navigate('/dashboard');
    } catch (error) {
      toast.error('Failed to reset job');
    } finally {
      setIsResetting(false);
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
                  job.status === 'completed'
                    ? 'default'
                    : job.status === 'failed'
                    ? 'destructive'
                    : 'secondary'
                }
                className={cn(job.status === 'processing' && 'animate-pulse')}
              >
                {job.status === 'processing' && (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                )}
                {job.status === 'completed' && (
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                )}
                {job.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
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

              {/* Error Message */}
              {job.status === 'failed' && job.error_message && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">{job.error_message}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate('/dashboard')}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Try Again with New Upload
                  </Button>
                </div>
              )}

              {/* Download Button */}
              {job.status === 'completed' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="pt-4"
                >
                  <Button
                    onClick={handleDownload}
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
                  {job.completed_at && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Completed {format(new Date(job.completed_at), 'MMM d, yyyy • h:mm a')}
                    </p>
                  )}
                </motion.div>
              )}

              {/* Processing Animation */}
              {job.status === 'processing' && (
                <div className="space-y-4 py-4">
                  <div className="flex items-center justify-center">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing links...</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleRetry}
                    disabled={isResetting}
                  >
                    {isResetting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4 mr-2" />
                    )}
                    Cancel Processing
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
