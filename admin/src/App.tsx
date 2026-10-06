import { Route, Switch, Redirect } from 'wouter';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Reports from './pages/Reports';
import Analytics from './pages/Analytics';
import HeroSection from './pages/HeroSection';
import Categories from './pages/Categories';
import Disputes from './pages/Disputes';
import Login from './pages/Login';
import { ToastProvider } from './components/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Loader2 } from 'lucide-react';

function ProtectedShell() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-primary/40" />
      </div>
    );
  }

  if (!isAuthenticated) return <Redirect to="/login" />;

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/users" component={Users} />
        <Route path="/reports" component={Reports} />
        <Route path="/disputes" component={Disputes} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/categories" component={Categories} />
        <Route path="/hero-section" component={HeroSection} />
        <Route>
          <div className="text-center py-20">
            <h2 className="font-headings text-3xl font-bold text-primary">Page not found</h2>
            <p className="text-muted-foreground mt-2">The admin route you requested doesn't exist.</p>
          </div>
        </Route>
      </Switch>
    </Layout>
  );
}

function LoginGate() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-primary/40" />
      </div>
    );
  }
  if (isAuthenticated) return <Redirect to="/" />;
  return <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Switch>
          <Route path="/login" component={LoginGate} />
          <Route component={ProtectedShell} />
        </Switch>
      </ToastProvider>
    </AuthProvider>
  );
}
