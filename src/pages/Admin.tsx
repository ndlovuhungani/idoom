import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Settings, BarChart3, Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserManagement from '@/components/admin/UserManagement';
import ApiSettings from '@/components/admin/ApiSettings';
import Analytics from '@/components/admin/Analytics';

export default function Admin() {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-display font-bold mb-2">Admin Panel</h1>
          <p className="text-muted-foreground">
            Manage users, API settings, and view analytics
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">API Settings</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
          </TabsList>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <TabsContent value="users" className="mt-0">
              <UserManagement />
            </TabsContent>
            <TabsContent value="api" className="mt-0">
              <ApiSettings />
            </TabsContent>
            <TabsContent value="analytics" className="mt-0">
              <Analytics />
            </TabsContent>
          </motion.div>
        </Tabs>
      </div>
    </AppLayout>
  );
}
