import type { Game, Platform, SortBy } from '../shared/types'

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const IGDB_BASE_URL = 'https://api.igdb.com/v4'

// IDs de plataformas en IGDB
const PLATFORM_IDS: Record<Platform, number> = {
  NES: 18,
  SNES: 19,
  'Sega Genesis': 29,
  'Sega Saturn':  32,
  PS1: 7,
  PS2: 8,
  N64: 4,
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
  videos?: Array<{ video_id: string }>
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

export const GENRES: Array<{ id: number; label: string }> = [
  { id:  4, label: 'Peleas' },
  { id:  5, label: 'Shooter' },
  { id:  8, label: 'Plataformas' },
  { id:  9, label: 'Puzzle' },
  { id: 10, label: 'Carreras' },
  { id: 11, label: 'Estrategia en tiempo real' },
  { id: 12, label: 'RPG' },
  { id: 13, label: 'Simulador' },
  { id: 14, label: 'Deportes' },
  { id: 15, label: 'Estrategia' },
  { id: 25, label: 'Hack & Slash' },
  { id: 31, label: 'Aventura' },
  { id: 33, label: 'Arcade' },
]

const IGDB_SORT: Record<SortBy, string> = {
  relevance:  'rating desc',
  rating:     'rating desc',
  popular:    'rating_count desc',
  newest:     'first_release_date desc',
  oldest:     'first_release_date asc',
}

const PAGE_SIZE = 48

export async function searchGames(
  query: string,
  platform: string | null,
  sortBy: SortBy = 'relevance',
  offset = 0,
  genreId: number | null = null
): Promise<Game[]> {
  const { clientId, clientSecret } = getCredentials()
  const accessToken = await getAccessToken(clientId, clientSecret)

  const platformIds =
    platform && platform !== 'Todas'
      ? [PLATFORM_IDS[platform as Platform]].filter((id) => id !== undefined && id !== -1)
      : ALL_PLATFORM_IDS

  const platformFilter = `platforms = (${platformIds.join(',')})`
  const genreFilter = genreId ? `& genres = (${genreId}) ` : ''
  const ratingFilter = sortBy === 'oldest' ? '' : '& rating > 0 '

  const body = query
    ? // IGDB search doesn't support sort — fetch then sort client-side
      `search "${query.replace(/"/g, '')}";
       fields id,name,platforms,first_release_date,summary,cover.image_id,rating,rating_count;
       where ${platformFilter} ${genreFilter}& version_parent = null;
       limit ${PAGE_SIZE};
       offset ${offset};`
    : `fields id,name,platforms,first_release_date,summary,cover.image_id,rating,rating_count;
       where ${platformFilter} ${genreFilter}${ratingFilter}& version_parent = null;
       sort ${IGDB_SORT[sortBy]};
       limit ${PAGE_SIZE};
       offset ${offset};`

  const games = await igdbPost('/games', body, clientId, accessToken)
  const mapped = games.map((g) => mapGame(g, platformIds))

  // Client-side sort for text searches
  if (query) {
    mapped.sort((a, b) => {
      if (sortBy === 'newest') return (b.year ?? 0) - (a.year ?? 0)
      if (sortBy === 'oldest') return (a.year ?? 0) - (b.year ?? 0)
      if (sortBy === 'rating' || sortBy === 'popular') return (b.rating ?? 0) - (a.rating ?? 0)
      return 0 // relevance: keep IGDB order
    })
  }

  return mapped
}

export async function getPopularGames(
  platform: string | null = null,
  offset = 0,
  sortBy: SortBy = 'rating',
  genreId: number | null = null
): Promise<Game[]> {
  return searchGames('', platform, sortBy, offset, genreId)
}

export async function getGameById(igdbId: number): Promise<Game | null> {
  const { clientId, clientSecret } = getCredentials()
  const accessToken = await getAccessToken(clientId, clientSecret)

  const body = `fields id,name,platforms,first_release_date,summary,cover.image_id,
                       screenshots.image_id,videos.video_id,genres.name,involved_companies.company.name,rating;
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
    videos: (g.videos ?? []).map((v) => v.video_id),
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
