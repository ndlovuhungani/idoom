import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileSpreadsheet, Search, Filter, Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import JobCard from '@/components/dashboard/JobCard';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProcessingJobs, JobStatus, ProcessingJob } from '@/hooks/useProcessingJobs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function History() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');

  const { data: jobs, isLoading } = useProcessingJobs();

  const filteredJobs = jobs?.filter((job) => {
    const matchesSearch = job.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDownload = async (job: ProcessingJob) => {
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
    }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-display font-bold mb-2">History</h1>
          <p className="text-muted-foreground">
            View and manage all your processed files
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as JobStatus | 'all')}>
            <SelectTrigger className="w-full sm:w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Jobs List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredJobs?.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 text-muted-foreground"
          >
            <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-1">No jobs found</p>
            <p className="text-sm">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Upload a file to get started'}
            </p>
          </motion.div>
        ) : (
          <div className="grid gap-4">
            {filteredJobs?.map((job, index) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <JobCard job={job} onDownload={handleDownload} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
