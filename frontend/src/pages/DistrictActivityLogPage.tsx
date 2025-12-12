import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDistrictActivity, getUserDistrictRole, getCurrentUser } from '@/lib/api';

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

interface LogEntry {
  id: number;
  action: string;
  app_name?: string;
  app_id?: number;
  user_email?: string;
  created_at: string;
  details?: Record<string, any>;
}

function getActionIcon(action: string) {
  switch (action) {
    case 'create':
      return { icon: '+', color: 'bg-green-500', label: 'Added' };
    case 'update':
      return { icon: '✎', color: 'bg-blue-500', label: 'Updated' };
    case 'delete':
      return { icon: '−', color: 'bg-red-500', label: 'Removed' };
    default:
      return { icon: '•', color: 'bg-gray-500', label: action };
  }
}

export default function DistrictActivityLogPage() {
  const districtSlug = 'local';
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Check auth
  useEffect(() => {
    getCurrentUser()
      .then((data) => {
        if (data.authenticated && data.user?.role === 'admin') {
          setIsAuthorized(true);
        } else if (data.authenticated) {
          navigate(`/apps`);
        } else {
          navigate(`/login`);
        }
      })
      .catch(() => {
        navigate(`/login`);
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    if (isAuthorized) {
      getDistrictActivity(districtSlug)
        .then((data) => {
          if (Array.isArray(data)) {
            setLogs(data);
          }
        })
        .catch((err) => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [districtSlug, isAuthorized]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Activity Log</h1>
        <p className="text-muted-foreground">
          Track all changes, additions, and deletions in your app directory
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse flex gap-4 p-4 border rounded-xl bg-card">
              <div className="w-10 h-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-muted/20">
          <div className="text-6xl mb-3">📋</div>
          <p className="text-xl font-medium text-muted-foreground">No activity yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Actions like adding, editing, or removing apps will appear here
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />
          
          <div className="space-y-1">
            {logs.map((log, index) => {
              const { icon, color, label } = getActionIcon(log.action);
              return (
                <div 
                  key={log.id} 
                  className="relative flex gap-4 pl-12 py-4 hover:bg-muted/30 rounded-lg transition-colors"
                >
                  {/* Icon */}
                  <div 
                    className={`absolute left-2 w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-sm font-bold shadow-md`}
                  >
                    {icon}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        log.action === 'create' ? 'bg-green-100 text-green-800' :
                        log.action === 'update' ? 'bg-blue-100 text-blue-800' :
                        log.action === 'delete' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {label}
                      </span>
                      {log.app_name && (
                        <span className="font-semibold text-primary truncate max-w-[200px]">
                          {log.app_name}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mt-1">
                      by <span className="font-medium">{log.user_email || 'System'}</span>
                    </p>
                    
                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
                        {log.details.fields && (
                          <span>Fields changed: {log.details.fields.join(', ')}</span>
                        )}
                        {log.details.action && (
                          <span>Action: {log.details.action}</span>
                        )}
                        {log.details.ndpa && (
                          <span>NDPA uploaded</span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Time */}
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimeAgo(log.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {logs.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {logs.length} most recent activities
        </p>
      )}
    </div>
  );
}
