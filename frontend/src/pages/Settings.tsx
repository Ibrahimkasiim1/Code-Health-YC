import { useState, useEffect } from 'react'
import { settingsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Database,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  ExternalLink,
  Trash2,
  Key,
  Link as LinkIcon,
} from 'lucide-react'

interface McpConfig {
  configured: boolean
  supabase_url: string | null
  project_name: string | null
  updated_at: string | null
}

interface McpConnection {
  configured: boolean
  user_id: string
  claude_desktop_config: object
  instructions: string[]
}

export default function Settings() {
  const [mcpConfig, setMcpConfig] = useState<McpConfig | null>(null)
  const [mcpConnection, setMcpConnection] = useState<McpConnection | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Form state
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [projectName, setProjectName] = useState('')

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setIsLoading(true)
    try {
      const config = await settingsApi.getMcpConfig()
      setMcpConfig(config)
      if (config.supabase_url) {
        setSupabaseUrl(config.supabase_url)
      }
      if (config.project_name) {
        setProjectName(config.project_name)
      }

      // If configured, also load connection details
      if (config.configured) {
        try {
          const connection = await settingsApi.getMcpConnection()
          setMcpConnection(connection)
        } catch {
          // Ignore - user can still see config
        }
      }
    } catch (err) {
      console.error('Failed to load config:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setIsSaving(true)

    try {
      await settingsApi.saveMcpConfig({
        supabase_url: supabaseUrl,
        supabase_service_key: supabaseKey,
        project_name: projectName || undefined,
      })
      setSuccess('Configuration saved successfully!')
      setSupabaseKey('') // Clear the key from form
      await loadConfig()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to remove your MCP configuration?')) {
      return
    }

    setIsDeleting(true)
    setError(null)
    try {
      await settingsApi.deleteMcpConfig()
      setMcpConfig(null)
      setMcpConnection(null)
      setSupabaseUrl('')
      setSupabaseKey('')
      setProjectName('')
      setSuccess('Configuration removed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove configuration')
    } finally {
      setIsDeleting(false)
    }
  }

  const copyConfig = () => {
    if (mcpConnection?.claude_desktop_config) {
      navigator.clipboard.writeText(JSON.stringify(mcpConnection.claude_desktop_config, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Configure your MCP connection for Claude Desktop</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center gap-2">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-700 hover:text-red-900">
            &times;
          </button>
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded flex items-center gap-2">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto text-green-700 hover:text-green-900">
            &times;
          </button>
        </div>
      )}

      {/* Connection Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Supabase Connection
          </CardTitle>
          <CardDescription>
            Connect your Supabase project to enable MCP integration with Claude
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            {mcpConfig?.configured ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-green-700 font-medium">Connected</span>
                {mcpConfig.project_name && (
                  <span className="text-gray-500">({mcpConfig.project_name})</span>
                )}
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-gray-400" />
                <span className="text-gray-500">Not configured</span>
              </>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supabase-url">Supabase URL</Label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="supabase-url"
                  type="url"
                  placeholder="https://your-project.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
              <p className="text-xs text-gray-500">
                Find this in your Supabase dashboard under Project Settings → API
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supabase-key">Service Role Key</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="supabase-key"
                  type="password"
                  placeholder={mcpConfig?.configured ? '••••••••••••••••' : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'}
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  className="pl-10"
                  required={!mcpConfig?.configured}
                />
              </div>
              <p className="text-xs text-gray-500">
                Use the <span className="font-medium">service_role</span> key (not anon key). Keep this secret!
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name (optional)</Label>
              <Input
                id="project-name"
                type="text"
                placeholder="My Project"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : mcpConfig?.configured ? (
                  'Update Configuration'
                ) : (
                  'Save Configuration'
                )}
              </Button>

              {mcpConfig?.configured && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span className="ml-2">Remove</span>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Claude Desktop Configuration */}
      {mcpConnection?.configured && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Claude Desktop Configuration
            </CardTitle>
            <CardDescription>
              Copy this configuration to connect Claude Desktop to your Code Health instance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Setup Instructions</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                  {mcpConnection.instructions.map((instruction, i) => (
                    <li key={i}>{instruction.replace(/^\d+\.\s*/, '')}</li>
                  ))}
                </ol>
              </div>

              {/* Config JSON */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Configuration JSON</Label>
                  <Button variant="outline" size="sm" onClick={copyConfig}>
                    {copied ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                  {JSON.stringify(mcpConnection.claude_desktop_config, null, 2)}
                </pre>
              </div>

              {/* Config file location */}
              <div className="text-sm text-gray-500">
                <p className="font-medium mb-1">Config file location:</p>
                <ul className="space-y-1">
                  <li>
                    <span className="font-medium">macOS:</span>{' '}
                    <code className="bg-gray-100 px-1 rounded">
                      ~/Library/Application Support/Claude/claude_desktop_config.json
                    </code>
                  </li>
                  <li>
                    <span className="font-medium">Windows:</span>{' '}
                    <code className="bg-gray-100 px-1 rounded">%APPDATA%\Claude\claude_desktop_config.json</code>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              <strong>What is MCP?</strong> Model Context Protocol allows Claude to securely connect to external
              tools and data sources, enabling it to analyze your repositories and create fixes directly.
            </p>
            <p>
              <strong>Why do I need Supabase?</strong> Supabase stores your repository contexts, detected issues,
              and generated fixes. It's used by both the web app and the MCP server to keep everything in sync.
            </p>
            <p>
              <strong>Is my API key secure?</strong> Your service key is stored encrypted and is only used to
              generate your personal Claude Desktop configuration. It's never exposed to other users.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
