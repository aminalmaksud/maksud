package com.moviehub.tv

import android.content.Context

object Prefs {
    private fun p(ctx: Context) = ctx.getSharedPreferences("moviehub", Context.MODE_PRIVATE)

    fun serverUrl(ctx: Context): String = p(ctx).getString("server", "") ?: ""
    fun username(ctx: Context): String = p(ctx).getString("user", "") ?: ""
    fun password(ctx: Context): String = p(ctx).getString("pass", "") ?: ""

    fun saveServer(ctx: Context, url: String, user: String, pass: String) {
        p(ctx).edit().putString("server", url).putString("user", user).putString("pass", pass).apply()
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
