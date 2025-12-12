import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  getAppRequests,
  updateAppRequestStatus,
  getCurrentUser,
} from '@/lib/api';
import { Loader2 } from 'lucide-react';

interface AppRequest {
  id: number;
  name: string;
  company?: string;
  url?: string;
  notes?: string;
  requester_email?: string;
  requester_name?: string;
  status: string;
  created_at: string;
}

export default function DistrictRequestsPage() {
  const districtSlug = 'local'; // Hardcoded as per instruction
  const navigate = useNavigate();
  const [requests, setRequests] = useState<AppRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true); // New state for auth loading

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
      .finally(() => setAuthLoading(false));
  }, [navigate]);

  useEffect(() => {
    if (isAuthorized) {
      loadRequests();
    }
  }, [isAuthorized]); // Load requests only after authorization is confirmed

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await getAppRequests(districtSlug);
      if (Array.isArray(data)) {
        setRequests(data);
      }
    } catch (err) {
      console.error('Failed to load requests', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id: number, status: string) => {
    try {
      await updateAppRequestStatus(districtSlug, id, status);
      loadRequests();
    } catch (err) {
      alert('Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">App Requests</h1>
          <p className="text-muted-foreground">
            Manage requests submitted by staff and parents
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin">Back to Admin Panel</Link>
        </Button>
      </div>

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            Loading request data...
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
              <span className="text-xl">📭</span>
            </div>
            <h3 className="text-lg font-medium">No requests found</h3>
            <p className="text-muted-foreground">
              Calls for new apps will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">App Details</th>
                  <th className="px-4 py-3 font-medium">Requested By</th>
                  <th className="px-4 py-3 font-medium">Justification</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold">{req.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {req.company}
                      </div>
                      {req.url && (
                        <a
                          href={req.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Visit Website
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>{req.requester_name || 'Anonymous'}</div>
                      <div className="text-xs text-muted-foreground">
                        {req.requester_email || 'No email'}
                      </div>
                    </td>
                    <td
                      className="px-4 py-3 max-w-xs truncate"
                      title={req.notes || ''}
                    >
                      {req.notes || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {req.created_at
                        ? new Date(req.created_at).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium 
                                        ${
                                          req.status === 'Approved'
                                            ? 'bg-green-100 text-green-700'
                                            : req.status === 'Denied'
                                            ? 'bg-red-100 text-red-700'
                                            : 'bg-amber-100 text-amber-700'
                                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {req.status === 'Pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 bg-green-600 hover:bg-green-700"
                            onClick={() =>
                              handleStatusUpdate(req.id, 'Approved')
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7"
                            onClick={() => handleStatusUpdate(req.id, 'Denied')}
                          >
                            Deny
                          </Button>
                        </>
                      )}
                      {req.status !== 'Pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() => handleStatusUpdate(req.id, 'Pending')}
                        >
                          Reopen
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
