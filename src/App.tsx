import { lazy, Suspense } from 'react';
import { Switch, Route, useLocation } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

const UnifiedDashboard = lazy(async () => {
  const module = await import('@/pages/UnifiedDashboard');
  return { default: module.UnifiedDashboard };
});

const PoolStats = lazy(async () => {
  const module = await import('@/pages/PoolStats');
  return { default: module.PoolStats };
});

const Settings = lazy(async () => {
  const module = await import('@/pages/Settings');
  return { default: module.Settings };
});

function Router() {
  const [location] = useLocation();

  return (
    <div key={location} className="route-transition">
      <Suspense fallback={<RouteFallback />}>
        <Switch location={location}>
          <Route path="/">
            <UnifiedDashboard />
          </Route>
          <Route path="/pool-stats">
            <PoolStats />
          </Route>
          <Route path="/settings">
            <Settings appMode="translator" />
          </Route>
          <Route>
            <UnifiedDashboard />
          </Route>
        </Switch>
      </Suspense>
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-[1320px] loading-surface p-5 md:p-6">
        <div className="space-y-5">
          <div className="skeleton h-12 w-64 rounded-xl" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="skeleton h-32 rounded-2xl" />
            <div className="skeleton h-32 rounded-2xl" />
            <div className="skeleton h-32 rounded-2xl" />
            <div className="skeleton h-32 rounded-2xl" />
          </div>
          <div className="skeleton h-[280px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  );
}

export default App;
