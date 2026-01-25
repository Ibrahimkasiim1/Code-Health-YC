import { useEffect, useState } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'

interface DiffViewerProps {
  originalCode: string
  fixedCode: string
  language?: string
  diff?: string
}

export default function DiffViewer({
  originalCode,
  fixedCode,
  language = 'javascript',
  diff,
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'diff' | 'split' | 'unified'>('diff')

  // Detect language from file extension or content
  const detectLanguage = (code: string): string => {
    if (code.includes('import React') || code.includes('from react')) return 'typescript'
    if (code.includes('def ') || code.includes('import ')) return 'python'
    if (code.includes('package ') && code.includes('func ')) return 'go'
    return language
  }

  const detectedLanguage = detectLanguage(originalCode)

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-gray-100 px-4 py-2 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Code Changes</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('diff')}
            className={`px-3 py-1 text-xs rounded ${
              viewMode === 'diff' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            Side by Side
          </button>
          <button
            onClick={() => setViewMode('unified')}
            className={`px-3 py-1 text-xs rounded ${
              viewMode === 'unified' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            Unified Diff
          </button>
        </div>
      </div>

      <div className="bg-gray-900">
        {viewMode === 'diff' ? (
          <DiffEditor
            height="500px"
            language={detectedLanguage}
            original={originalCode}
            modified={fixedCode}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              renderSideBySide: true,
            }}
          />
        ) : (
          <div className="relative">
            {diff ? (
              <pre className="p-4 text-sm overflow-x-auto text-gray-100 font-mono whitespace-pre">
                {diff.split('\n').map((line, idx) => {
                  let className = 'block'
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    className += ' bg-green-900/40 text-green-300'
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    className += ' bg-red-900/40 text-red-300'
                  } else if (line.startsWith('@@')) {
                    className += ' text-cyan-400'
                  }
                  return (
                    <span key={idx} className={className}>
                      {line}
                    </span>
                  )
                })}
              </pre>
            ) : (
              <Editor
                height="500px"
                language={detectedLanguage}
                value={fixedCode}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  lineNumbers: 'on',
                }}
              />
            )}
          </div>
        )}
      </div>

      <div className="bg-gray-100 px-4 py-2 border-t">
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-green-500 rounded" />
            Added
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-red-500 rounded" />
            Removed
          </span>
        </div>
      </div>
    </div>
  )
}
