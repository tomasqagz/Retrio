const PLATFORM_LABELS: Record<string, string> = {}

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform
}
