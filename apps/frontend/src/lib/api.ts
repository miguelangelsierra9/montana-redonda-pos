function normalizeApiUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed === '/api' || trimmed.endsWith('/api')) {
    return trimmed;
  }
  return `${trimmed}/api`;
}

export function getCustomApiUrl(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('mrp_custom_api_url') || '';
}

export function setCustomApiUrl(url: string) {
  if (typeof window === 'undefined') return;
  const cleaned = url.trim();
  if (!cleaned) {
    localStorage.removeItem('mrp_custom_api_url');
  } else {
    localStorage.setItem('mrp_custom_api_url', normalizeApiUrl(cleaned));
  }
}

export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    // 1. URL personalizada guardada desde el navegador
    const savedUrl = localStorage.getItem('mrp_custom_api_url');
    if (savedUrl && savedUrl.trim()) {
      return normalizeApiUrl(savedUrl);
    }

    // 2. URL definida en public_html/config.js del Hosting Compartido (cPanel / Hostinger)
    const winConfig = (window as any).MRP_CONFIG;
    if (winConfig && typeof winConfig.API_URL === 'string' && winConfig.API_URL.trim()) {
      return normalizeApiUrl(winConfig.API_URL);
    }

    // 3. Variable de entorno en tiempo de compilación (si se definió)
    if (process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.trim()) {
      return normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL);
    }

    // 4. Si corre en localhost usar /api local; en dominio público usar el Backend de Render por defecto
    if (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    ) {
      return '/api';
    }
    return 'https://montana-redonda-backend-0jt9.onrender.com/api';
  }
  return process.env.NEXT_PUBLIC_API_URL || 'https://montana-redonda-backend-0jt9.onrender.com/api';
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('mrp_jwt_token');
}

export function setStoredAuth(token: string, user: any) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('mrp_jwt_token', token);
  localStorage.setItem('mrp_user', JSON.stringify(user));
}

export function clearStoredAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('mrp_jwt_token');
  localStorage.removeItem('mrp_user');
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.idempotencyKey) {
    headers['X-Idempotency-Key'] = options.idempotencyKey;
  }

  const res = await fetch(`${getApiBase()}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errBody: any = {};
    try {
      errBody = await res.json();
    } catch {
      errBody = { message: res.statusText };
    }
    const msg = Array.isArray(errBody.message) ? errBody.message.join(', ') : errBody.message || 'Error en la operación';
    throw new Error(msg);
  }

  return res.json();
}

export function formatDop(value: number | string): string {
  const num = Number(value || 0);
  return `RD$ ${num.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatUsd(value: number | string): string {
  const num = Number(value || 0);
  return `US$ ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getExcelExportUrl(reportKey: string, startDate?: string, endDate?: string): string {
  const params = new URLSearchParams({ reportKey });
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return `${getApiBase()}/reports/export-excel?${params.toString()}`;
}

