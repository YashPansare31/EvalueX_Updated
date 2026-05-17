import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageLoader } from '@/components/ui/PageLoader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { User, Mail, Lock, Sun, Moon, Building2, Loader2, Check } from 'lucide-react';

export default function Settings() {
  const { user, loading: authLoading, profile, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  // Profile section
  const [displayName, setDisplayName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Email section
  const [newEmail, setNewEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // Password section
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const isGoogleUser = user?.app_metadata?.provider === 'google';

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.full_name ?? '');
      setSchoolName(profile.school_name ?? '');
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          full_name: displayName.trim() || null,
          school_name: schoolName.trim() || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      toast.success('Confirmation sent to your new email address. Please check your inbox.');
      setNewEmail('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update email');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setSavingPassword(false);
    }
  };

  if (authLoading) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 ml-[260px] p-8 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-foreground mb-1">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </motion.div>

        <div className="space-y-6">

          {/* Profile */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle>Profile</CardTitle>
                    <CardDescription>Update your display name and organisation</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    placeholder="Dr. Jane Smith"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schoolName">School / Organisation</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="schoolName"
                      placeholder="Springfield High School"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button onClick={handleSaveProfile} disabled={savingProfile} className="gap-2">
                  {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save Profile
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Email */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle>Email Address</CardTitle>
                    <CardDescription>
                      Current: <span className="font-medium text-foreground">{user?.email}</span>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isGoogleUser ? (
                  <p className="text-sm text-muted-foreground">
                    Your email is managed by Google and cannot be changed here.
                  </p>
                ) : (
                  <form onSubmit={handleChangeEmail} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="newEmail">New Email Address</Label>
                      <Input
                        id="newEmail"
                        type="email"
                        placeholder="newemail@school.edu"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        A confirmation link will be sent to your new address.
                      </p>
                    </div>
                    <Button type="submit" disabled={savingEmail} className="gap-2">
                      {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      Update Email
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Password */}
          {!isGoogleUser && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <Lock className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <CardTitle>Password</CardTitle>
                      <CardDescription>Set a new password for your account</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={6}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">Must be at least 6 characters.</p>
                    </div>
                    <Button type="submit" disabled={savingPassword} className="gap-2">
                      {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                      Update Password
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Appearance */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Sun className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle>Appearance</CardTitle>
                    <CardDescription>Choose your preferred colour scheme</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex-1 flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      theme === 'light'
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="h-16 w-full rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                      <Sun className="h-6 w-6 text-amber-500" />
                    </div>
                    <div className="flex items-center gap-2">
                      {theme === 'light' && <Check className="h-4 w-4 text-accent" />}
                      <span className="text-sm font-medium">Light</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex-1 flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      theme === 'dark'
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="h-16 w-full rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center shadow-sm">
                      <Moon className="h-6 w-6 text-blue-400" />
                    </div>
                    <div className="flex items-center gap-2">
                      {theme === 'dark' && <Check className="h-4 w-4 text-accent" />}
                      <span className="text-sm font-medium">Dark</span>
                    </div>
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

        </div>
      </main>
    </div>
  );
}
