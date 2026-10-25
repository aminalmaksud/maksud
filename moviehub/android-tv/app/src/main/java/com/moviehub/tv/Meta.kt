package com.moviehub.tv

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Poster for a folder or video: an image on the server wins, then TMDB (with a key), else null (coloured card). */
object Meta {
    data class Info(val poster: String?, val year: Int?, val title: String)

    private val cache = ConcurrentHashMap<String, CompletableDeferred<Info>>()
    private val listCache = ConcurrentHashMap<String, CompletableDeferred<List<Entry>>>()
    private val listLimit = Semaphore(6)
    private val tmdbLimit = Semaphore(4)
    var tmdbKey: String = ""

    fun clear() { cache.clear(); listCache.clear() }

    suspend fun list(lib: Library, url: String): List<Entry> {
        val mine = CompletableDeferred<List<Entry>>()
        val existing = listCache.putIfAbsent(url, mine)
        if (existing != null) return existing.await()
        return try {
            val items = listLimit.withPermit { withContext(Dispatchers.IO) { lib.list(url) } }
            mine.complete(items); items
        } catch (e: Exception) {
            listCache.remove(url); mine.completeExceptionally(e); throw e
        }
    }

    suspend fun of(lib: Library, e: Entry): Info {
        val mine = CompletableDeferred<Info>()
        val existing = cache.putIfAbsent(e.url, mine)
        if (existing != null) return existing.await()
        val info = try { resolve(lib, e) } catch (x: Exception) { Info(null, null, Names.displayTitle(e)) }
        mine.complete(info)
        return info
    }

    private suspend fun resolve(lib: Library, e: Entry): Info {
        val p = Names.parse(e.name)
        var poster: String? = null
        try {
            if (e.kind == Kind.DIR) {
                poster = pickImage(list(lib, e.url), null)?.url
            } else {
                val parent = e.url.substringBeforeLast('/') + "/"
                poster = pickImage(list(lib, parent), Names.stem(e.name))?.url
            }
        } catch (_: Exception) { }
        if (poster == null && tmdbKey.isNotBlank() && !p.generic) {
            poster = tmdbLimit.withPermit { withContext(Dispatchers.IO) { tmdbPoster(p, p.season != null || p.episode != null) } }
        }
        return Info(poster, p.year, Names.displayTitle(e))
    }

    private fun pickImage(items: List<Entry>, stem: String?): Entry? {
        val imgs = items.filter { it.kind == Kind.IMAGE }
        if (stem != null) imgs.firstOrNull { it.name.startsWith(stem, ignoreCase = true) }?.let { return it }
        return imgs.firstOrNull { Regex("""^(poster|folder|cover|front|movie|show)\b""", RegexOption.IGNORE_CASE).containsMatchIn(it.name) }
            ?: if (stem == null) imgs.firstOrNull { !Regex("backdrop|fanart|banner|logo|thumb", RegexOption.IGNORE_CASE).containsMatchIn(it.name) } else null
    }

    private fun tmdbPoster(p: ParsedName, preferTv: Boolean): String? {
        fun search(kind: String, yearParam: String): JSONObject? {
            val q = URLEncoder.encode(p.title, "UTF-8")
            var u = "https://api.themoviedb.org/3/search/$kind?query=$q" + (p.year?.let { "&$yearParam=$it" } ?: "")
            val conn: HttpURLConnection
            if (tmdbKey.length > 40) {
                conn = URL(u).openConnection() as HttpURLConnection
                conn.setRequestProperty("Authorization", "Bearer $tmdbKey")
            } else {
                u += "&api_key=$tmdbKey"
                conn = URL(u).openConnection() as HttpURLConnection
            }
            conn.connectTimeout = 8000; conn.readTimeout = 8000
            return try {
                if (conn.responseCode != 200) null
                else JSONObject(conn.inputStream.bufferedReader().use { it.readText() }).optJSONArray("results")?.optJSONObject(0)
            } finally { conn.disconnect() }
        }
        val hit = if (preferTv) search("tv", "first_air_date_year") ?: search("movie", "year") else search("movie", "year") ?: search("tv", "first_air_date_year")
        val path = hit?.optString("poster_path").orEmpty()
        return if (path.isNotEmpty() && path != "null") "https://image.tmdb.org/t/p/w342$path" else null
    }
}
