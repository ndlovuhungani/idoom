import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileSpreadsheet, Clock, CheckCircle2, Upload, Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import FileUpload from '@/components/dashboard/FileUpload';
import StatsCard from '@/components/dashboard/StatsCard';
import JobCard from '@/components/dashboard/JobCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProcessingJobs, useCreateJob, useUpdateJob } from '@/hooks/useProcessingJobs';
import { useAppSettings } from '@/hooks/useAppSettings';
import { parseExcelFile, updateExcelWithViews, generateDemoViews, ExcelData } from '@/lib/excelProcessor';
import { toast } from 'sonner';

export default function Dashboard() {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<ExcelData | null>(null);

  const { data: jobs, isLoading: jobsLoading } = useProcessingJobs();
  const { data: settings } = useAppSettings();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();

  const recentJobs = jobs?.slice(0, 3) || [];
  const completedCount = jobs?.filter((j) => j.status === 'completed').length || 0;
  const processingCount = jobs?.filter((j) => j.status === 'processing').length || 0;

  const handleFileSelect = useCallback(async (file: File) => {
    setCurrentFile(file);
    try {
      const data = await parseExcelFile(file);
      setExcelData(data);
      toast.success(`Found ${data.instagramLinks.length} Instagram links`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to parse file');
      setCurrentFile(null);
      setExcelData(null);
    }
  }, []);

  // Retry helper with exponential backoff
  const updateWithRetry = async (jobId: string, updates: Record<string, unknown>, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        await updateJob.mutateAsync({ id: jobId, ...updates });
        return;
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  };

  const handleProcess = async () => {
    if (!currentFile || !excelData) {
      toast.error('Please upload a file first');
      return;
    }

    if (excelData.instagramLinks.length === 0) {
      toast.error('No Instagram links found in the file');
      return;
    }

    setIsProcessing(true);
    let job: { id: string } | null = null;

    try {
      // Create job in database
      job = await createJob.mutateAsync({
        fileName: currentFile.name,
        totalLinks: excelData.instagramLinks.length,
      });

      // Update status to processing
      await updateWithRetry(job.id, { status: 'processing' });

      // Process based on mode
      const apiMode = settings?.api_mode || 'demo';
      const viewsMap = new Map<string, number | string>();
      const batchSize = 10; // Update progress every 10 links

      if (apiMode === 'demo') {
        // Demo mode - generate fake views with realistic delays
        for (let i = 0; i < excelData.instagramLinks.length; i++) {
          const link = excelData.instagramLinks[i];
          const views = generateDemoViews();
          viewsMap.set(link.url, views);

          // Batch progress updates (every 10 links or last link)
          if ((i + 1) % batchSize === 0 || i === excelData.instagramLinks.length - 1) {
            await updateWithRetry(job.id, { processed_links: i + 1 });
          }

          // Small delay to simulate API calls
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } else {
        // Real API mode - TODO: Implement Apify/Hiker integration
        for (let i = 0; i < excelData.instagramLinks.length; i++) {
          const link = excelData.instagramLinks[i];
          // For now, use demo data until APIs are configured
          const views = generateDemoViews();
          viewsMap.set(link.url, views);

          // Batch progress updates
          if ((i + 1) % batchSize === 0 || i === excelData.instagramLinks.length - 1) {
            await updateWithRetry(job.id, { processed_links: i + 1 });
          }

          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Generate updated Excel file (async to preserve formatting)
      const updatedBlob = await updateExcelWithViews(excelData, viewsMap);

      // Create download URL
      const downloadUrl = URL.createObjectURL(updatedBlob);

      // Mark job as completed
      await updateWithRetry(job.id, {
        status: 'completed',
        result_file_url: downloadUrl,
        completed_at: new Date().toISOString(),
      });

      toast.success('Processing complete!');
      navigate(`/status/${job.id}`);
    } catch (error) {
      console.error('Processing error:', error);
      toast.error('Failed to process file');

      // Mark job as failed in database
      if (job?.id) {
        try {
          await updateWithRetry(job.id, {
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error occurred',
          });
        } catch {
          // Silently fail if we can't update the job
        }
      }
    } finally {
      setIsProcessing(false);
      setCurrentFile(null);
      setExcelData(null);
    }
  };

  const handleDownload = (job: any) => {
    if (job.result_file_url) {
      const link = document.createElement('a');
      link.href = job.result_file_url;
      link.download = `processed_${job.file_name}`;
      link.click();
    }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-display font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Upload Excel files to fetch Instagram reel views
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatsCard
            title="Total Processed"
            value={jobs?.length || 0}
            icon={FileSpreadsheet}
          />
          <StatsCard
            title="Completed"
            value={completedCount}
            icon={CheckCircle2}
          />
          <StatsCard
            title="In Progress"
            value={processingCount}
            icon={Clock}
          />
        </div>

        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload File
            </CardTitle>
            <CardDescription>
              Upload an Excel file containing Instagram reel links. We'll automatically detect the
              link column and add view counts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUpload onFileSelect={handleFileSelect} isProcessing={isProcessing} />

            {excelData && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 bg-muted rounded-lg"
              >
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="font-medium">Ready to process</p>
                    <p className="text-sm text-muted-foreground">
                      {excelData.instagramLinks.length} Instagram links detected •{' '}
                      <span className="capitalize">
                        {settings?.api_mode || 'demo'} mode
                      </span>
                    </p>
                  </div>
                  <Button
                    onClick={handleProcess}
                    disabled={isProcessing}
                    className="gradient-primary"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Start Processing
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>

        {/* Recent Jobs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold">Recent Jobs</h2>
            {jobs && jobs.length > 3 && (
              <Button variant="link" onClick={() => navigate('/history')}>
                View all
              </Button>
            )}
          </div>

          {jobsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : recentJobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No jobs yet. Upload a file to get started!</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {recentJobs.map((job) => (
                <JobCard key={job.id} job={job} onDownload={handleDownload} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
