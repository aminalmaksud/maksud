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

    fun position(ctx: Context, url: String): Long = p(ctx).getLong("pos:$url", 0L)

    /** Remembers where playback stopped; forgets it once the movie is (nearly) finished. */
    fun savePosition(ctx: Context, url: String, posMs: Long, durMs: Long) {
        val e = p(ctx).edit()
        if (durMs > 0 && posMs > durMs - 60_000) e.remove("pos:$url")
        else if (posMs > 5_000) e.putLong("pos:$url", posMs)
        e.apply()
    }
}
