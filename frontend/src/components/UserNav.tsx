import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCurrentUser, logoutAccount } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function UserNav() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ email: string; name?: string } | null>(null);

  useEffect(() => {
    getCurrentUser().then((me) => {
      if (me?.authenticated && me.user) {
        setUser(me.user);
      }
    }).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logoutAccount();
    setUser(null);
    navigate('/login');
  };

  if (!user) {
    return (
       <div className="flex items-center gap-2">
         <Link to="/login" className="text-sm font-medium hover:underline">
           Staff Login
         </Link>
       </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="text-right hidden sm:block">
        <p className="text-sm font-medium leading-none">{user.name || 'User'}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-xs border">
            {user.name ? user.name[0].toUpperCase() : 'U'}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs text-muted-foreground hover:text-foreground">
            Sign out
        </Button>
      </div>
    </div>
  );
}
