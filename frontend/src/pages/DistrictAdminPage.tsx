import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/api';

export default function DistrictAdminPage() {
  const districtSlug = 'local';
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if user is authenticated and is an admin
  useEffect(() => {
    getCurrentUser()
      .then((data) => {
        if (data.authenticated && data.user?.role === 'admin') {
          setIsAuthorized(true);
        } else if (data.authenticated) {
          // User is logged in but not admin - redirect to apps
          navigate(`/apps`);
        } else {
          // Not logged in - redirect to login
          navigate(`/login`);
        }
      })
      .catch(() => {
        navigate(`/login`);
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  if (loading) {
    return <div className="text-center py-12">Checking permissions...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="text-center py-12">
        Access denied. Admin privileges required.
      </div>
    );
  }

  const adminActions = [
    {
      title: 'User Management',
      description: 'Invite staff, manage roles, and keep access aligned.',
      to: '/staff',
      cta: 'Manage Staff',
    },
    {
      title: 'App Approvals',
      description: 'Review pending requests and enforce app policies.',
      to: '/requests',
      cta: 'Manage Requests',
    },
    {
      title: 'Activity Logs',
      description: 'See who changed what across your district.',
      to: '/activity',
      cta: 'View Activity',
    },
    {
      title: 'District Settings',
      description: 'Tune SOPPA statuses, tags, and branding.',
      to: '/settings',
      cta: 'Configure Settings',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">Admin Panel</h1>
        <p className="text-muted-foreground">
          Configuration and settings for {districtSlug}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {adminActions.map((action) => (
          <div
            key={action.title}
            className="p-6 border rounded-xl bg-card shadow-sm space-y-4"
          >
            <h3 className="font-semibold text-lg">{action.title}</h3>
            <p className="text-sm text-muted-foreground">
              {action.description}
            </p>
            <Button asChild variant="secondary" className="w-full">
              <Link to={action.to}>{action.cta}</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
