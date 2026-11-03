package com.moviehub.tv

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.graphics.Typeface
import android.os.Build
import android.widget.ScrollView
import android.widget.TextView
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/**
 * If the app crashes, the error is kept and shown the next time it opens, so it can be photographed and fixed
 * (a TV has no easy way to read its own crash logs).
 */
object CrashLog {
    private fun file(ctx: Context) = File(ctx.filesDir, "last-crash.txt")

    fun install(ctx: Context) {
        val app = ctx.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        if (previous is Handler) return
        Thread.setDefaultUncaughtExceptionHandler(Handler(app, previous))
    }

    private class Handler(val app: Context, val previous: Thread.UncaughtExceptionHandler?) : Thread.UncaughtExceptionHandler {
        override fun uncaughtException(t: Thread, e: Throwable) {
            try {
                val sw = StringWriter()
                e.printStackTrace(PrintWriter(sw))
                val version = try { app.packageManager.getPackageInfo(app.packageName, 0).versionName } catch (x: Exception) { "?" }
                file(app).writeText("App $version · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}) · ${Build.MANUFACTURER} ${Build.MODEL}\nThread: ${t.name}\n\n$sw")
            } catch (_: Throwable) { }
            previous?.uncaughtException(t, e)
        }
    }

    /** Shows the last crash once, then forgets it. */
    fun showIfAny(activity: Activity) {
        val f = file(activity)
        if (!f.exists()) return
        val text = try { f.readText() } catch (e: Exception) { return } finally { f.delete() }
        val view = TextView(activity).apply {
            this.text = text.lines().take(60).joinToString("\n")
            typeface = Typeface.MONOSPACE
            textSize = 11f
            setTextIsSelectable(true)
            setPadding(Ui.dp(activity, 18f), Ui.dp(activity, 12f), Ui.dp(activity, 18f), Ui.dp(activity, 12f))
        }
        AlertDialog.Builder(activity)
            .setTitle("The app closed unexpectedly last time")
            .setMessage("Please take a photo of this and send it, so it can be fixed.")
            .setView(ScrollView(activity).apply { addView(view) })
            .setPositiveButton("OK", null)
            .show()
    }
}
