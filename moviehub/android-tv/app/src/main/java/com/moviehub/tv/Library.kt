package com.moviehub.tv

import android.util.Base64
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import org.json.JSONObject

enum class Kind { DIR, VIDEO, SUB }

data class Entry(val name: String, val url: String, val kind: Kind)

class LibraryException(message: String) : Exception(message)

/** Reads an HTTP "Index of /" directory listing (nginx, Apache, lighttpd, caddy...). */
class Library(rootUrl: String, user: String, pass: String) {
    val root: String = normalize(rootUrl)
    val authHeader: String? =
        if (user.isNotEmpty()) "Basic " + Base64.encodeToString("$user:$pass".toByteArray(), Base64.NO_WRAP) else null

    fun list(dirUrl: String): List<Entry> {
        val conn = URL(dirUrl).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        conn.setRequestProperty("User-Agent", "MovieHub-TV/1.0")
        authHeader?.let { conn.setRequestProperty("Authorization", it) }
        val html = try {
            when (val code = conn.responseCode) {
                200 -> conn.inputStream.bufferedReader().use { it.readText() }
                401 -> throw LibraryException("Server needs a username and password (see Settings)")
                else -> throw LibraryException("Server answered $code")
            }
        } catch (e: IOException) {
            throw LibraryException("Cannot reach server: ${e.message}")
        } finally {
            conn.disconnect()
        }
        val items = parse(html, dirUrl)
        return if (items.isEmpty() && html.contains("_h5ai")) h5ai(dirUrl) else items
    }

    /** h5ai file browsers (common on BDIX servers) may build the listing in JS; ask their API instead. */
    private fun h5ai(dirUrl: String): List<Entry> = try {
        val conn = URL(URL(dirUrl), "/_h5ai/public/index.php").openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        authHeader?.let { conn.setRequestProperty("Authorization", it) }
        val body = JSONObject().put("action", "get")
            .put("items", JSONObject().put("href", URL(dirUrl).path).put("what", 1))
        conn.outputStream.use { it.write(body.toString().toByteArray()) }
        val json = try { conn.inputStream.bufferedReader().use { it.readText() } } finally { conn.disconnect() }
        val arr = JSONObject(json).optJSONArray("items")
        val links = StringBuilder()
        for (i in 0 until (arr?.length() ?: 0)) {
            links.append("<a href=\"").append(arr!!.getJSONObject(i).optString("href").replace("\"", "&quot;")).append("\">")
        }
        parse(links.toString(), dirUrl)
    } catch (e: Exception) {
        emptyList()
    }

    private fun parse(html: String, dirUrl: String): List<Entry> {
        val dir = URL(dirUrl)
        val base = URL(root)
        val seen = HashSet<String>()
        val out = ArrayList<Entry>()
        for (m in HREF.findAll(html)) {
            val href = unescape(m.groupValues[1].ifEmpty { m.groupValues[2] }).trim()
            if (href.isEmpty() || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) continue
            val u = try { URL(dir, href.replace(" ", "%20")) } catch (e: Exception) { continue }
            if (u.protocol != base.protocol || u.host != base.host || port(u) != port(base)) continue
            if (u.query != null) continue // column-sort links
            val path = decode(u.path)
            val dirPath = decode(dir.path)
            if (!path.startsWith(dirPath) || path == dirPath || !path.startsWith(decode(base.path))) continue // parent / self
            val isDir = path.endsWith("/")
            val name = path.trimEnd('/').substringAfterLast('/')
            if (name.isEmpty() || name.startsWith(".") || !seen.add(path)) continue
            val ext = name.substringAfterLast('.', "").lowercase()
            val kind = when {
                isDir -> Kind.DIR
                ext in VIDEO_EXT -> Kind.VIDEO
                ext in SUB_EXT -> Kind.SUB
                else -> continue
            }
            out.add(Entry(name, u.toExternalForm(), kind))
        }
        return out.sortedWith(
            compareBy<Entry> { it.kind != Kind.DIR }.then(Comparator { a, b -> naturalCompare(a.name, b.name) })
        )
    }

    companion object {
        private val HREF = Regex("""<a\s+[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')""", RegexOption.IGNORE_CASE)
        val VIDEO_EXT = setOf("mkv", "mp4", "m4v", "avi", "mov", "webm", "ts", "wmv", "flv", "mpg", "mpeg")
        val SUB_EXT = setOf("srt", "vtt")

        fun normalize(url: String): String {
            var u = url.trim()
            if (u.isEmpty()) return u
            if (!u.startsWith("http://", true) && !u.startsWith("https://", true)) u = "http://$u"
            return if (u.endsWith("/")) u else "$u/"
        }

        private fun port(u: URL) = if (u.port == -1) u.defaultPort else u.port

        private fun decode(s: String) = try { URLDecoder.decode(s.replace("+", "%2B"), "UTF-8") } catch (e: Exception) { s }

        private fun unescape(s: String) = s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            .replace("&quot;", "\"").replace("&#39;", "'").replace("&#039;", "'")

        /** "Movie 2" sorts before "Movie 10", case-insensitive. */
        fun naturalCompare(a: String, b: String): Int {
            val ta = TOKEN.findAll(a.lowercase()).map { it.value }.toList()
            val tb = TOKEN.findAll(b.lowercase()).map { it.value }.toList()
            for (i in 0 until minOf(ta.size, tb.size)) {
                val x = ta[i]; val y = tb[i]
                val c = if (x[0].isDigit() && y[0].isDigit()) {
                    val nx = x.toBigInteger(); val ny = y.toBigInteger()
                    nx.compareTo(ny)
                } else x.compareTo(y)
                if (c != 0) return c
            }
            return ta.size - tb.size
        }
        private val TOKEN = Regex("""\d+|\D+""")
    }
}
