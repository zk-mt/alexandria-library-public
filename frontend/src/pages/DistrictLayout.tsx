import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UserNav } from '@/components/UserNav';
import { getCurrentUser, getDistrictBranding } from '@/lib/api';
import type { DistrictBranding } from '@/lib/api';
import { Book } from 'lucide-react';

export default function DistrictLayout() {
  const districtSlug = 'local';
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [branding, setBranding] = useState<DistrictBranding | null>(null);

  useEffect(() => {
    // Fetch user role
    getCurrentUser()
      .then((data) => {
        setIsAuthenticated(data.authenticated === true);
        setUserRole(data.user?.role || null);
      })
      .catch(() => {
        setIsAuthenticated(false);
        setUserRole(null);
      });

    // Fetch branding
    getDistrictBranding(districtSlug)
      .then((data) => {
        if (data.slug) {
          setBranding(data);
        }
      })
      .catch(() => {
        // Ignore branding errors, use defaults
      });
  }, [districtSlug]);

  // Public nav items - always visible
  const publicNavItems = [{ label: 'Apps', path: '/apps' }];

  // Authenticated nav items - only for logged in users with a role in this district
  const authNavItems = [
    { label: 'Staff', path: '/staff' },
    { label: 'Activity', path: '/activity' },
  ];

  // Admin-only nav items
  const adminNavItems = [{ label: 'Admin', path: '/admin' }];

  // Build nav items based on auth status
  let navItems = [...publicNavItems];
  if (isAuthenticated && userRole) {
    navItems = [...navItems, ...authNavItems];
    if (userRole === 'admin') {
      navItems = [...navItems, ...adminNavItems];
    }
  }

  // Apply custom CSS variables for branding colors
  const brandingStyles: React.CSSProperties = {};
  if (branding?.primary_color) {
    brandingStyles['--district-primary' as string] = branding.primary_color;
  }
  if (branding?.accent_color) {
    brandingStyles['--district-accent' as string] = branding.accent_color;
  }

  return (
    <div
      className="min-h-screen flex flex-col bg-background"
      style={brandingStyles}
    >
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6 shadow-sm">
        <Link to="/" className="flex items-center gap-3 font-semibold text-lg">
          {branding?.logo_path &&
          branding.logo_path !== '/alexandria-logo.png' ? (
            <img
              src={branding.logo_path}
              alt={branding.name || districtSlug}
              className="h-9 w-9 rounded-lg object-contain"
            />
          ) : (
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary border">
              <Book className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <span className="hidden sm:inline-block">
            {branding?.name || districtSlug}
          </span>
        </Link>
        <div className="h-6 w-px bg-border mx-2" />
        <div className="text-sm text-muted-foreground">App Library</div>

        <nav className="ml-auto flex items-center gap-2 sm:gap-4">
          {navItems.map((item) => {
            const isActive = location.pathname.endsWith(item.path || '/');
            return (
              <Link
                key={item.label}
                to={item.path}
                className={cn(
                  'text-sm font-medium transition-colors px-3 py-1 rounded-md',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-4 pl-4 border-l">
          <UserNav />
        </div>
      </header>

      <main className="flex-1 p-6 lg:p-10">
        <Outlet />
      </main>
    </div>
  );
}
