import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing?: boolean;
}

export default function FileUpload({ onFileSelect, isProcessing }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Max file size: 10MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      setError(null);

      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        if (rejection.errors?.some((e: any) => e.code === 'file-too-large')) {
          setError('File is too large. Maximum size is 10MB.');
        } else if (rejection.errors?.some((e: any) => e.code === 'file-invalid-type')) {
          setError('Please upload an Excel file (.xlsx or .xls)');
        } else {
          setError('Invalid file. Please upload an Excel file under 10MB.');
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setSelectedFile(file);
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    disabled: isProcessing,
  });

  const clearFile = () => {
    setSelectedFile(null);
    setError(null);
  };

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {!selectedFile ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              {...getRootProps()}
              className={cn(
                'relative border-2 border-dashed rounded-xl p-6 sm:p-8 md:p-12 text-center cursor-pointer transition-all duration-200',
                isDragActive
                  ? 'border-primary bg-primary/5 scale-[1.02]'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50',
                isProcessing && 'opacity-50 cursor-not-allowed'
              )}
            >
              <input {...getInputProps()} />

              <div className="flex flex-col items-center gap-4">
                <div
                  className={cn(
                    'w-16 h-16 rounded-2xl flex items-center justify-center transition-colors',
                    isDragActive ? 'bg-primary/10' : 'bg-muted'
                  )}
                >
                  <Upload
                    className={cn(
                      'w-8 h-8 transition-colors',
                      isDragActive ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                </div>

                <div>
                  <p className="text-lg font-medium mb-1">
                    {isDragActive ? 'Drop your file here' : 'Upload Excel File'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Drag and drop or{' '}
                    <span className="text-primary font-medium">browse</span> to upload
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Supports .xlsx and .xls files (max 10MB)
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="file-selected"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="border rounded-xl p-4 bg-card"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6 text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              {!isProcessing && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearFile}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center gap-2 text-sm text-destructive"
        >
          <AlertCircle className="w-4 h-4" />
          {error}
        </motion.div>
      )}
    </div>
  );
}
