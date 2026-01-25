import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { issuesApi, agentsApi } from '@/lib/api'
import DiffViewer from '@/components/DiffViewer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDate, getSeverityColor, getStatusColor } from '@/lib/utils'
import {
  ArrowLeft,
  AlertTriangle,
  DollarSign,
  Users,
  TrendingDown,
  Loader2,
  GitPullRequest,
  Wand2,
  ExternalLink,
  CheckCircle,
} from 'lucide-react'

interface IssueMetrics {
  monthly_spending?: number
  potential_monthly_savings?: number
  cost_per_user?: number
  benchmark_cost_per_user?: number
  efficiency_ratio?: number
}

interface Issue {
  id: string
  title: string
  description?: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: string
  metrics?: IssueMetrics
  file_path?: string
  repo_full_name?: string
  agent_type: string
  issue_type: string
  created_at: string
  updated_at: string
}

interface Fix {
  id: string
  original_code: string
  fixed_code: string
  diff: string
  confidence_score: number
  explanation: string
  created_at: string
}

interface PullRequest {
  id: string
  pr_number: number
  pr_url: string
  status: string
}

export default function IssueDetail() {
  const { issueId } = useParams<{ issueId: string }>()
  const navigate = useNavigate()

  const [issue, setIssue] = useState<Issue | null>(null)
  const [fix, setFix] = useState<Fix | null>(null)
  const [pullRequest, setPullRequest] = useState<PullRequest | null>(null)

  const [isLoadingIssue, setIsLoadingIssue] = useState(true)
  const [isGeneratingFix, setIsGeneratingFix] = useState(false)
  const [isCreatingPR, setIsCreatingPR] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (issueId) {
      loadIssue()
      loadFix()
    }
  }, [issueId])

  const loadIssue = async () => {
    setIsLoadingIssue(true)
    try {
      const response = await issuesApi.get(issueId!)
      setIssue(response.issue)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issue')
    } finally {
      setIsLoadingIssue(false)
    }
  }

  const loadFix = async () => {
    try {
      const response = await issuesApi.getFix(issueId!)
      if (response.fix) {
        setFix(response.fix)
        if (response.pull_request) {
          setPullRequest(response.pull_request)
        }
      }
    } catch (err) {
      // Fix might not exist yet, that's okay
      console.log('No fix found for this issue')
    }
  }

  const handleGenerateFix = async () => {
    setIsGeneratingFix(true)
    setError(null)
    try {
      const response = await agentsApi.generateFix(issueId!)
      setFix(response.fix)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate fix')
    } finally {
      setIsGeneratingFix(false)
    }
  }

  const handleCreatePR = async () => {
    setIsCreatingPR(true)
    setError(null)
    try {
      const response = await issuesApi.createPR(issueId!)
      setPullRequest(response.pull_request)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pull request')
    } finally {
      setIsCreatingPR(false)
    }
  }

  if (isLoadingIssue) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!issue) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">Issue not found</h3>
            <p className="text-gray-500 mb-4">The issue you're looking for doesn't exist.</p>
            <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Link */}
      <Link
        to="/"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Dashboard
      </Link>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-700 hover:text-red-900">
            &times;
          </button>
        </div>
      )}

      {/* Issue Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge className={getSeverityColor(issue.severity)}>
              {issue.severity.toUpperCase()}
            </Badge>
            <Badge className={getStatusColor(issue.status)}>
              {issue.status.replace('_', ' ').toUpperCase()}
            </Badge>
            {issue.agent_type && (
              <Badge variant="outline">{issue.agent_type}</Badge>
            )}
          </div>
          <CardTitle className="text-2xl">{issue.title}</CardTitle>
          {issue.description && (
            <CardDescription className="text-base mt-2">{issue.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            {issue.repo_full_name && (
              <span>Repository: {issue.repo_full_name}</span>
            )}
            {issue.file_path && (
              <span>File: {issue.file_path}</span>
            )}
            <span>Created: {formatDate(issue.created_at)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Section */}
      {issue.metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {issue.metrics.monthly_spending !== undefined && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <DollarSign className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Monthly Spending</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatCurrency(issue.metrics.monthly_spending)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {issue.metrics.potential_monthly_savings !== undefined && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <TrendingDown className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Potential Savings</p>
                    <p className="text-xl font-bold text-green-600">
                      {formatCurrency(issue.metrics.potential_monthly_savings)}/mo
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {issue.metrics.cost_per_user !== undefined && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Users className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Cost Per User</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatCurrency(issue.metrics.cost_per_user)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {issue.metrics.benchmark_cost_per_user !== undefined && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Industry Benchmark</p>
                    <p className="text-xl font-bold text-blue-600">
                      {formatCurrency(issue.metrics.benchmark_cost_per_user)}/user
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Fix Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5" />
                AI-Generated Fix
              </CardTitle>
              <CardDescription>
                {fix
                  ? 'Review the suggested code changes below'
                  : 'Generate an AI-powered fix for this issue'}
              </CardDescription>
            </div>
            {!fix && (
              <Button onClick={handleGenerateFix} disabled={isGeneratingFix}>
                {isGeneratingFix ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generate Fix
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {fix ? (
            <div className="space-y-4">
              {/* Fix Explanation */}
              {fix.explanation && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Explanation</h4>
                  <p className="text-sm text-blue-800">{fix.explanation}</p>
                </div>
              )}

              {/* Confidence Score */}
              {fix.confidence_score !== undefined && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Confidence:</span>
                  <div className="flex items-center gap-1">
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${fix.confidence_score * 100}%` }}
                      />
                    </div>
                    <span className="font-medium">
                      {Math.round(fix.confidence_score * 100)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Diff Viewer */}
              <DiffViewer
                originalCode={fix.original_code}
                fixedCode={fix.fixed_code}
                diff={fix.diff}
              />
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Wand2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>Click "Generate Fix" to have AI analyze and suggest code improvements.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pull Request Section */}
      {fix && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GitPullRequest className="h-5 w-5" />
                  Pull Request
                </CardTitle>
                <CardDescription>
                  {pullRequest
                    ? 'A pull request has been created for this fix'
                    : 'Create a GitHub pull request with this fix'}
                </CardDescription>
              </div>
              {!pullRequest && (
                <Button onClick={handleCreatePR} disabled={isCreatingPR}>
                  {isCreatingPR ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating PR...
                    </>
                  ) : (
                    <>
                      <GitPullRequest className="h-4 w-4 mr-2" />
                      Create PR
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {pullRequest ? (
              <div className="flex items-center justify-between p-4 bg-green-50 border border-green-100 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">
                      Pull Request #{pullRequest.pr_number}
                    </p>
                    <p className="text-sm text-green-700">Status: {pullRequest.status}</p>
                  </div>
                </div>
                <a
                  href={pullRequest.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-green-700 hover:text-green-800 font-medium"
                >
                  View on GitHub
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <GitPullRequest className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>
                  Click "Create PR" to open a pull request with the suggested fix on GitHub.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
