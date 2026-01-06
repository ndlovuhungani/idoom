import { motion } from 'framer-motion';
import { Zap, TestTube2, Server, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppSettings, useUpdateApiMode, ApiMode } from '@/hooks/useAppSettings';
import { cn } from '@/lib/utils';

const apiModes: Array<{
  id: ApiMode;
  name: string;
  description: string;
  icon: typeof Zap;
  badgeVariant: 'default' | 'secondary' | 'outline';
}> = [
  {
    id: 'demo',
    name: 'Demo Mode',
    description: 'Generate fake view counts for testing. No API calls made.',
    icon: TestTube2,
    badgeVariant: 'secondary',
  },
  {
    id: 'apify',
    name: 'Apify API',
    description: 'Use Apify to fetch real Instagram reel views.',
    icon: Zap,
    badgeVariant: 'default',
  },
  {
    id: 'hiker',
    name: 'Hiker API',
    description: 'Use Hiker API as an alternative data source.',
    icon: Server,
    badgeVariant: 'outline',
  },
];

export default function ApiSettings() {
  const { data: settings, isLoading } = useAppSettings();
  const updateApiMode = useUpdateApiMode();

  const currentMode = settings?.api_mode || 'demo';

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Settings</CardTitle>
        <CardDescription>
          Choose which API to use for fetching Instagram reel views
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {apiModes.map((mode, index) => {
            const isActive = currentMode === mode.id;
            const Icon = mode.icon;

            return (
              <motion.button
                key={mode.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => updateApiMode.mutate(mode.id)}
                disabled={updateApiMode.isPending}
                className={cn(
                  'w-full flex items-center gap-3 sm:gap-4 p-4 border rounded-xl text-left transition-all min-h-[72px]',
                  isActive
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                )}
              >
                <div
                  className={cn(
                    'w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0',
                    isActive ? 'bg-primary/10' : 'bg-muted'
                  )}
                >
                  <Icon
                    className={cn(
                      'w-6 h-6',
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{mode.name}</span>
                    <Badge variant={mode.badgeVariant} className="text-xs">
                      {mode.id}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{mode.description}</p>
                </div>
                {isActive && (
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* API Keys Notice */}
        <div className="mt-6 p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Note:</strong> API keys for Apify and Hiker can be
            configured in the project secrets. Contact your administrator to set up API keys.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
