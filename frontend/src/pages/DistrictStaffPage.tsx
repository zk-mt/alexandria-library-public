import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getCurrentUser, getDistrictUsers, addDistrictUser } from '@/lib/api';

interface UserData {
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export default function DistrictStaffPage() {
  const districtSlug = 'local';
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Check auth
  useEffect(() => {
    getCurrentUser()
      .then((data) => {
        if (
          data.authenticated &&
          (data.user?.role === 'admin' || data.user?.role === 'staff')
        ) {
          setIsAuthorized(true);
        } else if (data.authenticated) {
          // No access for implicit roles if needed, or redirect
          // For now assume staff page is visible to staff+
          setIsAuthorized(true);
        } else {
          navigate(`/login`);
        }
      })
      .catch(() => {
        navigate(`/login`);
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const loadUsers = () => {
    setLoading(true);
    getDistrictUsers(districtSlug)
      .then((data) => {
        if (data && Array.isArray(data.users)) {
          setUsers(data.users);
        } else if (Array.isArray(data)) {
          setUsers(data);
        } else {
          setUsers([]);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  const formatDate = (value: string) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
  };

  useEffect(() => {
    if (isAuthorized) {
      loadUsers();
    }
  }, [districtSlug, isAuthorized]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      await addDistrictUser(districtSlug, {
        email: inviteEmail,
        role: 'staff',
      });
      setInviteEmail('');
      setShowInvite(false);
      loadUsers();
    } catch (err) {
      console.error('Failed to invite user', err);
      alert('Failed to invite user');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">Staff directory</h1>
          <p className="text-muted-foreground">
            Manage access to the {districtSlug} portal
          </p>
        </div>
        <Button onClick={() => setShowInvite(!showInvite)}>
          {showInvite ? 'Cancel' : 'Invite Staff'}
        </Button>
      </div>

      {showInvite && (
        <form
          onSubmit={handleInvite}
          className="flex gap-2 max-w-sm border p-4 rounded-md"
        >
          <input
            type="email"
            placeholder="colleague@school.org"
            className="flex-1 border p-2 rounded-md outline-none focus:ring-2 focus:ring-primary/50"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <Button type="submit">Send</Button>
        </form>
      )}

      {loading ? (
        <p>Loading staff...</p>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="p-4 font-medium text-muted-foreground">Name</th>
                <th className="p-4 font-medium text-muted-foreground">Email</th>
                <th className="p-4 font-medium text-muted-foreground">Role</th>
                <th className="p-4 font-medium text-muted-foreground">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <tr key={user.email} className="hover:bg-muted/30">
                  <td className="p-4 font-medium">{user.name || 'Pending'}</td>
                  <td className="p-4">{user.email}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 uppercase">
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {formatDate(user.created_at)}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No staff members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
