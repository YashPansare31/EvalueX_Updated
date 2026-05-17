import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard,
  Upload,
  FileText,
  BarChart3,
  Users,
  BookOpen,
  ChevronLeft,
  Settings,
  LogOut,
  FileUp,
  ClipboardCheck,
  ClipboardList
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: ClipboardList, label: 'Examinations', path: '/assignments' },
  { icon: Upload, label: 'Exam Setup', path: '/upload' },
  { icon: FileUp, label: 'Upload Answers', path: '/upload-answers' },
  { icon: ClipboardCheck, label: 'Grading Review', path: '/grading-review' },
  { icon: FileText, label: 'Results', path: '/results' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
  { icon: Users, label: 'Classes', path: '/classes' },
  { icon: BookOpen, label: 'Rubrics', path: '/rubrics' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User';
  const userInitial = displayName.charAt(0).toUpperCase();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300 z-50",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center w-full")}>
          <div className="h-9 w-9 flex items-center justify-center flex-shrink-0">
            <img src="/fevicon.ico" alt="EvalueX Logo" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <span className="font-bold text-lg text-sidebar-foreground">EvalueX</span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-sidebar-foreground/70" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path === '/assignments' && location.pathname.startsWith('/assignment'));

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                collapsed && "justify-center px-2",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-accent-foreground")} />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="p-3">
          <button
            onClick={() => setCollapsed(false)}
            className="w-full p-2 rounded-lg hover:bg-sidebar-accent transition-colors flex items-center justify-center"
          >
            <ChevronLeft className="h-4 w-4 text-sidebar-foreground/70 rotate-180" />
          </button>
        </div>
      )}

      {/* User profile */}
      <div className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent transition-colors",
                collapsed && "justify-center"
              )}
            >
              <Avatar className="h-9 w-9 flex-shrink-0">
                <AvatarFallback className="bg-accent/20 text-accent font-medium">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</p>
                  <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
                </div>
              )}
              {!collapsed && (
                <Settings className="h-4 w-4 text-sidebar-foreground/50" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
