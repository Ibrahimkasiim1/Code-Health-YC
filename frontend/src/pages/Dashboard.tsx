import { useState, useEffect } from 'react'
import { authApi, repoApi, issuesApi, agentsApi } from '@/lib/api'
import IssueCard from '@/components/IssueCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Github,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  FolderGit2,
  AlertTriangle,
  Zap,
} from 'lucide-react'

interface GitHubStatus {
  connected: boolean
  installation_id?: number
}

interface Repository {
  id: string
  full_name: string
  name: string
  owner: string
  default_branch: string
  private: boolean
}

interface ConnectedRepository {
  id: string
  repo_full_name: string
  default_branch: string
  created_at: string
}

interface Issue {
  id: string
  title: string
  description?: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: string
  metrics?: {
    monthly_spending?: number
    potential_monthly_savings?: number
    cost_per_user?: number
    benchmark_cost_per_user?: number
  }
  file_path?: string
  repo_full_name?: string
  created_at: string
}

export default function Dashboard() {
  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null)
  const [availableRepos, setAvailableRepos] = useState<Repository[]>([])
  const [connectedRepos, setConnectedRepos] = useState<ConnectedRepository[]>([])
  const [selectedRepoId, setSelectedRepoId] = useState<string>('')
  const [issues, setIssues] = useState<Issue[]>([])
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load GitHub status on mount
  useEffect(() => {
    loadGitHubStatus()
    loadIssues()
  }, [])

  // Load repos when GitHub is connected
  useEffect(() => {
    if (githubStatus?.connected) {
      loadRepositories()
    }
  }, [githubStatus?.connected])

  const loadGitHubStatus = async () => {
    setIsLoadingStatus(true)
    try {
      const status = await authApi.getGitHubStatus()
      setGithubStatus(status)
    } catch (err) {
      console.error('Failed to load GitHub status:', err)
      setGithubStatus({ connected: false })
    } finally {
      setIsLoadingStatus(false)
    }
  }

  const loadRepositories = async () => {
    setIsLoadingRepos(true)
    try {
      const [available, connected] = await Promise.all([
        repoApi.getAvailable(),
        repoApi.getConnected(),
      ])
      setAvailableRepos(available.repositories || [])
      setConnectedRepos(connected.repositories || [])

      // Auto-select first connected repo if available
      if (connected.repositories?.length > 0 && !selectedRepoId) {
        setSelectedRepoId(connected.repositories[0].id)
      }
    } catch (err) {
      console.error('Failed to load repositories:', err)
    } finally {
      setIsLoadingRepos(false)
    }
  }

  const loadIssues = async () => {
    try {
      const response = await issuesApi.list()
      setIssues(response.issues || [])
    } catch (err) {
      console.error('Failed to load issues:', err)
    }
  }

  const handleConnectGitHub = async () => {
    try {
      const response = await authApi.getGitHubAuthUrl()
      window.location.href = response.authorization_url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate GitHub connection')
    }
  }

  const handleConnectRepo = async (repoFullName: string) => {
    setIsConnecting(true)
    setError(null)
    try {
      await repoApi.connect(repoFullName)
      await loadRepositories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect repository')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleRunAnalysis = async () => {
    if (!selectedRepoId) {
      setError('Please select a repository first')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    try {
      await agentsApi.analyze(selectedRepoId)
      await loadIssues()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const openIssues = issues.filter((i) => i.status === 'open')
  const criticalIssues = issues.filter((i) => i.severity === 'critical' || i.severity === 'high')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Monitor and optimize your code health</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-700 hover:text-red-900">
            &times;
          </button>
        </div>
      )}

      {/* GitHub Connection Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            GitHub Connection
          </CardTitle>
          <CardDescription>Connect your GitHub account to analyze repositories</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingStatus ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking connection status...
            </div>
          ) : githubStatus?.connected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span>GitHub connected</span>
              </div>
              <Button variant="outline" size="sm" onClick={loadRepositories} disabled={isLoadingRepos}>
                {isLoadingRepos ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Refresh</span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-500">
                <XCircle className="h-5 w-5" />
                <span>Not connected</span>
              </div>
              <Button onClick={handleConnectGitHub}>
                <Github className="h-4 w-4 mr-2" />
                Connect GitHub
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repository Section */}
      {githubStatus?.connected && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderGit2 className="h-5 w-5" />
              Repositories
            </CardTitle>
            <CardDescription>Select a repository to analyze</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingRepos ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading repositories...
              </div>
            ) : (
              <div className="space-y-4">
                {/* Connected Repositories */}
                {connectedRepos.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Connected Repositories
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {connectedRepos.map((repo) => (
                        <button
                          key={repo.id}
                          onClick={() => setSelectedRepoId(repo.id)}
                          className={`px-3 py-2 rounded-md border text-sm transition-colors ${
                            selectedRepoId === repo.id
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {repo.repo_full_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available Repositories to Connect */}
                {availableRepos.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Available to Connect
                    </label>
                    <select
                      className="w-full max-w-md border rounded-md px-3 py-2 text-sm"
                      onChange={(e) => e.target.value && handleConnectRepo(e.target.value)}
                      disabled={isConnecting}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select a repository to connect...
                      </option>
                      {availableRepos
                        .filter((r) => !connectedRepos.some((c) => c.repo_full_name === r.full_name))
                        .map((repo) => (
                          <option key={repo.full_name} value={repo.full_name}>
                            {repo.full_name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Run Analysis Button */}
                <div className="pt-4">
                  <Button
                    onClick={handleRunAnalysis}
                    disabled={!selectedRepoId || isAnalyzing}
                    className="w-full sm:w-auto"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Run Analysis
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Issues Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Issues</p>
                <p className="text-3xl font-bold text-gray-900">{issues.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Open Issues</p>
                <p className="text-3xl font-bold text-blue-600">{openIssues.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Critical/High</p>
                <p className="text-3xl font-bold text-red-600">{criticalIssues.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Issues Grid */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Issues</h2>
        {issues.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No issues found</h3>
              <p className="text-gray-500">
                Connect a repository and run an analysis to discover cost optimization opportunities.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
