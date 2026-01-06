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
import { useProcessingJobs, useCreateJob } from '@/hooks/useProcessingJobs';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useAuth } from '@/hooks/useAuth';
import { parseExcelFile, ExcelData } from '@/lib/excelProcessor';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Dashboard() {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<ExcelData | null>(null);

  const { user } = useAuth();
  const { data: jobs, isLoading: jobsLoading } = useProcessingJobs();
  const { data: settings } = useAppSettings();
  const createJob = useCreateJob();

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

  const handleProcess = async () => {
    if (!currentFile || !excelData || !user) {
      toast.error('Please upload a file first');
      return;
    }

    if (excelData.instagramLinks.length === 0) {
      toast.error('No Instagram links found in the file');
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Upload file to storage
      const filePath = `${user.id}/${Date.now()}_${currentFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('excel-files')
        .upload(filePath, currentFile);

      if (uploadError) {
        throw new Error(`Failed to upload file: ${uploadError.message}`);
      }

      // 2. Create job with source file path
      const job = await createJob.mutateAsync({
        fileName: currentFile.name,
        totalLinks: excelData.instagramLinks.length,
        sourceFilePath: filePath,
      });

      // 3. Trigger backend processing
      const { error: fnError } = await supabase.functions.invoke('process-excel', {
        body: { jobId: job.id },
      });

      if (fnError) {
        console.error('Edge function error:', fnError);
        // Job is created, processing will continue in background even if this fails
      }

      toast.success('Processing started! You can safely leave this page.');
      
      // 4. Navigate to status page immediately
      navigate(`/status/${job.id}`);

    } catch (error) {
      console.error('Processing error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start processing');
    } finally {
      setIsProcessing(false);
      setCurrentFile(null);
      setExcelData(null);
    }
  };

  const handleDownload = async (job: any) => {
    if (job.result_file_path) {
      try {
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
      } catch (error) {
        toast.error('Failed to download file');
      }
    } else if (job.result_file_url) {
      // Legacy: blob URL support
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
