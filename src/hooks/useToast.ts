import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export type ToastConfig = {
  message: string
  variant: ToastVariant
  duration?: number
}

export function useToast() {
  const [visible, setVisible] = useState(false)
  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hideToast = useCallback(() => {
    setVisible(false)
    setToastConfig(null)
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const showToast = useCallback(
    (config: ToastConfig) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      setToastConfig(config)
      setVisible(true)
      const duration = config.duration ?? 3000
      timerRef.current = setTimeout(() => {
        hideToast()
      }, duration)
    },
    [hideToast],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return { showToast, hideToast, visible, toastConfig }
}
