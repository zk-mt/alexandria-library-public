/**
 * API client for communicating with the Flask backend.
 * Adjust the BASE_URL for your environment (localhost for dev, your domain for prod).
 */

// Keep API host aligned with the page host to preserve same-site session cookies.
const BASE_URL = (() => {
  const envHost = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envHost) return envHost;
  // Use relative path by default to leverage Vite proxy in dev and same-domain in prod
  return '';
})();

const jsonHeaders = { 'Content-Type': 'application/json' } as const;

// Simple in-memory CSRF token cache for SPA calls
let csrfToken: string | null = null;

function cacheCsrfToken(token?: string) {
  if (token) csrfToken = token;
}

async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  try {
    const me = await getCurrentUser();
    cacheCsrfToken(me?.csrf_token);
    return csrfToken;
  } catch {
    return null;
  }
}

export async function registerAccount(data: {
  username: string;
  name: string;
  password: string;
}) {
  const response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function loginAccount(data: {
  username: string;
  password: string;
}) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function logoutAccount() {
  const response = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  return response.json();
}

export async function getCurrentUser() {
  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    credentials: 'include',
  });
  const data = await response.json();
  cacheCsrfToken(data?.csrf_token);
  return data;
}

export async function createDistrict(data: {
  name: string;
  slug: string;
  contact_email: string;
  creator_name?: string;
}) {
  const response = await fetch(`${BASE_URL}/api/districts`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });

  return response.json();
}

export async function getDistrict(slug: string) {
  const response = await fetch(`${BASE_URL}/api/districts/${slug}`, {
    credentials: 'include',
  });
  return response.json();
}

export type DistrictBranding = {
  primary_color: string;
  accent_color?: string;
  logo_path?: string;
  name?: string;
  slug?: string;
};

export async function getDistrictBranding(
  slug: string
): Promise<DistrictBranding> {
  try {
    const district = await getDistrict(slug);
    return {
      primary_color: district.primary_color || '#0f172a',
      accent_color: district.accent_color,
      logo_path: district.logo_url || '/alexandria-logo.png',
      name: district.name || 'Alexandria Library',
      slug: district.slug,
    };
  } catch {
    return {
      primary_color: '#0f172a',
      logo_path: '/alexandria-logo.png',
      name: 'Alexandria Library',
      slug: slug,
    };
  }
}

export async function getUserDistrictRole(
  slug: string
): Promise<{ role: 'admin' | 'staff' }> {
  // We get the role from the session ('me' endpoint)
  // In a multi-tenant app, we'd query /api/districts/:slug/me
  // But for this single-tenant setup, auth/me is sufficient
  const me = await getCurrentUser();
  if (me.authenticated && me.user?.role) {
    return { role: me.user.role };
  }
  return { role: 'staff' };
}

export async function getDistrictStats(slug: string) {
  // Placeholder: Return default stats
  // Ideally this hits /api/districts/:slug/stats
  const response = await fetch(`${BASE_URL}/api/districts/${slug}/stats`, {
    credentials: 'include',
  });
  if (response.ok) return response.json();

  // Mock fall back if endpoint doesn't exist yet
  return {
    district_name: slug,
    total_apps: 0,
    status_counts: { Approved: 0, Pending: 0 },
    apps_with_ndpa: 0,
    staff_count: 1,
    recent_apps: [],
    recent_activity: [],
  };
}

export interface AppRequestData {
  [key: string]: any;
}

export async function createAppRequest(
  districtSlug: string,
  data: AppRequestData
) {
  const response = await fetch(`${BASE_URL}/api/requests`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
    body: JSON.stringify({ ...data, district_slug: districtSlug }),
  });

  if (response.status === 401) {
    throw new Error('Please sign in to submit a request.');
  }

  return response.json();
}

export async function getDistrictApps(slug: string) {
  const response = await fetch(`${BASE_URL}/api/districts/${slug}/apps`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Unable to load apps');
  }
  return response.json();
}

export async function getAppContacts(_slug: string, appId: number) {
  const response = await fetch(`${BASE_URL}/api/admin/apps/${appId}/contacts`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Unable to load contacts');
  }
  const data = await response.json();
  if (Array.isArray(data)) return data; // defensive for legacy shapes
  return data.contacts || [];
}

export async function addAppContact(
  _slug: string,
  appId: number,
  data: any
) {
  const token = await ensureCsrfToken();
  const response = await fetch(`${BASE_URL}/api/admin/apps/${appId}/contacts`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
    body: JSON.stringify({ ...data, csrf_token: token }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Unable to add contact');
  }

  return response.json();
}

export async function updateDistrictApp(
  slug: string,
  appId: number,
  data: any
) {
  const response = await fetch(
    `${BASE_URL}/api/districts/${slug}/apps/${appId}`,
    {
      method: 'PUT',
      credentials: 'include',
      body: data,
    }
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error('Admin privileges required to update apps.');
  }

  return response.json();
}

export async function deleteDistrictAppContact(
  districtSlug: string,
  appId: number,
  contactId: number
) {
  const token = await ensureCsrfToken();
  const response = await fetch(`${BASE_URL}/api/admin/contacts/${contactId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: jsonHeaders,
    body: JSON.stringify({ csrf_token: token, app_id: appId, district_slug: districtSlug }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Unable to delete contact');
  }

  return response.json();
}

// Google Auth (Server Side now preferred, but keeping/mocking if needed)
export async function getAuthConfig() {
  const response = await fetch(`${BASE_URL}/api/auth/config`);
  return response.json();
}

export async function googleAuth(credential: string, slug: string) {
  // Deprecated in favor of server-side flow
  return { error: "Please use the 'Sign in with Google' button." };
}

export async function getDistrictUsers(slug: string) {
  const response = await fetch(`${BASE_URL}/api/districts/${slug}/users`, {
    credentials: 'include',
  });

  if (response.status === 401) {
    throw new Error('Please sign in to view staff.');
  }

  return response.json();
}

export async function addDistrictUser(slug: string, data: any) {
  const response = await fetch(`${BASE_URL}/api/districts/${slug}/users`, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Admin privileges required to add staff.');
  }

  return response.json();
}

export async function deleteDistrictApp(slug: string, appId: number) {
  const response = await fetch(
    `${BASE_URL}/api/districts/${slug}/apps/${appId}`,
    {
      method: 'DELETE',
      credentials: 'include',
    }
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error('Admin privileges required to delete apps.');
  }

  return response.json();
}

export async function getDistrictActivity(slug: string) {
  return { activity: [] };
}

export async function addDistrictApp(slug: string, data: any) {
  const isForm = typeof FormData !== 'undefined' && data instanceof FormData;
  const response = await fetch(`${BASE_URL}/api/districts/${slug}/apps`, {
    method: 'POST',
    credentials: 'include',
    headers: isForm ? undefined : jsonHeaders,
    body: isForm ? data : JSON.stringify(data),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Admin privileges required to create apps.');
  }

  return response.json();
}

export async function getAvailableGlobalApps(query: string) {
  return { apps: [] };
}

export async function addGlobalAppToDistrict(slug: string, appId: number) {
  return { success: true };
}

export type DistrictSettings = any;

export async function getDistrictSettings(slug: string) {
  try {
    const response = await fetch(`${BASE_URL}/api/districts/${slug}`, {
      credentials: 'include',
    });
    const district = await response.json();
    return {
      primary_color: district.primary_color,
      accent_color: district.accent_color,
      logo_path: district.logo_url,
      display_name: district.name,
      allowed_domain: district.allowed_domain,
      soppa_statuses: [], // TODO: Persist these in DB if needed later
      app_statuses: [],
      app_tags: [],
      custom_fields: {},
      google_client_id: district.google_client_id,
      google_client_secret: district.google_client_secret,
      apple_client_id: district.apple_client_id,
      apple_team_id: district.apple_team_id,
      apple_key_id: district.apple_key_id,
      apple_private_key: district.apple_private_key,
      microsoft_client_id: district.microsoft_client_id,
      microsoft_tenant_id: district.microsoft_tenant_id,
      microsoft_client_secret: district.microsoft_client_secret,
    };
  } catch {
    return { settings: {} };
  }
}

export async function updateDistrictSettings(slug: string, data: any) {
  const response = await fetch(`${BASE_URL}/api/districts/${slug}`, {
    method: 'PUT',
    credentials: 'include',
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function uploadDistrictLogo(slug: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${BASE_URL}/api/districts/${slug}/logo`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  return response.json();
}

export async function getAppRequests(slug: string) {
  return { requests: [] };
}

export async function updateAppRequestStatus(
  slug: string,
  requestId: number,
  status: string
) {
  return { success: true };
}
