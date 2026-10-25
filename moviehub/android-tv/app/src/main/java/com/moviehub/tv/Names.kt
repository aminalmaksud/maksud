package com.moviehub.tv

/** Title / year / episode parsing and folder heuristics for BDIX-style libraries (kept in step with web/listing.js). */
data class ParsedName(val title: String, val year: Int?, val season: Int?, val episode: Int?, val generic: Boolean)

object Names {
    private val JUNK = Regex(
        """\b(2160p|1080p|720p|576p|480p|4k|uhd|hdr|hdr10|dv|bluray|blu ray|brrip|bdrip|bdremux|remux|web ?dl|webrip|web|hdrip|dvdrip|dvdscr|hdtv|hdcam|camrip|x264|x265|h ?264|h ?265|hevc|avc|10bit|8bit|aac\d?|ac3|eac3|dts|ddp?\d?|atmos|truehd|dual audio|multi audio|hindi|english|esubs?|subbed|dubbed|proper|repack|extended|unrated|imax|yify|yts|rarbg|psa|pahe)\b""",
        RegexOption.IGNORE_CASE,
    )
    private val SXE = Regex("""\bS(\d{1,2}) ?E(\d{1,3})\b|\b(\d{1,2})x(\d{2,3})\b""", RegexOption.IGNORE_CASE)
    private val ANIME_EP = Regex("""\s-\s(\d{1,4})(?:v\d)?(?:\s|$)""")
    private val YEAR = Regex("""(?:^|[\s(])((?:19|20)\d{2})(?=[\s)]|$)""")
    val EPISODE = Regex("""\bS\d{1,2} ?E\d{1,3}\b|\b\d{1,2}x\d{2}\b|\b(?:ep|episode|e)[ ._-]?\d{1,3}\b|\s-\s\d{1,4}\b|^\d{1,3}\b""", RegexOption.IGNORE_CASE)

    fun stem(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        return if (ext in Library.VIDEO_EXT || ext in Library.SUB_EXT || ext in Library.IMG_EXT) name.substringBeforeLast('.') else name
    }

    fun parse(raw: String): ParsedName {
        var s = stem(raw).replace(Regex("[._]+"), " ").replace(Regex("""\[[^\]]*]|\{[^}]*}"""), " ").replace(Regex("\\s+"), " ").trim()
        val original = s
        var season: Int? = null
        var episode: Int? = null
        var generic = false
        val ep = SXE.find(s)
        if (ep != null) {
            season = (ep.groupValues[1].ifEmpty { ep.groupValues[3] }).toInt()
            episode = (ep.groupValues[2].ifEmpty { ep.groupValues[4] }).toInt()
            s = s.substring(0, ep.range.first)
        } else {
            ANIME_EP.find(s)?.let { episode = it.groupValues[1].toInt(); s = s.substring(0, it.range.first) }
        }
        Regex("""^(?:season|s) ?(\d{1,2})$""", RegexOption.IGNORE_CASE).find(s)?.let { season = it.groupValues[1].toInt(); generic = true }
        var year: Int? = null
        YEAR.findAll(s).firstOrNull { it.range.first > 0 }?.let { year = it.groupValues[1].toInt(); s = s.substring(0, it.range.first) }
        JUNK.find(s)?.let { if (it.range.first > 0) s = s.substring(0, it.range.first) }
        s = s.trim().trimEnd('-', '–', '(', ' ').trimStart('-', '–', ' ').trim()
        val title = s.ifEmpty { original }
        if (Regex("""^(?:episode|ep|e|part) ?\d{1,4}$""", RegexOption.IGNORE_CASE).matches(title) || Regex("""^\d{1,3}$""").matches(title)) generic = true
        return ParsedName(title, year, season, episode, generic)
    }

    private val YEAR_FOLDER = Regex("""^[(\[]?\s*(?:19|20)\d{2}(?:\s*[-–&,]\s*(?:19|20)?\d{2,4})?\s*[)\]]?(?:\s*(?:1080p|720p|480p|2160p|4k|hd))?\s*$""", RegexOption.IGNORE_CASE)
    fun isYearFolder(n: String) = YEAR_FOLDER.matches(n.trim())
    fun yearOf(n: String) = Regex("""(?:19|20)\d{2}""").findAll(n).maxOfOrNull { it.value.toInt() } ?: 0
    fun isTitleFolder(n: String) = (Regex("""\b(?:19|20)\d{2}\b""").containsMatchIn(n) && !isYearFolder(n)) ||
        Regex("""\bS\d{1,2}\b|\bseason\b""", RegexOption.IGNORE_CASE).containsMatchIn(n)

    /** A folder of categories ("English Movies", year folders…) is shown as rows of posters. */
    fun isCategoryFolder(items: List<Entry>): Boolean {
        val dirs = items.filter { it.kind == Kind.DIR }
        if (dirs.isEmpty() || items.any { it.kind == Kind.VIDEO } || dirs.size > 60) return false
        return dirs.count { !isTitleFolder(it.name) } >= dirs.size * 0.7
    }

    fun sortCategories(dirs: List<Entry>) = if (dirs.all { isYearFolder(it.name) }) dirs.sortedByDescending { yearOf(it.name) } else dirs

    fun isEpisodeList(videos: List<Entry>) = videos.size >= 2 && videos.count { EPISODE.containsMatchIn(it.name) } >= videos.size * 0.6

    fun episodeNumber(name: String, index: Int): Int {
        val m = Regex("""\bS\d{1,2} ?E(\d{1,3})\b|\b\d{1,2}x(\d{2})\b|\b(?:ep|episode|e)[ ._-]?(\d{1,3})\b|\s-\s(\d{1,4})\b|^(\d{1,3})\b""", RegexOption.IGNORE_CASE).find(name)
        return m?.groupValues?.drop(1)?.firstOrNull { it.isNotEmpty() }?.toInt() ?: (index + 1)
    }

    fun displayTitle(e: Entry): String {
        if (e.kind == Kind.DIR) {
            val p = parse(e.name)
            return if (isTitleFolder(e.name) && !p.generic) p.title else e.name
        }
        val p = parse(e.name)
        return if (p.generic) stem(e.name) else p.title
    }
}
