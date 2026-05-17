import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import Index from "./pages/marketing/Index";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import Dashboard from "./pages/dashboard/Dashboard";
import Assignment from "./pages/grading/Assignment";
import UploadExam from "./pages/grading/UploadExam";
import UploadAnswers from "./pages/grading/UploadAnswers";
import Results from "./pages/dashboard/Results";
import Analytics from "./pages/dashboard/Analytics";
import Assignments from "./pages/dashboard/Assignments";
import Classes from "./pages/dashboard/Classes";
import ClassDetail from "./pages/dashboard/ClassDetail";
import Rubrics from "./pages/grading/Rubrics";
import GradingReview from "./pages/grading/GradingReview";
import NotFound from "./pages/NotFound";
import Settings from "./pages/settings/Settings";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/assignment/:id" element={<Assignment />} />
              <Route path="/upload" element={<UploadExam />} />
              <Route path="/upload/:id" element={<UploadExam />} />
              <Route path="/upload-answers" element={<UploadAnswers />} />
              <Route path="/results" element={<Results />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/assignments" element={<Assignments />} />
              <Route path="/classes" element={<Classes />} />
              <Route path="/classes/:id" element={<ClassDetail />} />
              <Route path="/rubrics" element={<Rubrics />} />
              <Route path="/grading-review" element={<GradingReview />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
