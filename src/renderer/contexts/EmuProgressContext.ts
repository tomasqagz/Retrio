import { createContext, useContext } from 'react'
import type { EmulatorInstallProgress } from '../../shared/types'

export type EmuProgressMap = Record<string, EmulatorInstallProgress>

export interface EmuProgressContextValue {
  active: EmuProgressMap
  completed: EmuProgressMap
  dismissCompleted: (id: string) => void
}

export const EmuProgressContext = createContext<EmuProgressContextValue>({
  active: {},
  completed: {},
  dismissCompleted: () => {},
})

export function useEmuProgress() {
  return useContext(EmuProgressContext)
}
