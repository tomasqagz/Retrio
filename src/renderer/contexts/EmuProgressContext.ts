import { createContext, useContext } from 'react'
import type { EmulatorInstallProgress } from '../../shared/types'

export type EmuProgressMap = Record<string, EmulatorInstallProgress>

export const EmuProgressContext = createContext<EmuProgressMap>({})

export function useEmuProgress() {
  return useContext(EmuProgressContext)
}
