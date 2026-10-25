package com.moviehub.tv

import android.content.Context

object Prefs {
    private fun p(ctx: Context) = ctx.getSharedPreferences("moviehub", Context.MODE_PRIVATE)

    /** One library root per line (movies, TV series and anime are often on separate servers). */
    fun servers(ctx: Context): List<String> =
        (p(ctx).getString("servers", null) ?: p(ctx).getString("server", "") ?: "")
            .lines().map { it.trim() }.filter { it.isNotEmpty() }
    fun username(ctx: Context): String = p(ctx).getString("user", "") ?: ""
    fun password(ctx: Context): String = p(ctx).getString("pass", "") ?: ""

    fun saveServers(ctx: Context, servers: List<String>, user: String, pass: String) {
        p(ctx).edit().remove("server").putString("servers", servers.joinToString("\n"))
            .putString("user", user).putString("pass", pass).apply()
    }

    /** Last audio / subtitle language picked, reused for the next video ("off" = subtitles off). */
    fun audioLang(ctx: Context): String = p(ctx).getString("audioLang", "") ?: ""
    fun subLang(ctx: Context): String = p(ctx).getString("subLang", "") ?: ""
    fun subScale(ctx: Context): Float = p(ctx).getFloat("subScale", 1f)
    fun setAudioLang(ctx: Context, v: String) = p(ctx).edit().putString("audioLang", v).apply()
    fun setSubLang(ctx: Context, v: String) = p(ctx).edit().putString("subLang", v).apply()
    fun setSubScale(ctx: Context, v: Float) = p(ctx).edit().putFloat("subScale", v).apply()

    fun tmdbKey(ctx: Context): String = p(ctx).getString("tmdb", "") ?: ""
    fun setTmdbKey(ctx: Context, v: String) = p(ctx).edit().putString("tmdb", v.trim()).apply()

    /** Audio / subtitle sync in seconds, remembered per video (positive = later). */
    fun audioSync(ctx: Context, url: String): Float = p(ctx).getFloat("as:$url", 0f)
    fun subSync(ctx: Context, url: String): Float = p(ctx).getFloat("ss:$url", 0f)
    fun setAudioSync(ctx: Context, url: String, v: Float) = p(ctx).edit().let { if (v == 0f) it.remove("as:$url") else it.putFloat("as:$url", v) }.apply()
    fun setSubSync(ctx: Context, url: String, v: Float) = p(ctx).edit().let { if (v == 0f) it.remove("ss:$url") else it.putFloat("ss:$url", v) }.apply()

    /** Subtitle style: font key, ARGB colour, edge key, background alpha (0-255), position key. */
    fun subFont(ctx: Context): String = p(ctx).getString("subFont", "clean") ?: "clean"
    fun subColor(ctx: Context): Int = p(ctx).getInt("subColor", 0xFFFFFFFF.toInt())
    fun subEdge(ctx: Context): String = p(ctx).getString("subEdge", "shadow") ?: "shadow"
    fun subBg(ctx: Context): Int = p(ctx).getInt("subBg", 0)
    fun subPos(ctx: Context): String = p(ctx).getString("subPos", "low") ?: "low"
    fun setSubStyle(ctx: Context, font: String? = null, color: Int? = null, edge: String? = null, bg: Int? = null, pos: String? = null) {
        val e = p(ctx).edit()
        font?.let { e.putString("subFont", it) }
        color?.let { e.putInt("subColor", it) }
        edge?.let { e.putString("subEdge", it) }
        bg?.let { e.putInt("subBg", it) }
        pos?.let { e.putString("subPos", it) }
        e.apply()
    }

    /** "Continue watching": most recent first, as (url, name) pairs; finished videos drop off. */
    fun recent(ctx: Context): List<Pair<String, String>> = try {
        val arr = org.json.JSONArray(p(ctx).getString("recent", "[]"))
        (0 until arr.length()).map { arr.getJSONObject(it).let { o -> o.getString("u") to o.getString("n") } }
    } catch (e: Exception) { emptyList() }

    fun touchRecent(ctx: Context, url: String, name: String, keep: Boolean) {
        val list = recent(ctx).filter { it.first != url }.toMutableList()
        if (keep) list.add(0, url to name)
        val arr = org.json.JSONArray()
        list.take(20).forEach { arr.put(org.json.JSONObject().put("u", it.first).put("n", it.second)) }
        p(ctx).edit().putString("recent", arr.toString()).apply()
    }

    fun position(ctx: Context, url: String): Long = p(ctx).getLong("pos:$url", 0L)
    fun duration(ctx: Context, url: String): Long = p(ctx).getLong("dur:$url", 0L)

    /** Remembers where playback stopped; forgets it once the movie is (nearly) finished. */
    fun savePosition(ctx: Context, url: String, posMs: Long, durMs: Long) {
        val e = p(ctx).edit()
        if (durMs > 0 && posMs > durMs - 60_000) e.remove("pos:$url")
        else if (posMs > 5_000) e.putLong("pos:$url", posMs)
        if (durMs > 0) e.putLong("dur:$url", durMs)
        e.apply()
    }
}
