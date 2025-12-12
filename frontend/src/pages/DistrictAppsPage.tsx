import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getCurrentUser,
  getDistrictApps,
  getDistrictStats,
  deleteDistrictApp,
  updateDistrictApp,
  getAppContacts,
  addAppContact,
  deleteDistrictAppContact,
  addDistrictApp,
} from '@/lib/api';
import {
  Search,
  Plus,
  Filter,
  Loader2,
  Pencil,
  Trash2,
  Globe,
  Lock,
  Shield,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Phone,
  Mail,
  Users,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import RequestAppModal from '@/components/RequestAppModal';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface AppData {
  id: number;
  name: string;
  category?: string;
  status: string;
  privacy_link: string;
  product_link: string;
  soppa_compliant: string;
  ndpa_path?: string;
  exhibit_e_path?: string;
  notes?: string;
  company?: string;
  logo_path?: string;
}

function AppContacts({
  districtSlug,
  appId,
  isAdmin,
}: {
  districtSlug: string;
  appId: number;
  isAdmin: boolean;
}) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'Support',
  });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>('');

  // Prefetch contact count so the button shows an accurate number before expand
  useEffect(() => {
    if (!isAdmin) return;
    getAppContacts(districtSlug, appId)
      .then((data) => {
        if (Array.isArray(data)) setContacts(data);
      })
      .catch(console.error);
  }, [districtSlug, appId, isAdmin]);

  useEffect(() => {
    if (expanded && isAdmin) {
      setLoading(true);
      getAppContacts(districtSlug, appId)
        .then((data) => {
          if (Array.isArray(data)) setContacts(data);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [expanded, districtSlug, appId, isAdmin]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!newContact.name || !newContact.email) return;
    setAdding(true);
    try {
      await addAppContact(districtSlug, appId, newContact);
      const updated = await getAppContacts(districtSlug, appId);
      if (Array.isArray(updated)) setContacts(updated);
      setNewContact({ name: '', email: '', phone: '', role: 'Support' });
      setShowForm(false);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to add contact';
      setError(message);
      alert(message);
    } finally {
      setAdding(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="mt-3 pt-3 border-t bg-muted/40 rounded-b-lg px-4 pb-3">
        <p className="text-xs text-muted-foreground">Admin-only section.</p>
      </div>
    );
  }

  if (!expanded) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="w-full text-xs text-muted-foreground hover:text-primary h-8"
        onClick={() => setExpanded(true)}
      >
        <Users className="w-3 h-3 mr-2" />
        View Contacts ({contacts.length > 0 ? contacts.length : '0'})
      </Button>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t bg-muted/40 rounded-b-lg px-4 pb-3 w-full">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Vendor Contacts
        </h4>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[11px] px-2"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : 'Add New'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(false)}
          >
            ✕
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground italic">Loading...</p>
      ) : (
        <div className="space-y-2">
          {error && (
            <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              {error}
            </p>
          )}
          {contacts.map((c) => (
            <div
              key={c.id}
              className="text-xs p-2 rounded bg-background border shadow-sm"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  {c.is_primary && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                      Primary
                    </span>
                  )}
                </div>
                <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[10px]">
                  {c.role || 'Contact'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1 mt-1 text-muted-foreground">
                {c.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3" />
                    <span>{c.email}</span>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3" />
                    <span>{c.phone}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {contacts.length === 0 && !showForm && (
            <p className="text-xs text-center text-muted-foreground py-2">
              No contacts listed.
            </p>
          )}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="mt-2 p-3 rounded border bg-background space-y-2 animate-in fade-in slide-in-from-top-2"
        >
          <Input
            className="h-7 text-xs"
            placeholder="Name"
            value={newContact.name}
            onChange={(e) =>
              setNewContact({ ...newContact, name: e.target.value })
            }
            required
          />
          <Input
            className="h-7 text-xs"
            placeholder="Email"
            value={newContact.email}
            onChange={(e) =>
              setNewContact({ ...newContact, email: e.target.value })
            }
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              className="h-7 text-xs"
              placeholder="Phone"
              value={newContact.phone}
              onChange={(e) =>
                setNewContact({ ...newContact, phone: e.target.value })
              }
            />
            <select
              className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={newContact.role}
              onChange={(e) =>
                setNewContact({ ...newContact, role: e.target.value })
              }
            >
              <option value="Support">Support</option>
              <option value="Sales">Sales</option>
              <option value="Technical">Technical</option>
              <option value="Account Manager">Acct Mgr</option>
            </select>
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={adding}
            className="w-full h-8 text-xs"
          >
            {adding ? 'Saving...' : 'Save Contact'}
          </Button>
        </form>
      )}
    </div>
  );
}

function EditAppModal({ app, districtSlug, onClose, onSave }: any) {
  const [formData, setFormData] = useState({
    name: app.name || '',
    status: app.status || 'Pending',
    privacy_link: app.privacy_link || '',
    product_link: app.product_link || '',
    soppa_compliant: app.soppa_compliant || 'Unknown',
    notes: app.notes || '',
    company: app.company || '',
  });
  const [ndpaFile, setNdpaFile] = useState<File | null>(null);
  const [exhibitEFile, setExhibitEFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const submitData = new FormData();
      submitData.append('name', formData.name);
      submitData.append('status', formData.status);
      submitData.append('privacy_link', formData.privacy_link);
      submitData.append('product_link', formData.product_link);
      submitData.append('soppa_compliant', formData.soppa_compliant);
      submitData.append('notes', formData.notes);
      submitData.append('company', formData.company);
      if (ndpaFile) submitData.append('ndpa', ndpaFile);
      if (exhibitEFile) submitData.append('exhibit_e', exhibitEFile);

      const result = await updateDistrictApp(districtSlug, app.id, submitData);
      if (result.success) {
        onSave();
        onClose();
      } else {
        alert(result.error || 'Failed to update app');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b pb-3">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Edit App Details</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
            >
              ✕
            </Button>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">App Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <select
                  className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                >
                  <option value="Pending">Pending</option>
                  <option value="Approved for Use">Approved</option>
                  <option value="Core Tool">Core Tool</option>
                  <option value="Supplemental Tool">Supplemental</option>
                  <option value="Not Supported by District">
                    Not Supported
                  </option>
                  <option value="Reviewed & Denied">Denied</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Company</Label>
                <Input
                  value={formData.company}
                  onChange={(e) =>
                    setFormData({ ...formData, company: e.target.value })
                  }
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SOPPA Compliance</Label>
                <select
                  className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={formData.soppa_compliant}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      soppa_compliant: e.target.value,
                    })
                  }
                >
                  <option value="Unknown">Unknown</option>
                  <option value="Compliant">Compliant</option>
                  <option value="Staff use only">Staff use only</option>
                  <option value="Not applicable">Not applicable</option>
                  <option value="Noncompliant">Noncompliant</option>
                  <option value="Parent consent required">
                    Parent consent required
                  </option>
                </select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Links</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Privacy Policy URL"
                    value={formData.privacy_link}
                    onChange={(e) =>
                      setFormData({ ...formData, privacy_link: e.target.value })
                    }
                    className="h-9 text-xs"
                  />
                  <Input
                    placeholder="Product Website URL"
                    value={formData.product_link}
                    onChange={(e) =>
                      setFormData({ ...formData, product_link: e.target.value })
                    }
                    className="h-9 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5 col-span-2 border-t pt-2">
                <Label className="text-xs font-semibold">
                  Compliance Documents
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      NDPA
                    </Label>
                    <Input
                      type="file"
                      className="h-8 text-xs file:mr-2 file:h-full file:border-0"
                      onChange={(e) => setNdpaFile(e.target.files?.[0] || null)}
                    />
                    {app.ndpa_path && (
                      <p className="text-[10px] text-green-600">
                        Current: Uploaded
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Exhibit E
                    </Label>
                    <Input
                      type="file"
                      className="h-8 text-xs file:mr-2 file:h-full file:border-0"
                      onChange={(e) =>
                        setExhibitEFile(e.target.files?.[0] || null)
                      }
                    />
                    {app.exhibit_e_path && (
                      <p className="text-[10px] text-green-600">
                        Current: Uploaded
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <CardFooter className="flex justify-end gap-2 border-t bg-muted/40 p-4">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'Approved for Use':
    case 'Core Tool':
      return (
        <div className="flex items-center gap-1.5 text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-medium">
            {status === 'Approved for Use' ? 'Approved' : status}
          </span>
        </div>
      );
    case 'Supplemental Tool':
      return (
        <div className="flex items-center gap-1.5 text-blue-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-medium">{status}</span>
        </div>
      );
    case 'Pending':
      return (
        <div className="flex items-center gap-1.5 text-amber-700">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-medium">{status}</span>
        </div>
      );
    case 'Reviewed & Denied':
    case 'Not Supported by District':
      return (
        <div className="flex items-center gap-1.5 text-red-700">
          <XCircle className="w-3.5 h-3.5" />
          <span className="font-medium">{status}</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="font-medium">{status}</span>
        </div>
      );
  }
}

function getInitials(name: string) {
  return name.substring(0, 2).toUpperCase();
}

export default function DistrictAppsPage() {
  const districtSlug = 'local';
  const [apps, setApps] = useState<AppData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [editingApp, setEditingApp] = useState<AppData | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Check auth
  useEffect(() => {
    getCurrentUser()
      .then((data) => {
        setIsAuthenticated(data.authenticated === true);
        setIsAdmin(data.user?.role === 'admin');
      })
      .catch(() => {
        setIsAuthenticated(false);
        setIsAdmin(false);
      });
  }, []);

  const loadApps = () => {
    getDistrictApps(districtSlug)
      .then((data) => {
        if (Array.isArray(data)) {
          setApps(data);
        } else if (data && Array.isArray((data as any).apps)) {
          setApps((data as any).apps);
        } else {
          setApps([]);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadApps();
  }, []);

  const handleDelete = async (appId: number, appName: string) => {
    if (!confirm(`Delete "${appName}"? This cannot be undone.`)) return;
    try {
      const result = await deleteDistrictApp(districtSlug, appId);
      if (result.success) loadApps();
    } catch (err) {
      console.error(err);
    }
  };

  const statuses = ['all', ...new Set(apps.map((app) => app.status))];

  const filteredApps = apps.filter((app) => {
    const matchesStatus = filterStatus === 'all' || app.status === filterStatus;
    const matchesSearch =
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.company &&
        app.company.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">App Directory</h1>
          <p className="text-muted-foreground">
            Manage and review approved educational software.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowRequestModal(true)}>
            Request App
          </Button>
          {isAdmin && (
            <Button
              asChild
              className="bg-primary hover:bg-primary/90 text-white shadow-sm"
            >
              <Link to={`/apps/add`}>
                <Plus className="w-4 h-4 mr-2" /> Add App
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-card p-4 rounded-xl border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search apps by name or company..."
            className="pl-9 w-full bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 no-scrollbar">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          {statuses.map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                filterStatus === status
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-input'
              }`}
            >
              {status === 'all'
                ? 'All'
                : status === 'Approved for Use'
                ? 'Approved'
                : status}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-xl border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredApps.map((app) => (
            <Card
              key={app.id}
              className="group overflow-hidden hover:shadow-md transition-shadow duration-300 flex flex-col h-full border-muted/60"
            >
              <CardHeader className="p-5 pb-3">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex gap-3">
                    {/* Logo */}
                    <div className="shrink-0">
                      {app.logo_path ? (
                        <img
                          src={`${BASE_URL}/${app.logo_path}`}
                          alt={app.name}
                          className="w-12 h-12 rounded-lg object-contain border bg-white"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold border border-primary/20">
                          {getInitials(app.name)}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <h3
                        className="font-semibold leading-none line-clamp-1"
                        title={app.name}
                      >
                        {app.name}
                      </h3>
                      {app.company && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {app.company}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Admin Action Menu (Simplified as icons for now) */}
                  {isAdmin && (
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditingApp(app)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(app.id, app.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-5 py-2 flex-grow space-y-4">
                {/* Compliance & Links Grid */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  {/* Left Column: Status & Links */}
                  <div className="space-y-4">
                    {getStatusBadge(app.status)}

                    <div className="space-y-2">
                      {app.product_link ? (
                        <a
                          href={app.product_link}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Globe className="w-3.5 h-3.5" /> Website
                        </a>
                      ) : (
                        <span className="flex items-center gap-2 text-muted-foreground/50">
                          <Globe className="w-3.5 h-3.5" /> Website
                        </span>
                      )}
                      {app.privacy_link ? (
                        <a
                          href={app.privacy_link}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Lock className="w-3.5 h-3.5" /> Privacy
                        </a>
                      ) : (
                        <span className="flex items-center gap-2 text-muted-foreground/50">
                          <Lock className="w-3.5 h-3.5" /> Privacy
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Column: SOPPA & Docs */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-3">
                      <Shield
                        className={`w-3.5 h-3.5 ${
                          app.soppa_compliant === 'Compliant'
                            ? 'text-emerald-500'
                            : 'text-muted-foreground'
                        }`}
                      />
                      <span
                        className={
                          app.soppa_compliant === 'Compliant'
                            ? 'text-emerald-700 font-medium'
                            : ''
                        }
                      >
                        SOPPA: {app.soppa_compliant || 'Unknown'}
                      </span>
                    </div>

                    {app.ndpa_path ? (
                      <a
                        href={`/${app.ndpa_path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-blue-600 hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" /> NDPA PDF
                      </a>
                    ) : (
                      <span className="flex items-center gap-2 text-muted-foreground/50">
                        <FileText className="w-3.5 h-3.5" /> NDPA
                      </span>
                    )}
                    {app.exhibit_e_path ? (
                      <a
                        href={`/${app.exhibit_e_path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-green-600 hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" /> Exhibit E
                      </a>
                    ) : (
                      <span className="flex items-center gap-2 text-muted-foreground/50">
                        <FileText className="w-3.5 h-3.5" /> Exhibit E
                      </span>
                    )}
                  </div>
                </div>
                {app.notes && (
                  <div className="text-xs text-muted-foreground italic bg-muted/20 p-2 rounded line-clamp-2">
                    "{app.notes}"
                  </div>
                )}
              </CardContent>

              <CardFooter className="p-0 pt-2 w-full">
                {isAuthenticated && isAdmin && (
                  <AppContacts
                    districtSlug={districtSlug}
                    appId={app.id}
                    isAdmin={isAdmin}
                  />
                )}
              </CardFooter>
            </Card>
          ))}

          {filteredApps.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <h3 className="text-lg font-medium">No apps found</h3>
              <p>Try adjusting your filters or search terms.</p>
            </div>
          )}
        </div>
      )}

      {editingApp && (
        <EditAppModal
          app={editingApp}
          districtSlug={districtSlug}
          onClose={() => setEditingApp(null)}
          onSave={loadApps}
        />
      )}

      {showRequestModal && (
        <RequestAppModal
          districtSlug={districtSlug}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </div>
  );
}
