import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, TrendingUp, BarChart3, Users, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { PageLoader } from '@/components/ui/PageLoader';

export default function Analytics() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [loadingData, setLoadingData] = useState(true);
  const [scoreData, setScoreData] = useState<{ name: string; score: number }[]>([]);
  const [gradeDistribution, setGradeDistribution] = useState<{ grade: string; count: number }[]>([]);
  const [stats, setStats] = useState({ avg: 0, total: 0, highest: 100, lowest: 0 });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user]);

  const fetchAnalytics = async () => {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, max_score')
      .eq('user_id', user?.id);

    if (assignments && assignments.length > 0) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('final_score, assignment_id')
        .in('assignment_id', assignments.map(a => a.id))
        .not('final_score', 'is', null);

      if (subs && subs.length > 0) {
        // Score data per assignment
        const assignmentScores = assignments.slice(0, 6).map(a => {
          const assignmentSubs = subs.filter(s => s.assignment_id === a.id);
          const max = a.max_score || 100;
          const avg = assignmentSubs.length > 0
            ? Math.round((assignmentSubs.reduce((acc, s) => acc + (s.final_score || 0), 0) / assignmentSubs.length) / max * 100)
            : 0;
          return { name: a.title.length > 12 ? a.title.substring(0, 12) + '...' : a.title, score: avg };
        }).filter(a => a.score > 0);
        setScoreData(assignmentScores);

        // Grade distribution
        const grades = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0 };
        let total = 0, highest = 0, lowest = 100;
        subs.forEach(s => {
          const a = assignments.find(assign => assign.id === s.assignment_id);
          const max = a?.max_score || 100;
          const percentage = Math.round((s.final_score || 0) / max * 100);
          total += percentage;
          if (percentage > highest) highest = percentage;
          if (percentage < lowest) lowest = percentage;

          if (percentage >= 90) grades['A+']++;
          else if (percentage >= 80) grades['A']++;
          else if (percentage >= 70) grades['B']++;
          else if (percentage >= 60) grades['C']++;
          else if (percentage >= 50) grades['D']++;
          else if (percentage >= 35) grades['E']++;
          else grades['F']++;
        });

        setGradeDistribution(Object.entries(grades).map(([grade, count]) => ({ grade, count })));
        setStats({
          avg: Math.round(total / subs.length),
          total: subs.length,
          highest,
          lowest: highest === 0 && lowest === 100 ? 0 : lowest
        });
      }
    }
    setLoadingData(false);
  };

  if (loading || loadingData) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 ml-[260px] p-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl font-bold text-foreground mb-1">Analytics</h1>
          <p className="text-muted-foreground mb-8">Performance insights and trends</p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Average Score', value: `${stats.avg}%`, icon: Target, color: 'accent' },
            { label: 'Total Graded', value: stats.total, icon: Users, color: 'primary' },
            { label: 'Highest Score', value: `${stats.highest}%`, icon: TrendingUp, color: 'success' },
            { label: 'Lowest Score', value: `${stats.lowest}%`, icon: BarChart3, color: 'warning' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
            >
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    </div>
                    <div className={`h-10 w-10 rounded-lg bg-${stat.color}/10 flex items-center justify-center`}>
                      <stat.icon className={`h-5 w-5 text-${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-accent" />
                  Score Trends
                </CardTitle>
                <CardDescription>Average scores by assignment</CardDescription>
              </CardHeader>
              <CardContent>
                {scoreData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={scoreData}>
                      <defs>
                        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Area type="monotone" dataKey="score" stroke="hsl(var(--accent))" strokeWidth={2} fill="url(#colorScore)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No data yet
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Grade Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-accent" />
                  Grade Distribution
                </CardTitle>
                <CardDescription>Breakdown by letter grade</CardDescription>
              </CardHeader>
              <CardContent>
                {gradeDistribution.some(g => g.count > 0) ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={gradeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="grade" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No grades yet
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
