// Servicio IGDB — corre en el main process de Electron
// Auth: Twitch OAuth2 client_credentials

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const IGDB_BASE_URL = 'https://api.igdb.com/v4'

// IDs de plataformas en IGDB
const PLATFORM_IDS = {
  NES: 18,
  SNES: 19,
  'Sega Genesis': 29,
  PS1: 7,
  PS2: 8,
  N64: 4,
}

// Mapa inverso: ID de IGDB → nombre en Retrio
const PLATFORM_NAMES = Object.fromEntries(
  Object.entries(PLATFORM_IDS).map(([name, id]) => [id, name])
)

const ALL_PLATFORM_IDS = Object.values(PLATFORM_IDS)

let tokenCache = null

async function getAccessToken(clientId, clientSecret) {
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

  const data = await res.json()
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }

  return tokenCache.token
}

async function igdbPost(endpoint, body, clientId, accessToken) {
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

  return res.json()
}

function buildCoverUrl(imageId, size = 'cover_big') {
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`
}

/**
 * Busca juegos en IGDB.
 * @param {string} query - Texto de búsqueda
 * @param {string|null} platform - Nombre de plataforma (ej. "SNES") o null para todas
 * @param {number} limit - Máximo de resultados
 */
async function searchGames(query, platform, limit = 24) {
  const clientId = process.env.IGDB_CLIENT_ID
  const clientSecret = process.env.IGDB_CLIENT_SECRET

  if (!clientId || !clientSecret || clientId === 'TU_CLIENT_ID_AQUI') {
    throw new Error('IGDB_CLIENT_ID y IGDB_CLIENT_SECRET no están configurados en .env')
  }

  const accessToken = await getAccessToken(clientId, clientSecret)

  const platformIds = platform && platform !== 'Todas'
    ? [PLATFORM_IDS[platform]].filter(Boolean)
    : ALL_PLATFORM_IDS

  const platformFilter = `platforms = (${platformIds.join(',')})`

  // Búsqueda principal con query
  const searchBody = query
    ? `search "${query.replace(/"/g, '')}";
       fields id,name,platforms,first_release_date,summary,cover.image_id,rating;
       where ${platformFilter} & version_parent = null;
       limit ${limit};`
    : `fields id,name,platforms,first_release_date,summary,cover.image_id,rating;
       where ${platformFilter} & rating > 75 & version_parent = null;
       sort rating desc;
       limit ${limit};`

  const games = await igdbPost('/games', searchBody, clientId, accessToken)

  return games.map((g) => ({
    id: g.id,
    title: g.name,
    platform: resolvePlatform(g.platforms, platformIds),
    year: g.first_release_date
      ? new Date(g.first_release_date * 1000).getFullYear()
      : null,
    coverUrl: g.cover?.image_id ? buildCoverUrl(g.cover.image_id) : null,
    coverUrlHd: g.cover?.image_id ? buildCoverUrl(g.cover.image_id, '720p') : null,
    summary: g.summary || null,
    rating: g.rating ? Math.round(g.rating) : null,
    downloaded: false,
    downloading: false,
  }))
}

/**
 * Devuelve los juegos populares de una plataforma (para la Home).
 */
async function getPopularGames(platform = null, limit = 12) {
  return searchGames('', platform, limit)
}

/**
 * Devuelve info completa de un juego por ID.
 */
async function getGameById(igdbId) {
  const clientId = process.env.IGDB_CLIENT_ID
  const clientSecret = process.env.IGDB_CLIENT_SECRET
  const accessToken = await getAccessToken(clientId, clientSecret)

  const body = `fields id,name,platforms,first_release_date,summary,cover.image_id,
                       screenshots.image_id,genres.name,involved_companies.company.name,rating;
                where id = ${igdbId};
                limit 1;`

  const games = await igdbPost('/games', body, clientId, accessToken)
  const g = games[0]
  if (!g) return null

  return {
    id: g.id,
    title: g.name,
    platform: resolvePlatform(g.platforms, ALL_PLATFORM_IDS),
    year: g.first_release_date
      ? new Date(g.first_release_date * 1000).getFullYear()
      : null,
    coverUrl: g.cover?.image_id ? buildCoverUrl(g.cover.image_id) : null,
    coverUrlHd: g.cover?.image_id ? buildCoverUrl(g.cover.image_id, '720p') : null,
    screenshots: (g.screenshots || []).map((s) =>
      buildCoverUrl(s.image_id, 'screenshot_big')
    ),
    summary: g.summary || null,
    genres: (g.genres || []).map((genre) => genre.name),
    developers: (g.involved_companies || []).map((ic) => ic.company?.name).filter(Boolean),
    rating: g.rating ? Math.round(g.rating) : null,
  }
}

function resolvePlatform(platformIds, preferredIds) {
  if (!platformIds || platformIds.length === 0) return 'Desconocida'
  // Preferir la plataforma que el usuario filtró
  for (const id of preferredIds) {
    if (platformIds.includes(id) && PLATFORM_NAMES[id]) {
      return PLATFORM_NAMES[id]
    }
  }
  // Fallback: primera plataforma conocida
  for (const id of platformIds) {
    if (PLATFORM_NAMES[id]) return PLATFORM_NAMES[id]
  }
  return 'Desconocida'
}

module.exports = { searchGames, getPopularGames, getGameById }
