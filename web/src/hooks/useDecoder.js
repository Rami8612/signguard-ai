import { useState, useCallback } from 'react'

/**
 * Hook for interacting with the Calldata Decoder API
 */
export default function useDecoder() {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const decode = useCallback(async ({ calldata, targetAddress, profile, aiProvider, aiModel, operation }) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/decode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          calldata,
          targetAddress: targetAddress || undefined,
          profile: profile || undefined,
          offline: true,
          aiProvider: aiProvider || undefined,
          aiModel: aiModel || undefined,
          operation: operation ?? 0
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Decode failed')
      }

      setResult(data)
      return data

    } catch (err) {
      const errorMessage = err.message || 'Failed to decode calldata'
      setError(errorMessage)
      setResult(null)
      throw err

    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return {
    result,
    error,
    isLoading,
    decode,
    reset
  }
}
