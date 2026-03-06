import type { Game, Platform } from '../shared/types'

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const IGDB_BASE_URL = 'https://api.igdb.com/v4'

// IDs de plataformas en IGDB
const PLATFORM_IDS: Record<Platform, number> = {
  NES: 18,
  SNES: 19,
  'Sega Genesis': 29,
  PS1: 7,
  PS2: 8,
  N64: 4,
  PC: 6,
  Desconocida: -1,
}

const PLATFORM_NAMES: Record<number, Platform> = Object.fromEntries(
  Object.entries(PLATFORM_IDS)
    .filter(([, id]) => id !== -1)
    .map(([name, id]) => [id, name as Platform])
)

const ALL_PLATFORM_IDS = Object.values(PLATFORM_IDS).filter((id) => id !== -1)

interface TokenCache {
  token: string
  expiresAt: number
}

interface TwitchTokenResponse {
  access_token: string
  expires_in: number
}

interface IgdbGame {
  id: number
  name: string
  platforms?: number[]
  first_release_date?: number
  summary?: string
  cover?: { image_id: string }
  screenshots?: Array<{ image_id: string }>
  genres?: Array<{ name: string }>
  involved_companies?: Array<{ company?: { name: string } }>
  rating?: number
}

let tokenCache: TokenCache | null = null

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token
  }

  const url = new URL(TWITCH_TOKEN_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('client_secret', clientSecret)
  url.searchParams.set('grant_type', 'client_credentials')

  const res = await fetch(url.toString(), { method: 'POST' })
  if (!res.ok) {
    throw new Error(`Twitch auth error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as TwitchTokenResponse
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }

  return tokenCache.token
}

async function igdbPost(
  endpoint: string,
  body: string,
  clientId: string,
  accessToken: string
): Promise<IgdbGame[]> {
  const res = await fetch(`${IGDB_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'text/plain',
    },
    body,
  })

  if (!res.ok) {
    throw new Error(`IGDB error ${res.status} on ${endpoint}: ${await res.text()}`)
  }

  return res.json() as Promise<IgdbGame[]>
}

function buildCoverUrl(imageId: string, size = 'cover_big'): string {
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`
}

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.IGDB_CLIENT_ID
  const clientSecret = process.env.IGDB_CLIENT_SECRET

  if (!clientId || !clientSecret || clientId === 'TU_CLIENT_ID_AQUI') {
    throw new Error('IGDB_CLIENT_ID y IGDB_CLIENT_SECRET no están configurados en .env')
  }

  return { clientId, clientSecret }
}

function mapGame(g: IgdbGame, preferredIds: number[]): Game {
  return {
    id: g.id,
    title: g.name,
    platform: resolvePlatform(g.platforms ?? [], preferredIds),
    year: g.first_release_date
      ? new Date(g.first_release_date * 1000).getFullYear()
      : null,
    coverUrl: g.cover?.image_id ? buildCoverUrl(g.cover.image_id) : null,
    coverUrlHd: g.cover?.image_id ? buildCoverUrl(g.cover.image_id, '720p') : null,
    summary: g.summary ?? null,
    rating: g.rating ? Math.round(g.rating) : null,
    downloaded: false,
    downloading: false,
  }
}

export async function searchGames(
  query: string,
  platform: string | null,
  limit = 24
): Promise<Game[]> {
  const { clientId, clientSecret } = getCredentials()
  const accessToken = await getAccessToken(clientId, clientSecret)

  const platformIds =
    platform && platform !== 'Todas'
      ? [PLATFORM_IDS[platform as Platform]].filter((id) => id !== undefined && id !== -1)
      : ALL_PLATFORM_IDS

  const platformFilter = `platforms = (${platformIds.join(',')})`

  const body = query
    ? `search "${query.replace(/"/g, '')}";
       fields id,name,platforms,first_release_date,summary,cover.image_id,rating;
       where ${platformFilter} & version_parent = null;
       limit ${limit};`
    : `fields id,name,platforms,first_release_date,summary,cover.image_id,rating;
       where ${platformFilter} & rating > 75 & version_parent = null;
       sort rating desc;
       limit ${limit};`

  const games = await igdbPost('/games', body, clientId, accessToken)
  return games.map((g) => mapGame(g, platformIds))
}

export async function getPopularGames(
  platform: string | null = null,
  limit = 12
): Promise<Game[]> {
  return searchGames('', platform, limit)
}

export async function getGameById(igdbId: number): Promise<Game | null> {
  const { clientId, clientSecret } = getCredentials()
  const accessToken = await getAccessToken(clientId, clientSecret)

  const body = `fields id,name,platforms,first_release_date,summary,cover.image_id,
                       screenshots.image_id,genres.name,involved_companies.company.name,rating;
                where id = ${igdbId};
                limit 1;`

  const games = await igdbPost('/games', body, clientId, accessToken)
  const g = games[0]
  if (!g) return null

  return {
    ...mapGame(g, ALL_PLATFORM_IDS),
    screenshots: (g.screenshots ?? []).map((s) =>
      buildCoverUrl(s.image_id, 'screenshot_big')
    ),
    genres: (g.genres ?? []).map((genre) => genre.name),
    developers: (g.involved_companies ?? [])
      .map((ic) => ic.company?.name)
      .filter((name): name is string => Boolean(name)),
  }
}

function resolvePlatform(platformIds: number[], preferredIds: number[]): Platform {
  if (platformIds.length === 0) return 'Desconocida'

  for (const id of preferredIds) {
    if (platformIds.includes(id) && PLATFORM_NAMES[id]) {
      return PLATFORM_NAMES[id]
    }
  }

  for (const id of platformIds) {
    if (PLATFORM_NAMES[id]) return PLATFORM_NAMES[id]
  }

  return 'Desconocida'
}
