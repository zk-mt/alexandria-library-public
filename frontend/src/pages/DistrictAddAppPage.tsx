import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addDistrictApp, getCurrentUser, getAvailableGlobalApps, addGlobalAppToDistrict } from '@/lib/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface GlobalApp {
  id: number;
  name: string;
  company?: string;
  logo_path?: string;
  product_link?: string;
  privacy_link?: string;
  status: string;
}

export default function DistrictAddAppPage() {
  const districtSlug = 'local';
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'global' | 'custom'>('global');
  const [showLimitModal, setShowLimitModal] = useState(false);
  
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Global apps
  const [globalApps, setGlobalApps] = useState<GlobalApp[]>([]);
  const [addingGlobal, setAddingGlobal] = useState<number | null>(null);
  const [removingIds, setRemovingIds] = useState<number[]>([]);
  
  // Custom app form
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [productLink, setProductLink] = useState('');
  const [privacyLink, setPrivacyLink] = useState('');
  const [status, setStatus] = useState('Pending');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [ndpaFile, setNdpaFile] = useState<File | null>(null);
  const [exhibitEFile, setExhibitEFile] = useState<File | null>(null);

  // Check auth
  useEffect(() => {
    getCurrentUser()
      .then((data) => {
        if (data.authenticated) {
            setIsAuthorized(true);
            setIsAdmin(data.user?.role === 'admin');
            if (data.user?.role === 'admin') {
                loadGlobalApps();
            }
        } else {
          navigate(`/login`);
        }
      })
      .catch(() => {
        navigate(`/login`);
      });
  }, [navigate]);

  const loadGlobalApps = async () => {
    try {
      const apps = await getAvailableGlobalApps(districtSlug);
      if (Array.isArray(apps)) {
        setGlobalApps(apps);
      }
    } catch (err) {
      console.error('Failed to load global apps', err);
    }
  };

  const handleAddGlobalApp = async (appId: number) => {
    setAddingGlobal(appId);
    try {
      const result = await addGlobalAppToDistrict(districtSlug, appId);
      if (result.success) {
        // Animate removal
        setRemovingIds(prev => [...prev, appId]);
        // Allow animation to play before removing from list
        setTimeout(() => {
          setGlobalApps(prev => prev.filter(app => app.id !== appId));
        }, 500);
      } else {
        if (result.limit_reached) {
             setShowLimitModal(true);
             return;
        }
        alert(result.error || 'Failed to add app');
      }
    } catch (err) {
      console.error('Failed to add global app', err);
      alert('Failed to add app');
    } finally {
      setAddingGlobal(null);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setLogoFile(file);
    
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setLogoPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('company', company);
      formData.append('product_link', productLink);
      formData.append('privacy_link', privacyLink);
      formData.append('status', status);
      if (logoFile) formData.append('logo', logoFile);
      if (ndpaFile) formData.append('ndpa', ndpaFile);
      if (exhibitEFile) formData.append('exhibit_e', exhibitEFile);

      if (exhibitEFile) formData.append('exhibit_e', exhibitEFile);
 
      const result = await addDistrictApp(districtSlug, formData);
      if (result.error) {
          if (result.limit_reached) {
              setShowLimitModal(true);
              return;
          }
          alert(result.error);
          return;
      }
      navigate(`/apps`);
    } catch (err) {
      console.error("Failed to add app", err);
      alert('Failed to add app. See console.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthorized) {
    return <div className="text-center py-12">Checking permissions...</div>;
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Add App to Directory</h1>
        <p className="text-muted-foreground">
          Choose from popular apps or add a custom one for {districtSlug}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-4">
        <Button
          variant={activeTab === 'global' ? 'default' : 'outline'}
          onClick={() => setActiveTab('global')}
        >
          📱 Popular Apps
        </Button>
        <Button
          variant={activeTab === 'custom' ? 'default' : 'outline'}
          onClick={() => setActiveTab('custom')}
        >
          ✏️ Custom App
        </Button>
      </div>

      {/* Global Apps Tab */}
      {activeTab === 'global' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Quick-add popular educational apps. You can customize the privacy documents after adding.
          </p>
          
          {globalApps.length > 0 ? (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {globalApps.map(app => (
                <div 
                  key={app.id} 
                  className={`p-4 border rounded-xl bg-card shadow-sm hover:shadow-md transition-all duration-500 ${
                    removingIds.includes(app.id) ? 'opacity-0 scale-90 translate-y-4' : 'opacity-100 scale-100'
                  }`}
                >
                  <div className="flex gap-3 items-start">
                    {app.logo_path ? (
                      <img src={`${BASE_URL}/${app.logo_path}`} alt={app.name} className="w-12 h-12 rounded-lg object-cover border" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border">
                        <span className="font-bold text-primary/70">{app.name.charAt(0)}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold truncate">{app.name}</h4>
                      {app.company && <p className="text-sm text-muted-foreground truncate">{app.company}</p>}
                    </div>
                  </div>
                  <Button 
                    className="w-full mt-3" 
                    size="sm"
                    disabled={addingGlobal === app.id}
                    onClick={() => handleAddGlobalApp(app.id)}
                  >
                    {addingGlobal === app.id ? 'Adding...' : '+ Add to District'}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground border rounded-xl bg-muted/20">
              <p className="text-4xl mb-2">📱</p>
              <p>No global app templates available yet.</p>
              <p className="text-sm mt-1">Use the "Custom App" tab to add apps manually.</p>
            </div>
          )}
        </div>
      )}

      {/* Custom App Tab */}
      {activeTab === 'custom' && (
        <form onSubmit={handleSubmit} className="space-y-6 bg-card p-8 border rounded-2xl shadow-sm">
          {/* Logo upload */}
          <div className="space-y-3">
            <Label>App Logo</Label>
            <div className="flex items-center gap-6">
              <div className="relative">
                {logoPreview ? (
                  <img 
                    src={logoPreview} 
                    alt="Logo preview" 
                    className="w-20 h-20 rounded-xl object-cover border shadow-sm"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border">
                    <span className="text-2xl font-bold text-primary/50">
                      {name ? name.charAt(0).toUpperCase() : '?'}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Input 
                  id="logo" 
                  type="file" 
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  Recommended: Square image, at least 128x128px
                </p>
              </div>
            </div>
          </div>

          {/* App name */}
          <div className="space-y-2">
            <Label htmlFor="name">App Name *</Label>
            <Input 
              id="name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
              placeholder="e.g. Khan Academy"
              className="text-lg"
            />
          </div>

          {/* Company */}
          <div className="space-y-2">
            <Label htmlFor="company">Company / Vendor</Label>
            <Input 
              id="company" 
              value={company} 
              onChange={e => setCompany(e.target.value)} 
              placeholder="e.g. Khan Academy Inc."
            />
          </div>

          {/* URLs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="website">Product Website</Label>
              <Input 
                id="website" 
                value={productLink} 
                onChange={e => setProductLink(e.target.value)} 
                placeholder="https://..."
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="privacy">Privacy Policy URL</Label>
              <Input 
                id="privacy" 
                value={privacyLink} 
                onChange={e => setPrivacyLink(e.target.value)} 
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Initial Status</Label>
            <select 
              id="status"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="Pending">Pending Review</option>
              <option value="Approved for Use">Approved for Use</option>
              <option value="Core Tool">Core Tool</option>
              <option value="Supplemental Tool">Supplemental Tool</option>
              <option value="Not Supported by District">Not Supported by District</option>
              <option value="Reviewed & Denied">Reviewed & Denied</option>
            </select>
          </div>

          {/* Document uploads */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-medium">Compliance Documents</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ndpa">NDPA Document</Label>
                <Input 
                  id="ndpa" 
                  type="file" 
                  accept=".pdf,.doc,.docx"
                  onChange={e => setNdpaFile(e.target.files?.[0] || null)} 
                />
                <p className="text-xs text-muted-foreground">PDF or Word document</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exhibit_e">Exhibit E</Label>
                <Input 
                  id="exhibit_e" 
                  type="file" 
                  accept=".pdf,.doc,.docx"
                  onChange={e => setExhibitEFile(e.target.files?.[0] || null)} 
                />
                <p className="text-xs text-muted-foreground">PDF or Word document</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Adding App...' : 'Add App'}
            </Button>
          </div>
        </form>
      )}
      {showLimitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-background rounded-xl shadow-2xl max-w-md w-full p-6 border text-center space-y-6 animate-in zoom-in-95 duration-200">
               <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">🚫</span>
               </div>
               <div className="space-y-2">
                   <h3 className="text-xl font-bold">App Limit Reached</h3>
                   <p className="text-muted-foreground">
                      You have reached the 25-app limit for the Starter plan. 
                      Please upgrade to the Professional plan to add unlimited apps.
                   </p>
               </div>
               <div className="flex flex-col gap-3">
                   <Button asChild size="lg" className="w-full">
                       <Link to="/pricing">View Pricing Plans</Link>
                   </Button>
                   <Button variant="ghost" onClick={() => setShowLimitModal(false)}>
                       Cancel
                   </Button>
               </div>
            </div>
          </div>
      )}
    </div>
  );
}
