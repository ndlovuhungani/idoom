import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, Loader2, Shield, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [bootstrapSuccess, setBootstrapSuccess] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await signIn(email, password);

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Invalid email or password');
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success('Welcome back!');
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBootstrap = async () => {
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setIsBootstrapping(true);

    try {
      const { data, error } = await supabase.functions.invoke('bootstrap-admin', {
        body: { email, password },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data?.success) {
        setBootstrapSuccess(true);
        toast.success('Admin created! You can now log in.');
        setShowBootstrap(false);
      } else {
        toast.error(data?.error || 'Failed to create admin');
      }
    } catch (err) {
      console.error('Bootstrap error:', err);
      toast.error('Failed to create admin user');
    } finally {
      setIsBootstrapping(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="inline-flex items-center gap-3 mb-4"
          >
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Eye className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-display font-bold text-gradient">InstaDoom</h1>
          </motion.div>
          <p className="text-muted-foreground">
            Instagram Reel Views Fetcher
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-display">
              {showBootstrap ? 'Create Admin Account' : 'Welcome back'}
            </CardTitle>
            <CardDescription>
              {showBootstrap
                ? 'Set up your first admin account'
                : 'Sign in to your account to continue'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bootstrapSuccess && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-4 p-3 bg-success/10 border border-success/20 rounded-lg flex items-center gap-2 text-sm text-success"
              >
                <CheckCircle2 className="w-4 h-4" />
                Admin account created! Sign in below.
              </motion.div>
            )}

            <form onSubmit={showBootstrap ? (e) => { e.preventDefault(); handleBootstrap(); } : handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={showBootstrap ? 'new-password' : 'current-password'}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {showBootstrap ? (
                <div className="space-y-3">
                  <Button
                    type="submit"
                    className="w-full h-11 gradient-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
                    disabled={isBootstrapping}
                  >
                    {isBootstrapping ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Admin...
                      </>
                    ) : (
                      <>
                        <Shield className="mr-2 h-4 w-4" />
                        Create Admin Account
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setShowBootstrap(false)}
                  >
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <Button
                  type="submit"
                  className="w-full h-11 gradient-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {!showBootstrap && !bootstrapSuccess && (
          <div className="text-center mt-6">
            <p className="text-sm text-muted-foreground mb-2">
              First time setup?
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBootstrap(true)}
              className="gap-2"
            >
              <Shield className="w-4 h-4" />
              Create First Admin
            </Button>
          </div>
        )}

        {!showBootstrap && bootstrapSuccess && (
          <p className="text-center text-sm text-muted-foreground mt-6">
            Contact your administrator for account access
          </p>
        )}
      </motion.div>
    </div>
  );
}
