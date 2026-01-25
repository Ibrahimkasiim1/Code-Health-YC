import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Activity, Loader2, CheckCircle, XCircle } from 'lucide-react'

export default function GitHubCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const errorParam = searchParams.get('error')

      if (errorParam) {
        setStatus('error')
        setError(`GitHub authorization failed: ${errorParam}`)
        return
      }

      if (!code || !state) {
        setStatus('error')
        setError('Missing authorization code or state')
        return
      }

      try {
        await authApi.handleGitHubCallback(code, state)
        setStatus('success')
        // Redirect to dashboard after short delay to show success message
        setTimeout(() => navigate('/'), 1500)
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to complete GitHub authorization')
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <Activity className="h-12 w-12 text-indigo-600" />
          </div>
          <CardTitle className="text-2xl font-bold">GitHub Authorization</CardTitle>
          <CardDescription>
            {status === 'loading' && 'Completing GitHub connection...'}
            {status === 'success' && 'Successfully connected to GitHub!'}
            {status === 'error' && 'Connection failed'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          {status === 'loading' && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
              <p className="text-sm text-gray-600">Please wait while we complete the connection...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-sm text-gray-600">Redirecting to dashboard...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-red-500" />
              <p className="text-sm text-red-600 text-center">{error}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate('/login')}>
                  Back to Login
                </Button>
                <Button onClick={() => navigate('/')}>
                  Go to Dashboard
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
