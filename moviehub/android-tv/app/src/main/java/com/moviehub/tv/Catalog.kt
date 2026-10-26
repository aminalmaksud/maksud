package com.moviehub.tv

// Plain Kotlin (no Android): folder entries and joining libraries into sections. Kept in step with web/merge.js
// and unit-tested in app/src/test.

enum class Kind { DIR, VIDEO, SUB, IMAGE }

/** One copy of a movie: "1080p" on one server, "720p" on another. */
data class Version(val url: String, val quality: String, val name: String)

/**
 * A folder or file. A folder joined from several libraries lists every real folder in [sources] ([url] is the
 * first); a video found on several libraries lists its copies in [versions], best first ([url] is the best).
 */
data class Entry(
    val name: String,
    val url: String,
    val kind: Kind,
    val sources: List<String> = listOf(url),
    val versions: List<Version> = emptyList(),
)

object Ext {
    val VIDEO = setOf("mkv", "mp4", "m4v", "avi", "mov", "webm", "ts", "wmv", "flv", "mpg", "mpeg")
    val SUB = setOf("srt", "vtt")
    val IMAGE = setOf("jpg", "jpeg", "png", "webp")
}

/**
 * Libraries with the same name apart from quality ("Movies", "Movies 1080p") form one section. Their folders
 * are matched by name with the quality left out, so "English Movies" + "English Movies (1080p)",
 * "(2024)" + "(2024) 1080p" and "Dune Part Two (2024) 720p" + "… 1080p" each become one entry. Nothing here knows
 * any particular server: a new address or folder joins in by its name alone.
 */
object Merge {
    private val QUALITY = Regex(
        """\b(?:2160p|1440p|1080p|720p|576p|480p|360p|4k|uhd|fhd|hd|sd|hdr10\+?|hdr|dv|10.?bit|x26[45]|h\.?26[45]|hevc|avc|web.?dl|web.?rip|webrip|blu.?ray|brrip|bdrip|dvdrip|hdrip|hdtv|remux|imax|dual.?audio|multi.?audio|esubs?|hq|high quality)\b""",
        RegexOption.IGNORE_CASE,
    )
    private val MEDIA_EXT = Regex("""\.(mkv|mp4|m4v|avi|mov|webm|ts|wmv|flv|mpg|mpeg|srt|vtt)$""", RegexOption.IGNORE_CASE)
    private val QUAL_NAME = Regex("""\b(2160p|4k|uhd|1440p|1080p|720p|576p|480p|360p)\b""", RegexOption.IGNORE_CASE)
    private val RANK = mapOf("4K" to 5, "2160p" to 5, "1440p" to 4, "1080p" to 3, "720p" to 2, "576p" to 1, "480p" to 1, "360p" to 0)

    /** Name with quality, codec and punctuation left out. */
    fun keyOf(name: String): String = name.replace(MEDIA_EXT, "")
        .replace(Regex("[._]+"), " ")
        .replace(QUALITY, " ")
        .replace(Regex("""[^\p{L}\p{N}]+"""), " ")
        .trim().lowercase()

    /** "Movies 1080p" -> "movies"; "TV & Web Series" -> "tv web series". */
    fun groupKey(label: String) = keyOf(label).ifEmpty { label.lowercase() }

    /** "1080p" from a file or folder name, else from the library's label ("Movies 1080p"). */
    fun qualityOf(name: String, label: String = ""): String {
        for (s in listOf(name, label)) {
            val q = QUAL_NAME.find(s)?.value?.lowercase() ?: continue
            return if (q == "4k" || q == "uhd") "4K" else q
        }
        return ""
    }

    private fun rank(q: String) = RANK[q] ?: -1

    /** Joins listings of the same folder on several libraries; each listing comes with its library's label. */
    fun merge(listings: List<Pair<List<Entry>, String>>): List<Entry> {
        class Hit(val e: Entry, val quality: String, val label: String)
        val order = ArrayList<Any>() // Entry (kept as is) or key
        val byKey = LinkedHashMap<String, MutableList<Hit>>()
        for ((items, label) in listings) {
            for (e in items) {
                if (e.kind != Kind.DIR && e.kind != Kind.VIDEO) { order += e; continue }
                val k = (if (e.kind == Kind.DIR) "d:" else "v:") + keyOf(e.name).ifEmpty { e.name.lowercase() }
                val list = byKey[k]
                if (list == null) { byKey[k] = mutableListOf(Hit(e, qualityOf(e.name, label), label)); order += k } else list += Hit(e, qualityOf(e.name, label), label)
            }
        }
        return order.map { o ->
            if (o is Entry) return@map o
            val all = byKey[o as String]!!
            val first = all[0].e
            when {
                all.size == 1 -> first
                // The plainest name wins: "English Movies" over "English Movies (1080p)".
                first.kind == Kind.DIR -> Entry(all.minByOrNull { it.e.name.length }!!.e.name, first.url, Kind.DIR, all.flatMap { it.e.sources })
                else -> {
                    val sorted = all.sortedByDescending { rank(it.quality) }
                    val versions = sorted.mapIndexed { i, h -> Version(h.e.url, h.quality.ifEmpty { h.label.ifEmpty { "Copy ${i + 1}" } }, h.e.name) }
                    sorted[0].e.copy(versions = versions)
                }
            }
        }
    }
}
