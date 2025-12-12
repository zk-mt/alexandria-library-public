import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getDistrictStats, getDistrict } from '@/lib/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface DistrictStats {
  district_name: string;
  total_apps: number;
  status_counts: Record<string, number>;
  apps_with_ndpa: number;
  staff_count: number;
  recent_apps: Array<{
    id: number;
    name: string;
    status: string;
    logo_path?: string;
    company?: string;
  }>;
  recent_activity: Array<{
    action: string;
    app_name?: string;
    user_email?: string;
    created_at?: string;
  }>;
}

function getStatusColor(status: string) {
  const s = status?.toLowerCase();
  if (s?.includes('approved')) return 'bg-emerald-500/20 text-emerald-400';
  if (s?.includes('pending')) return 'bg-amber-500/20 text-amber-400';
  if (s?.includes('review')) return 'bg-blue-500/20 text-blue-400';
  if (s?.includes('denied')) return 'bg-red-500/20 text-red-400';
  return 'bg-gray-500/20 text-gray-400';
}

function getActionText(action: string) {
  switch (action) {
    case 'create': return 'added';
    case 'update': return 'updated';
    case 'delete': return 'removed';
    default: return action;
  }
}

function formatTimeAgo(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default function DistrictHomePage() {
  const districtSlug = 'local';
  const [stats, setStats] = useState<DistrictStats | null>(null);
  const [districtInfo, setDistrictInfo] = useState<{ name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDistrictStats(districtSlug),
      getDistrict(districtSlug)
    ])
      .then(([statsData, infoData]) => {
        if (!statsData.error) setStats(statsData);
        if (!infoData.error) setDistrictInfo(infoData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [districtSlug]);

  // Status counts - handle various status naming conventions
  const getStatusCount = (statusCounts: Record<string, number> | undefined, ...keys: string[]) => {
    if (!statusCounts) return 0;
    for (const key of keys) {
      if (statusCounts[key]) return statusCounts[key];
    }
    return 0;
  };
  
  const approvedCount = getStatusCount(stats?.status_counts, 'Approved', 'Approved for Use', 'approved', 'approved for use');
  const pendingCount = getStatusCount(stats?.status_counts, 'Pending', 'Pending Review', 'pending');

  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <div className="rounded-2xl border bg-gradient-to-br from-primary/5 via-card to-card shadow-sm p-6 sm:p-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide">
            {districtInfo?.name || districtSlug} • Public transparency page
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
              See which apps are approved, what data they collect, and how we protect students.
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Parents, staff, and vendors can explore our vetted tools, privacy agreements, and data-sharing practices.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/apps">Browse all {stats?.total_apps || 0} apps</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/login">Admin / staff sign in</Link>
            </Button>
          </div>
        </div>

        {/* Stats Panel */}
        <div className="rounded-xl border bg-background/80 backdrop-blur shadow-inner p-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted-foreground">Directory Overview</p>
            {stats && (
              <span className="text-xs rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 font-semibold">
                Live data
              </span>
            )}
          </div>
          
          {loading ? (
            <div className="grid grid-cols-3 gap-4">
              {[1,2,3].map(i => (
                <div key={i} className="rounded-lg border bg-muted/40 p-4 animate-pulse">
                  <div className="h-3 bg-muted rounded w-16 mb-2" />
                  <div className="h-7 bg-muted rounded w-10" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <p className="text-sm text-green-400">Approved</p>
                <p className="text-3xl font-bold text-green-300">{approvedCount}</p>
                <p className="text-xs text-green-500/70">ready to use</p>
              </div>
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                <p className="text-sm text-yellow-400">Pending</p>
                <p className="text-3xl font-bold text-yellow-300">{pendingCount}</p>
                <p className="text-xs text-yellow-500/70">awaiting review</p>
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                <p className="text-sm text-blue-400">With NDPA</p>
                <p className="text-3xl font-bold text-blue-300">{stats?.apps_with_ndpa || 0}</p>
                <p className="text-xs text-blue-500/70">signed agreements</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold">What you can find here</p>
            <ul className="grid gap-2 text-sm text-muted-foreground">
              <li className="rounded-md bg-primary/5 px-3 py-2 flex items-center gap-2">
                <span className="text-primary">✓</span> Approved app directory with privacy policies
              </li>
              <li className="rounded-md bg-primary/5 px-3 py-2 flex items-center gap-2">
                <span className="text-primary">✓</span> Signed data privacy agreements (NDPA)
              </li>
              <li className="rounded-md bg-primary/5 px-3 py-2 flex items-center gap-2">
                <span className="text-primary">✓</span> Vendor contact information
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Recently Added Apps */}
        <div className="lg:col-span-2 rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Recently added</p>
              <h2 className="text-xl font-semibold">Latest Apps</h2>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/apps">View all</Link>
            </Button>
          </div>
          
          {loading ? (
            <div className="divide-y border rounded-xl overflow-hidden">
              {[1,2,3].map(i => (
                <div key={i} className="flex items-center gap-4 p-4 bg-muted/30 animate-pulse">
                  <div className="w-10 h-10 rounded-lg bg-muted" />
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded w-32 mb-2" />
                    <div className="h-3 bg-muted rounded w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : stats?.recent_apps?.length ? (
            <div className="divide-y border rounded-xl overflow-hidden">
              {stats.recent_apps.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center gap-4 bg-muted/30 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  {app.logo_path ? (
                    <img
                      src={`${BASE_URL}/${app.logo_path}`}
                      alt={app.name}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-primary font-bold">
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{app.name}</p>
                    {app.company && (
                      <p className="text-sm text-muted-foreground truncate">{app.company}</p>
                    )}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(app.status)}`}>
                    {app.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 border rounded-xl bg-muted/20">
              <p className="text-muted-foreground">No apps added yet</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Activity</p>
              <h2 className="text-xl font-semibold">Recent Changes</h2>
            </div>
            
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="h-3 bg-muted rounded w-full mb-1" />
                    <div className="h-2 bg-muted rounded w-16" />
                  </div>
                ))}
              </div>
            ) : stats?.recent_activity?.length ? (
              <ul className="space-y-3 text-sm">
                {stats.recent_activity.map((activity, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                      activity.action === 'create' ? 'bg-green-500' :
                      activity.action === 'update' ? 'bg-blue-500' :
                      activity.action === 'delete' ? 'bg-red-500' : 'bg-gray-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">{activity.app_name || 'An app'}</span>
                        {' '}{getActionText(activity.action)}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {formatTimeAgo(activity.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            )}
          </div>

          {/* Getting Started */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Getting started</p>
              <h2 className="text-xl font-semibold">For Staff</h2>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="rounded-lg border bg-muted/30 p-3 flex items-start gap-2">
                <span className="font-bold text-primary">1.</span>
                <span>Sign in with your district email</span>
              </li>
              <li className="rounded-lg border bg-muted/30 p-3 flex items-start gap-2">
                <span className="font-bold text-primary">2.</span>
                <span>Add and manage apps and vendor agreements</span>
              </li>
              <li className="rounded-lg border bg-muted/30 p-3 flex items-start gap-2">
                <span className="font-bold text-primary">3.</span>
                <span>Keep the public directory updated</span>
              </li>
            </ol>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/login">Go to sign in</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
