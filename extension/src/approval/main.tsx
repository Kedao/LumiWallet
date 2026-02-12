import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/base.css'

const APPROVAL_GET_REQUEST = 'LUMI_APPROVAL_GET_REQUEST'
const APPROVAL_DECIDE_REQUEST = 'LUMI_APPROVAL_DECIDE_REQUEST'

interface JsonRpcErrorPayload {
  code: number
  message: string
}

interface ApprovalRequestData {
  id: string
  origin: string
  method: string
  createdAt: string
  selectedAddress: string | null
}

interface ApprovalGetResponse {
  ok: boolean
  request?: ApprovalRequestData
  error?: JsonRpcErrorPayload
}

interface ApprovalDecideResponse {
  ok: boolean
  error?: JsonRpcErrorPayload
}

const sendRuntimeMessage = async <T,>(message: Record<string, unknown>): Promise<T> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const runtimeError = chrome.runtime?.lastError
      if (runtimeError) {
        reject(new Error(runtimeError.message))
        return
      }
      resolve(response)
    })
  })

const parseApprovalIdFromUrl = (): string => {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('approvalId')?.trim() ?? ''
  } catch {
    return ''
  }
}

const ApprovalApp = () => {
  const approvalId = useMemo(() => parseApprovalIdFromUrl(), [])
  const [request, setRequest] = useState<ApprovalRequestData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!approvalId) {
      setError('Approval request id is missing.')
      setIsLoading(false)
      return
    }

    const load = async () => {
      setError('')
      setIsLoading(true)
      try {
        const response = await sendRuntimeMessage<ApprovalGetResponse>({
          type: APPROVAL_GET_REQUEST,
          approvalId
        })
        if (!response.ok || !response.request) {
          setError(response.error?.message ?? 'Approval request not found.')
          return
        }
        setRequest(response.request)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load approval request.')
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [approvalId])

  const submitDecision = async (approved: boolean) => {
    if (!approvalId) {
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      const response = await sendRuntimeMessage<ApprovalDecideResponse>({
        type: APPROVAL_DECIDE_REQUEST,
        approvalId,
        approved
      })
      if (!response.ok) {
        setError(response.error?.message ?? 'Failed to submit approval decision.')
        return
      }
      window.close()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit approval decision.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 18,
        boxSizing: 'border-box'
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 16,
          display: 'grid',
          gap: 12
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18 }}>Connect Request</h1>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
            LumiWallet approval required
          </div>
        </div>

        {isLoading ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading request...</div>
        ) : null}

        {!isLoading && request ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12 }}>
              <strong>Site</strong>
              <div style={{ marginTop: 4, color: 'var(--muted)', wordBreak: 'break-all' }}>
                {request.origin}
              </div>
            </div>
            <div style={{ fontSize: 12 }}>
              <strong>Action</strong>
              <div style={{ marginTop: 4, color: 'var(--muted)' }}>{request.method}</div>
            </div>
            <div style={{ fontSize: 12 }}>
              <strong>Account</strong>
              <div style={{ marginTop: 4, color: 'var(--muted)', wordBreak: 'break-all' }}>
                {request.selectedAddress ?? 'No account selected'}
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              fontSize: 12,
              color: '#8b2b2b',
              background: '#fdeeee',
              border: '1px solid #f0c5c5',
              borderRadius: 10,
              padding: '8px 10px'
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              void submitDecision(false)
            }}
            disabled={isSubmitting || isLoading}
            style={{
              flex: 1,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: '#fff',
              padding: '10px 12px',
              fontWeight: 700,
              cursor: isSubmitting || isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => {
              void submitDecision(true)
            }}
            disabled={isSubmitting || isLoading || !request?.selectedAddress}
            style={{
              flex: 1,
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              padding: '10px 12px',
              fontWeight: 700,
              cursor: isSubmitting || isLoading || !request?.selectedAddress ? 'not-allowed' : 'pointer',
              opacity: isSubmitting || isLoading || !request?.selectedAddress ? 0.7 : 1
            }}
          >
            {isSubmitting ? 'Submitting...' : 'Approve'}
          </button>
        </div>
      </section>
    </main>
  )
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container not found')
}

createRoot(container).render(
  <React.StrictMode>
    <ApprovalApp />
  </React.StrictMode>
)

