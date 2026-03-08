import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, Clock, BarChart3, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

const features = [
  {
    icon: Sparkles,
    title: 'AI-Powered Feedback',
    description: 'Intelligent analysis provides detailed, constructive feedback for every submission.',
  },
  {
    icon: Clock,
    title: 'Save Hours Weekly',
    description: 'Reduce grading time by up to 70% while maintaining quality and consistency.',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Track student progress and identify areas for improvement at a glance.',
  },
  {
    icon: Shield,
    title: 'Educator Control',
    description: 'Review, adjust, and approve all AI-generated grades before finalizing.',
  },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
      </div>

      <div className="container relative">
        {/* Hero content */}
        <div className="flex flex-col items-center text-center pt-20 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-sm text-accent mb-6"
          >
            <Sparkles className="h-4 w-4" />
            <span>AI-Powered Grading Assistant</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-4xl text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground mb-6"
          >
            Grade Smarter,{' '}
            <span className="text-gradient">Not Harder</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-2xl text-lg sm:text-xl text-muted-foreground mb-10"
          >
            Transform your grading workflow with AI-powered assistance. 
            Get instant feedback, consistent scoring, and detailed analytics 
            while you maintain full control.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <Link to="/signup">
              <Button variant="hero" size="xl">
                Start Grading Free
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline-hero" size="xl">
                Educator Login
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* Features grid */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-20"
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
              className="group relative rounded-2xl border border-border bg-card p-6 hover:border-accent/50 hover:shadow-lg transition-all duration-300"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
