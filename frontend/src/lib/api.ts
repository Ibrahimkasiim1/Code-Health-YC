import { useAuthStore } from '../store/auth'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface FetchOptions extends RequestInit {
  skipAuth?: boolean
}

async function fetchWithAuth(endpoint: string, options: FetchOptions = {}) {
  const { skipAuth, ...fetchOptions } = options
  const token = useAuthStore.getState().token

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  }

  if (!skipAuth && token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  })

  if (response.status === 401) {
    useAuthStore.getState().logout()
    throw new Error('Unauthorized')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }))
    throw new Error(error.detail || 'An error occurred')
  }

  return response.json()
}

// Auth API
export const authApi = {
  signup: (email: string, password: string) =>
    fetchWithAuth('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    }),

  login: (email: string, password: string) =>
    fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    }),

  getMe: () => fetchWithAuth('/auth/me'),

  getGitHubAuthUrl: () => fetchWithAuth('/auth/github/authorize'),

  handleGitHubCallback: (code: string, state: string) =>
    fetchWithAuth('/auth/github/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state }),
    }),

  getGitHubStatus: () => fetchWithAuth('/auth/github/status'),
}

// Repository API
export const repoApi = {
  getAvailable: () => fetchWithAuth('/repositories/available'),

  getConnected: () => fetchWithAuth('/repositories/connected'),

  connect: (repoFullName: string, defaultBranch: string = 'main') =>
    fetchWithAuth('/repositories/connect', {
      method: 'POST',
      body: JSON.stringify({ repo_full_name: repoFullName, default_branch: defaultBranch }),
    }),

  disconnect: (repoId: string) =>
    fetchWithAuth(`/repositories/${repoId}`, {
      method: 'DELETE',
    }),
}

// Issues API
export const issuesApi = {
  list: (status?: string) => {
    const query = status ? `?status_filter=${status}` : ''
    return fetchWithAuth(`/issues/${query}`)
  },

  get: (issueId: string) => fetchWithAuth(`/issues/${issueId}`),

  getFix: (issueId: string) => fetchWithAuth(`/issues/${issueId}/fix`),

  createPR: (issueId: string) =>
    fetchWithAuth(`/issues/${issueId}/create-pr`, {
      method: 'POST',
    }),

  updateStatus: (issueId: string, status: string) =>
    fetchWithAuth(`/issues/${issueId}/status?new_status=${status}`, {
      method: 'PATCH',
    }),
}

// Agents API
export const agentsApi = {
  analyze: (repoId: string, totalUsers: number = 100, totalRequests: number = 10000) =>
    fetchWithAuth('/agents/analyze', {
      method: 'POST',
      body: JSON.stringify({
        repo_id: repoId,
        total_users: totalUsers,
        total_requests: totalRequests,
      }),
    }),

  generateFix: (issueId: string) =>
    fetchWithAuth('/agents/generate-fix', {
      method: 'POST',
      body: JSON.stringify({ issue_id: issueId }),
    }),
}

// Settings API
export const settingsApi = {
  getMcpConfig: () => fetchWithAuth('/settings/mcp-config'),

  saveMcpConfig: (config: { supabase_url: string; supabase_service_key: string; project_name?: string }) =>
    fetchWithAuth('/settings/mcp-config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  deleteMcpConfig: () =>
    fetchWithAuth('/settings/mcp-config', {
      method: 'DELETE',
    }),

  getMcpConnection: () => fetchWithAuth('/settings/mcp-connection'),
}
