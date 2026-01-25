import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle, DollarSign, FileCode, ArrowRight } from 'lucide-react'

interface IssueMetrics {
  monthly_spending?: number
  potential_monthly_savings?: number
  cost_per_user?: number
  benchmark_cost_per_user?: number
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
  created_at: string
}

interface IssueCardProps {
  issue: Issue
}

export default function IssueCard({ issue }: IssueCardProps) {
  const severityVariant = issue.severity as 'critical' | 'high' | 'medium' | 'low'

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={severityVariant}>
                {issue.severity.toUpperCase()}
              </Badge>
              <Badge variant="outline">{issue.status.replace('_', ' ')}</Badge>
            </div>
            <CardTitle className="text-lg">{issue.title}</CardTitle>
          </div>
          <AlertTriangle
            className={`h-5 w-5 ${
              issue.severity === 'critical'
                ? 'text-red-500'
                : issue.severity === 'high'
                ? 'text-orange-500'
                : issue.severity === 'medium'
                ? 'text-yellow-500'
                : 'text-green-500'
            }`}
          />
        </div>
      </CardHeader>
      <CardContent>
        {issue.description && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">{issue.description}</p>
        )}

        {issue.metrics && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            {issue.metrics.monthly_spending !== undefined && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Monthly Spend</p>
                  <p className="font-semibold text-gray-900">
                    {formatCurrency(issue.metrics.monthly_spending)}
                  </p>
                </div>
              </div>
            )}
            {issue.metrics.potential_monthly_savings !== undefined && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-xs text-gray-500">Potential Savings</p>
                  <p className="font-semibold text-green-600">
                    {formatCurrency(issue.metrics.potential_monthly_savings)}/mo
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {issue.file_path && (
              <div className="flex items-center gap-1">
                <FileCode className="h-4 w-4" />
                <span className="truncate max-w-[200px]">{issue.file_path}</span>
              </div>
            )}
          </div>

          <Link to={`/issues/${issue.id}`}>
            <Button size="sm" variant="ghost">
              View Details
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>

        <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-gray-500">
          {issue.repo_full_name && <span>{issue.repo_full_name}</span>}
          <span>{formatDate(issue.created_at)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
