import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { BG_LIGHT, BG_WHITE, PRIMARY_BLUE, TEXT_DARK, TEXT_LIGHT, TEXT_MEDIUM } from '../../theme'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>예상치 못한 오류가 발생했습니다</Text>
          <Text style={styles.subtitle}>
            앱을 계속 사용하려면 아래 버튼을 눌러주세요
          </Text>
          <Pressable accessibilityHint="오류가 발생했을 때 앱을 다시 시작합니다" accessibilityLabel="다시 시도" accessibilityRole="button" style={styles.retryButton} onPress={this.handleRetry}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
          {this.state.error && (
            <Text style={styles.errorDetail}>{this.state.error.message}</Text>
          )}
        </View>
      )
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BG_LIGHT,
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_DARK,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MEDIUM,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: PRIMARY_BLUE,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: BG_WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  errorDetail: {
    fontSize: 12,
    color: TEXT_LIGHT,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
  },
})
