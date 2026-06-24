/**
 * Shared styles for BLE WCL status card subcomponents.
 *
 * Exports style keys that are used by multiple section components,
 * so each section does not have to duplicate them:
 *   - `helper`             — base style for scanning/status helper text
 *   - `insufficientWarning`— warning variant when fewer than 2 APs are detected
 *
 * Section-specific styles live in each component's own `StyleSheet.create`.
 */

import { StyleSheet } from 'react-native';

export const sharedStyles = StyleSheet.create({
  helper: {
    color: '#334155', // preserve — no exact token (TEXT_MEDIUM #475569 ≠ #334155)
    fontSize: 13,
    lineHeight: 19,
  },
  insufficientWarning: {
    color: '#d97706', // preserve — amber variant, domain signal (see A2 in taxonomy)
    fontWeight: '600',
  },
});
