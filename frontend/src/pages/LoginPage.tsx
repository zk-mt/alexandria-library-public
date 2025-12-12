import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getCurrentUser, loginAccount, registerAccount } from '@/lib/api';

const modes = [
  { key: 'signin', label: 'Sign in' },
  { key: 'create', label: 'Create account' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const me = await getCurrentUser();
        if (me?.authenticated && me.user?.email) {
          setSuccess(`Signed in as ${me.user.name || me.user.email}`);
        }
      } catch (err) {
        // ignore; unauthenticated is fine here
      }
    }
    loadSession();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const payload = { username, password, name };
      const response =
        mode === 'signin'
          ? await loginAccount({
              username: payload.username,
              password: payload.password,
            })
          : await registerAccount({
              username: payload.username,
              password: payload.password,
              name: payload.name,
            });

      if (response.error) {
        setError(response.error);
        setIsLoading(false);
        return;
      }

      const successMessage =
        mode === 'signin'
          ? 'Signed in successfully.'
          : 'Account created and signed in successfully.';
      setSuccess(successMessage);
      setIsLoading(false);

      // Send them straight to apps
      setTimeout(() => navigate('/apps'), 400);
    } catch (err: any) {
      console.error('Login error:', err);
      // Show effective error message if available, otherwise generic
      setError(
        err.message || String(err) || 'Network error. Please try again.'
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/40 to-background p-4">
      <Card className="w-full max-w-2xl shadow-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            Access your Alexandria workspace
          </CardTitle>
          <CardDescription>
            Use SSO or create an email/password account.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-lg">
              {modes.map((item) => (
                <Button
                  key={item.key}
                  variant={mode === item.key ? 'default' : 'ghost'}
                  className="flex-1"
                  type="button"
                  onClick={() => setMode(item.key)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jordan Lee"
                  required={mode === 'create'}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 text-sm">
                {success}
              </div>
            )}
            <Button className="w-full" type="submit" disabled={isLoading}>
              {isLoading
                ? 'Working...'
                : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
            </Button>
          </form>

          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <Button
              variant="outline"
              className="w-full relative"
              onClick={() =>
                (window.location.href = `${
                  import.meta.env.VITE_API_URL || 'http://localhost:80'
                }/auth/google`)
              }
              type="button"
            >
              <img
                src="https://www.google.com/favicon.ico"
                alt="Google"
                className="w-4 h-4 mr-2"
              />
              Sign in with Google
            </Button>
            <Button
              variant="outline"
              className="w-full relative"
              onClick={() =>
                (window.location.href = `${
                  import.meta.env.VITE_API_URL || 'http://localhost:80'
                }/auth/apple`)
              }
              type="button"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Sign in with Apple
            </Button>
            <Button
              variant="outline"
              className="w-full relative"
              onClick={() =>
                (window.location.href = `${
                  import.meta.env.VITE_API_URL || 'http://localhost:80'
                }/auth/microsoft`)
              }
              type="button"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 23 23" fill="none">
                <path d="M11 11H0V0h11v11z" fill="#f25022"/>
                <path d="M23 11H12V0h11v11z" fill="#00a4ef"/>
                <path d="M11 23H0V12h11v11z" fill="#7fba00"/>
                <path d="M23 23H12V12h11v11z" fill="#ffb900"/>
              </svg>
              Sign in with Microsoft
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-muted-foreground">
          <Link
            to="/"
            className="underline underline-offset-4 hover:text-primary"
          >
            Back to home
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
