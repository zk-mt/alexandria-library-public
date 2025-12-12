import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getCurrentUser,
  getDistrictSettings,
  updateDistrictSettings,
  uploadDistrictLogo,
} from '@/lib/api';
import type { DistrictSettings } from '@/lib/api';
import {
  X,
  Plus,
  Save,
  ArrowLeft,
  Loader2,
  Upload,
  Image,
  Check,
} from 'lucide-react';

export default function DistrictSettingsPage() {
  // Single tenant: hardcode slug to 'local'
  const districtSlug = 'local';
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [settings, setSettings] = useState<DistrictSettings>({
    allowed_domain: '',
    soppa_statuses: [],
    app_statuses: [],
    app_tags: [],
    custom_fields: {},
    google_client_id: '',
    google_client_secret: '',
    apple_client_id: '',
    apple_team_id: '',
    apple_key_id: '',
    apple_private_key: '',
    microsoft_client_id: '',
    microsoft_tenant_id: '',
    microsoft_client_secret: '',
  });

  // New item inputs
  const [newSoppaStatus, setNewSoppaStatus] = useState('');
  const [newAppStatus, setNewAppStatus] = useState('');
  const [newAppTag, setNewAppTag] = useState('');

  // Logo upload
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setMessage(null);
    try {
      const result = await uploadDistrictLogo(districtSlug, file);
      if (result.success) {
        setSettings((prev) => ({ ...prev, logo_path: result.logo_path }));
        setMessage({ type: 'success', text: 'Logo uploaded successfully!' });
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to upload logo',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  // Check authorization and load settings
  useEffect(() => {
    async function loadData() {
      try {
        const userData = await getCurrentUser();
        if (userData.authenticated && userData.user?.role === 'admin') {
          setIsAuthorized(true);
          // Load settings
          const settingsData = await getDistrictSettings(districtSlug);
          if (settingsData) {
            setSettings((prev) => ({ ...prev, ...settingsData }));
          }
        } else if (userData.authenticated) {
          navigate(`/apps`);
        } else {
          navigate(`/login`);
        }
      } catch {
        navigate(`/login`);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [navigate]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await updateDistrictSettings(districtSlug, settings);
      if (result.success) {
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000); // Reset after 2 seconds
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to save settings',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const addItem = (
    list: 'soppa_statuses' | 'app_statuses' | 'app_tags',
    value: string
  ) => {
    if (!value.trim()) return;
    if (settings[list].includes(value.trim())) return;
    setSettings((prev) => ({
      ...prev,
      [list]: [...prev[list], value.trim()],
    }));
  };

  const removeItem = (
    list: 'soppa_statuses' | 'app_statuses' | 'app_tags',
    index: number
  ) => {
    setSettings((prev) => ({
      ...prev,
      [list]: prev[list].filter((_, i) => i !== index),
    }));
  };

  const moveItem = (
    list: 'soppa_statuses' | 'app_statuses' | 'app_tags',
    index: number,
    direction: 'up' | 'down'
  ) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= settings[list].length) return;

    setSettings((prev) => {
      const newList = [...prev[list]];
      [newList[index], newList[newIndex]] = [newList[newIndex], newList[index]];
      return { ...prev, [list]: newList };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="text-center py-12">
        Access denied. Admin privileges required.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/admin`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">District Settings</h1>
          <p className="text-muted-foreground">
            Customize SOPPA compliance statuses, app statuses, and tags for{' '}
            {districtSlug}
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* SOPPA Compliance Statuses */}
        <div className="p-6 border rounded-xl bg-card shadow-sm space-y-4">
          <div>
            <h3 className="font-semibold text-lg">SOPPA Compliance Statuses</h3>
            <p className="text-sm text-muted-foreground">
              Define the privacy compliance status options for apps
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Add new status..."
              value={newSoppaStatus}
              onChange={(e) => setNewSoppaStatus(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem('soppa_statuses', newSoppaStatus);
                  setNewSoppaStatus('');
                }
              }}
            />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => {
                addItem('soppa_statuses', newSoppaStatus);
                setNewSoppaStatus('');
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {settings.soppa_statuses.map((status, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg group"
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveItem('soppa_statuses', index, 'up')}
                    className="text-muted-foreground hover:text-foreground text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={index === 0}
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveItem('soppa_statuses', index, 'down')}
                    className="text-muted-foreground hover:text-foreground text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={index === settings.soppa_statuses.length - 1}
                  >
                    ▼
                  </button>
                </div>
                <span className="flex-1 text-sm">{status}</span>
                <button
                  onClick={() => removeItem('soppa_statuses', index)}
                  className="text-muted-foreground hover:text-red-500 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {settings.soppa_statuses.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No statuses defined
              </p>
            )}
          </div>
        </div>

        {/* App Statuses */}
        <div className="p-6 border rounded-xl bg-card shadow-sm space-y-4">
          <div>
            <h3 className="font-semibold text-lg">App Approval Statuses</h3>
            <p className="text-sm text-muted-foreground">
              Define the approval status options for apps in your district
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Add new status..."
              value={newAppStatus}
              onChange={(e) => setNewAppStatus(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem('app_statuses', newAppStatus);
                  setNewAppStatus('');
                }
              }}
            />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => {
                addItem('app_statuses', newAppStatus);
                setNewAppStatus('');
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {settings.app_statuses.map((status, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg group"
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveItem('app_statuses', index, 'up')}
                    className="text-muted-foreground hover:text-foreground text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={index === 0}
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveItem('app_statuses', index, 'down')}
                    className="text-muted-foreground hover:text-foreground text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={index === settings.app_statuses.length - 1}
                  >
                    ▼
                  </button>
                </div>
                <span className="flex-1 text-sm">{status}</span>
                <button
                  onClick={() => removeItem('app_statuses', index)}
                  className="text-muted-foreground hover:text-red-500 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {settings.app_statuses.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No statuses defined
              </p>
            )}
          </div>
        </div>

        {/* App Tags */}
        <div className="p-6 border rounded-xl bg-card shadow-sm space-y-4 lg:col-span-2">
          <div>
            <h3 className="font-semibold text-lg">App Tags / Categories</h3>
            <p className="text-sm text-muted-foreground">
              Define tags to categorize apps (grade levels, subjects,
              departments, etc.)
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Add new tag..."
              value={newAppTag}
              onChange={(e) => setNewAppTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem('app_tags', newAppTag);
                  setNewAppTag('');
                }
              }}
            />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => {
                addItem('app_tags', newAppTag);
                setNewAppTag('');
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {settings.app_tags.map((tag, index) => (
              <div
                key={index}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm group"
              >
                <span>{tag}</span>
                <button
                  onClick={() => removeItem('app_tags', index)}
                  className="text-primary/50 hover:text-red-500 ml-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {settings.app_tags.length === 0 && (
              <p className="text-sm text-muted-foreground">No tags defined</p>
            )}
          </div>
        </div>
      </div>

      {/* Access Control */}
      <div className="p-6 border rounded-xl bg-card shadow-sm space-y-4">
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">Access Control</h3>
          <p className="text-sm text-muted-foreground">
            Restrict Google sign-in to a specific email domain (e.g., sd25.org).
            Leave blank to allow any domain.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="allowed-domain">
            Allowed Google Workspace domain
          </label>
          <Input
            id="allowed-domain"
            placeholder="sd25.org"
            value={settings.allowed_domain || ''}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                allowed_domain: e.target.value,
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Only Google accounts from this domain will be allowed to sign in.
            This does not affect local username/password accounts.
          </p>
        </div>
      </div>

      {/* Branding Section */}
      <div className="p-6 border rounded-xl bg-card shadow-sm space-y-6">
        <div>
          <h3 className="font-semibold text-lg">District Branding</h3>
          <p className="text-sm text-muted-foreground">
            Customize the look of your district's app library
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Logo Upload */}
          <div className="space-y-3">
            <label className="text-sm font-medium">District Logo</label>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50 overflow-hidden">
                {settings.logo_path ? (
                  <img
                    src={settings.logo_path}
                    alt="District logo"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Image className="h-8 w-8 text-muted-foreground/50" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  id="logo-upload"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Logo
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Recommended: 200x200px PNG or SVG
                </p>
              </div>
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Display Name</label>
            <Input
              placeholder="Enter custom display name..."
              value={settings.display_name || ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  display_name: e.target.value || null,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Override the district name shown in the header (leave blank to use
              default)
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Primary Color */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.primary_color || '#2563eb'}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    primary_color: e.target.value,
                  }))
                }
                className="h-10 w-14 rounded border cursor-pointer"
              />
              <Input
                placeholder="#2563eb"
                value={settings.primary_color || ''}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    primary_color: e.target.value || null,
                  }))
                }
                className="max-w-32"
              />
              {settings.primary_color && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, primary_color: null }))
                  }
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* Accent Color */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Accent Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.accent_color || '#7c3aed'}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    accent_color: e.target.value,
                  }))
                }
                className="h-10 w-14 rounded border cursor-pointer"
              />
              <Input
                placeholder="#7c3aed"
                value={settings.accent_color || ''}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    accent_color: e.target.value || null,
                  }))
                }
                className="max-w-32"
              />
              {settings.accent_color && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, accent_color: null }))
                  }
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Access Control */}
      <div className="p-6 border rounded-xl bg-card shadow-sm space-y-4">
        <div>
          <h3 className="font-semibold text-lg">Access Control</h3>
          <p className="text-sm text-muted-foreground">
            Restrict app requests to specific email domains (e.g., myschool.edu)
          </p>
        </div>
        <div className="space-y-3">
          <label className="text-sm font-medium">Allowed Email Domain</label>
          <Input
            placeholder="e.g. myschool.edu"
            value={settings.allowed_domain || ''}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                allowed_domain: e.target.value.trim() || null,
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to allow requests from any email address. If set, users
            must sign in with a Google account matching this domain to request
            apps.
          </p>
        </div>
      </div>

      {/* SSO Configuration */}
      <div className="p-6 border rounded-xl bg-card shadow-sm space-y-6">
        <div>
          <h3 className="font-semibold text-lg">Google SSO Configuration</h3>
          <p className="text-sm text-muted-foreground">
            Configure Google Workspace Single Sign-On. These settings are stored
            in your database.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <label className="text-sm font-medium">Google Client ID</label>
            <Input
              placeholder="1234...apps.googleusercontent.com"
              value={settings.google_client_id || ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  google_client_id: e.target.value.trim() || null,
                }))
              }
            />
          </div>
          <div className="space-y-3">
            <label className="text-sm font-medium">Google Client Secret</label>
            <Input
              type="password"
              placeholder={
                settings.google_client_secret
                  ? '********'
                  : 'Enter client secret...'
              }
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  google_client_secret: e.target.value.trim() || null,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              {settings.google_client_secret === '********'
                ? 'Secret is set. Enter new value to overwrite.'
                : 'Required for SSO to function.'}
            </p>
          </div>
        </div>

        <div className="space-y-4 pt-2 border-t">
          <h3 className="font-semibold text-lg">Apple Sign In</h3>
          <p className="text-sm text-muted-foreground">
            Provide your Apple Services IDs. Store your private key here (will
            be masked after save).
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-3">
              <label className="text-sm font-medium">
                Apple Client ID (Services ID)
              </label>
              <Input
                placeholder="com.example.app"
                value={settings.apple_client_id || ''}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    apple_client_id: e.target.value.trim() || null,
                  }))
                }
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium">Team ID</label>
              <Input
                placeholder="ABCDE12345"
                value={settings.apple_team_id || ''}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    apple_team_id: e.target.value.trim() || null,
                  }))
                }
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium">Key ID</label>
              <Input
                placeholder="AAABBBCCCD"
                value={settings.apple_key_id || ''}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    apple_key_id: e.target.value.trim() || null,
                  }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Apple Private Key (p8)
            </label>
            <textarea
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={
                settings.apple_private_key
                  ? '********'
                  : 'Paste your .p8 key contents'
              }
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  apple_private_key: e.target.value || null,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Key is stored securely in the database; enter a new value to
              replace.
            </p>
          </div>
        </div>

        <div className="space-y-4 pt-2 border-t">
          <h3 className="font-semibold text-lg">Microsoft Entra ID</h3>
          <p className="text-sm text-muted-foreground">
            Configure Azure AD / Entra app credentials. Secrets are masked after
            saving.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-3">
              <label className="text-sm font-medium">
                Client ID (Application ID)
              </label>
              <Input
                placeholder="00000000-0000-0000-0000-000000000000"
                value={settings.microsoft_client_id || ''}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    microsoft_client_id: e.target.value.trim() || null,
                  }))
                }
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium">Tenant ID</label>
              <Input
                placeholder="common or your-tenant-guid"
                value={settings.microsoft_tenant_id || ''}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    microsoft_tenant_id: e.target.value.trim() || null,
                  }))
                }
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium">Client Secret</label>
              <Input
                type="password"
                placeholder={
                  settings.microsoft_client_secret
                    ? '********'
                    : 'Enter client secret...'
                }
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    microsoft_client_secret: e.target.value.trim() || null,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {settings.microsoft_client_secret === '********'
                  ? 'Secret is set. Enter new value to overwrite.'
                  : 'Required for Microsoft SSO.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-4 pt-4 border-t">
        <Button variant="outline" onClick={() => navigate(`/admin`)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || justSaved}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : justSaved ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
