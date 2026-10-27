package com.moviehub.tv

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Looper
import android.util.Base64
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import androidx.test.core.app.ApplicationProvider
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URLDecoder
import kotlin.concurrent.thread
import java.net.URLEncoder
import java.time.Duration
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowDialog

/**
 * Runs the real screens against a fake DhakaFlix with two "Movies" servers (one 1080p, one with 720p copies and
 * its own folder names) and a TV server. Prints small screenshots to the log as SHOT lines.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w960dp-h540dp-land-xhdpi")
class ScreensTest {
    private lateinit var server: ServerSocket
    private val tree = mapOf(
        "/m7/" to listOf("English Movies (1080p)/", "Animation Movies/"),
        "/m7/English Movies (1080p)/" to listOf("(2024) 1080p/", "(2023) 1080p/"),
        "/m7/English Movies (1080p)/(2024) 1080p/" to listOf("Dune Part Two (2024) 1080p/", "Civil War (2024) 1080p/"),
        "/m7/English Movies (1080p)/(2024) 1080p/Dune Part Two (2024) 1080p/" to listOf("Dune.Part.Two.2024.1080p.WEB-DL.mkv"),
        "/m7/English Movies (1080p)/(2024) 1080p/Civil War (2024) 1080p/" to listOf("Civil.War.2024.1080p.mkv"),
        "/m7/English Movies (1080p)/(2023) 1080p/" to listOf("Oppenheimer (2023) 1080p/"),
        "/m7/English Movies (1080p)/(2023) 1080p/Oppenheimer (2023) 1080p/" to listOf("Oppenheimer.2023.1080p.mkv"),
        "/m7/Animation Movies/" to listOf("Inside Out 2 (2024) 1080p/"),
        "/m7/Animation Movies/Inside Out 2 (2024) 1080p/" to listOf("Inside.Out.2.2024.mkv"),
        "/m14/" to listOf("English Movies/", "Hindi Movies/"),
        "/m14/English Movies/" to listOf("(2024)/"),
        "/m14/English Movies/(2024)/" to listOf("Dune Part Two (2024) 720p/", "Furiosa (2024)/"),
        "/m14/English Movies/(2024)/Dune Part Two (2024) 720p/" to listOf("Dune.Part.Two.2024.720p.mp4"),
        "/m14/English Movies/(2024)/Furiosa (2024)/" to listOf("Furiosa.2024.mkv"),
        "/m14/Hindi Movies/" to listOf("Stree 2 (2024)/", "Jawan (2023) 720p/"),
        "/m14/Hindi Movies/Stree 2 (2024)/" to listOf("Stree.2.2024.mkv"),
        "/m14/Hindi Movies/Jawan (2023) 720p/" to listOf("Jawan.2023.720p.mkv"),
        "/tv/" to listOf("Breaking Bad (TV Series 2008–2013) 1080p/", "The Bear (TV Series 2022– ) 1080p/"),
        "/tv/Breaking Bad (TV Series 2008–2013) 1080p/" to listOf("Season 1/"),
        "/tv/Breaking Bad (TV Series 2008–2013) 1080p/Season 1/" to listOf("Breaking.Bad.S01E01.1080p.mkv", "Breaking.Bad.S01E02.1080p.mkv", "Breaking.Bad.S01E03.1080p.mkv"),
        "/tv/The Bear (TV Series 2022– ) 1080p/" to listOf("Season 1/"),
        "/tv/The Bear (TV Series 2022– ) 1080p/Season 1/" to listOf("The.Bear.S01E01.mkv", "The.Bear.S01E02.mkv"),
    )
    private val results = mutableListOf<String>()
    private val failures = mutableListOf<String>()
    private fun check(what: String, ok: Boolean, detail: Any? = null) {
        val line = (if (ok) "PASS " else "FAIL ") + what + (detail?.let { "  →  $it" } ?: "")
        results += line; if (!ok) failures += line
        println("CHECK $line")
    }

    @Before fun setUp() {
        // Animations off (as Android's own UI tests do): the test clock stands still, so long ones never end.
        android.animation.ValueAnimator::class.java.getMethod("setDurationScale", java.lang.Float.TYPE).invoke(null, 0f)
        // If anything hangs, say where every thread is and stop, instead of holding up the build.
        thread(isDaemon = true, name = "watchdog") {
            Thread.sleep(240_000)
            println("WATCHDOG: test still running after 4 minutes. Threads:")
            Thread.getAllStackTraces().forEach { (t, st) -> println("THREAD ${t.name} (${t.state})\n" + st.take(25).joinToString("\n") { "    at $it" }) }
            println("RESULTS SO FAR\n" + results.joinToString("\n"))
            System.out.flush()
            Runtime.getRuntime().halt(3)
        }
        // A tiny HTTP server: nginx-style "Index of" pages for folders, a few bytes for files.
        server = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        thread(isDaemon = true) {
            while (!server.isClosed) {
                val sock = try { server.accept() } catch (e: Exception) { break }
                thread(isDaemon = true) {
                    sock.use { so ->
                        val reader = so.getInputStream().bufferedReader()
                        val request = reader.readLine().orEmpty()
                        while (reader.readLine().let { it != null && it.isNotEmpty() }) { /* headers */ }
                        val raw = request.split(' ').getOrElse(1) { "/" }.substringBefore('?')
                        val path = URLDecoder.decode(raw.replace("+", "%2B"), "UTF-8")
                        val kids = tree[path]
                        val body = if (kids != null) {
                            "<html><body><h1>Index of $path</h1><pre><a href=\"../\">../</a>\n" + kids.joinToString("\n") { k ->
                                val enc = k.trimEnd('/').let { URLEncoder.encode(it, "UTF-8").replace("+", "%20") } + if (k.endsWith("/")) "/" else ""
                                "<a href=\"$enc\">$k</a>"
                            } + "</pre></body></html>"
                        } else "x"
                        val bytes = body.toByteArray()
                        val status = if (kids != null || !path.endsWith("/")) "200 OK" else "404 Not Found"
                        val out = so.getOutputStream()
                        out.write("HTTP/1.1 $status\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray())
                        out.write(bytes); out.flush()
                    }
                }
            }
        }
        val base = "http://127.0.0.1:${server.localPort}"
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        Prefs.saveServers(ctx, listOf("Movies 1080p | $base/m7/", "Movies | $base/m14/", "TV & Web Series | $base/tv/"), "", "")
        // Half-watched Oppenheimer (Continue watching) and Inside Out 2 saved in My List.
        val opp = "$base/m7/English%20Movies%20(1080p)/(2023)%201080p/Oppenheimer%20(2023)%201080p/Oppenheimer.2023.1080p.mkv"
        Prefs.savePosition(ctx, opp, 40 * 60_000L, 180 * 60_000L)
        Prefs.touchRecent(ctx, opp, "Oppenheimer.2023.1080p.mkv", keep = true)
        Prefs.toggleList(ctx, Entry("Inside Out 2 (2024) 1080p", "$base/m7/Animation%20Movies/Inside%20Out%202%20(2024)%201080p/", Kind.DIR))
    }

    @After fun tearDown() { server.close() }

    /** ExoPlayer waits for its own thread using the (fake) clock; keep that clock moving around player calls. */
    private fun <T> ticking(block: () -> T): T {
        val on = java.util.concurrent.atomic.AtomicBoolean(true)
        val t = thread(isDaemon = true) { while (on.get()) { org.robolectric.shadows.ShadowSystemClock.advanceBy(Duration.ofMillis(50)); Thread.sleep(10) } }
        try { return block() } finally { on.set(false); t.join() }
    }

    private fun pump(ms: Long = 40) { shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms)) }
    private fun pumpUntil(what: String, timeoutMs: Long = 20_000, cond: () -> Boolean): Boolean {
        val end = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < end) {
            pump()
            if (cond()) return true
            Thread.sleep(20)
        }
        check("timely: $what", false, "timed out")
        return false
    }

    private fun texts(v: View): List<String> = when (v) {
        is TextView -> listOf(v.text.toString())
        is ViewGroup -> (0 until v.childCount).flatMap { texts(v.getChildAt(it)) }
        else -> emptyList()
    }

    private fun shot(name: String, view: View, w: Int = 960) {
        try {
            if (view.width == 0) { view.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.AT_MOST)); view.layout(0, 0, view.measuredWidth, view.measuredHeight) }
            val full = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(Canvas(full))
            val small = Bitmap.createScaledBitmap(full, w, (full.height * w / full.width.toFloat()).toInt(), true)
            val out = ByteArrayOutputStream()
            small.compress(Bitmap.CompressFormat.JPEG, 62, out)
            val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            b64.chunked(6000).forEachIndexed { i, part -> println("SHOT:$name:$i:$part") }
            println("SHOT:$name:end")
        } catch (e: Throwable) { println("SHOT:$name:error:$e") }
    }

    @Test fun screens() {
        val main = Robolectric.buildActivity(MainActivity::class.java).setup()
        val act = main.get()
        val content = act.findViewById<RecyclerView>(R.id.content)
        val adapter = content.adapter as ScreenAdapter
        val nav = act.findViewById<LinearLayout>(R.id.nav)
        fun rows() = adapter.items.filterIsInstance<Item.Row>()
        fun navLabels() = (0 until nav.childCount).map { (nav.getChildAt(it) as TextView).text.toString() }

        // ---- Home: one Movies section, Continue watching, My List, slideshow
        // Only rows on screen load (like on the TV); the slideshow fetches the first categories itself.
        pumpUntil("home rows") { rows().isNotEmpty() }
        pumpUntil("slideshow", 8000) { adapter.items.firstOrNull() is Item.Hero && (adapter.items[0] as Item.Hero).slides.size >= 2 }
        pump(300)
        check("nav has one Movies section", navLabels() == listOf("Home", "Movies", "TV & Web Series", "My List"), navLabels())
        val titles = rows().map { it.title }
        check("home rows", titles.take(2) == listOf("Continue watching", "My List") && titles.count { it == "English Movies" } == 1 && "Hindi Movies" in titles && titles.none { "(1080p)" in it }, titles)
        val englishRow = kotlinx.coroutines.runBlocking { act.rowContent(rows().first { it.title == "English Movies" }) }
        check("rows joined: English Movies shows both servers' 2024", englishRow.first.map { Names.cleanTitle(it.name) }.toSet() == setOf("Dune Part Two", "Civil War", "Furiosa") && englishRow.second == "2024",
            englishRow.first.map { it.name } to englishRow.second)
        val hero = adapter.items.firstOrNull() as? Item.Hero
        check("slideshow has several titles", (hero?.slides?.size ?: 0) >= 2, hero?.slides?.map { it.entry.name })
        shot("home", act.window.decorView)
        val heroView = content.findViewHolderForAdapterPosition(0)?.itemView
        val before = heroView?.findViewById<TextView>(R.id.heroTitle)?.text?.toString()
        content.requestFocus(); act.findViewById<View>(R.id.settings).requestFocus() // focus away from the hero so it moves
        for (i in 0 until 90) pump(100)
        val after = heroView?.findViewById<TextView>(R.id.heroTitle)?.text?.toString()
        check("slideshow moves on by itself", before != null && after != null && before != after, "$before → $after")

        // ---- Movies section → English Movies → (2024): joined folders, Dune once with two versions
        (0 until nav.childCount).map { nav.getChildAt(it) as TextView }.first { it.text == "Movies" }.performClick()
        pumpUntil("Movies section") { rows().size >= 3 && adapter.items.firstOrNull() is Item.Panel }
        check("Movies section categories", rows().map { it.title } == listOf("Animation Movies", "English Movies", "Hindi Movies"), rows().map { it.title })
        val em = rows().first { it.title == "English Movies" }
        act.onOpenRow(em)
        pumpUntil("English Movies page") { rows().isNotEmpty() && (adapter.items.firstOrNull() as? Item.Panel)?.title == "English Movies" }
        check("year folders joined ((2023) is on one server only)", rows().map { it.title } == listOf("(2024)", "(2023) 1080p"), rows().map { it.title })
        act.onOpenRow(rows().first { it.title == "(2024)" })
        pumpUntil("2024 page") { adapter.items.count { it is Item.Card } >= 3 }
        val cards = adapter.items.filterIsInstance<Item.Card>().map { it.entry }
        check("2024 titles once each", cards.map { Names.cleanTitle(it.name) }.sorted() == listOf("Civil War", "Dune Part Two", "Furiosa"), cards.map { it.name })
        check("joined folder named after its best copy", cards.any { it.name == "Dune Part Two (2024) 1080p" }, cards.map { it.name })
        val panel = adapter.items.first() as Item.Panel
        check("breadcrumbs", panel.crumbs == "Home  ›  Movies  ›  English Movies", panel.crumbs)
        pump(500)
        shot("year", act.window.decorView)
        act.onOpen(cards.first { it.name.startsWith("Dune") })
        pumpUntil("quality choice") { ShadowDialog.getLatestDialog()?.isShowing == true }
        val dlg = ShadowDialog.getLatestDialog()
        val dlgTexts = dlg?.window?.decorView?.let { texts(it) }.orEmpty()
        check("Dune asks which quality", dlgTexts.any { "1080p" in it } && dlgTexts.any { "720p" in it }, dlgTexts)
        dlg?.window?.decorView?.let { shot("quality", it, 520) }
        dlg?.dismiss(); pump()

        // ---- options sheet: My List and Continue watching
        val furiosa = cards.first { it.name.startsWith("Furiosa") }
        act.onMenu(furiosa, "") {}
        pump()
        val sheet = ShadowDialog.getLatestDialog()
        val sheetTexts = sheet?.window?.decorView?.let { texts(it) }.orEmpty()
        check("options sheet offers My List", sheetTexts.any { "Add to My List" in it }, sheetTexts)
        sheet?.window?.decorView?.let { shot("sheet", it, 520) }
        (sheet?.window?.decorView as? ViewGroup)?.let { root -> findText(root, "+  Add to My List")?.performClick() }
        pump()
        check("added to My List", Prefs.inList(act, furiosa.url))

        // ---- Home again: My List row has Furiosa; remove Oppenheimer from Continue watching
        (0 until nav.childCount).map { nav.getChildAt(it) as TextView }.first { it.text == "Home" }.performClick()
        pumpUntil("home again") { rows().any { it.special == "mylist" } }
        check("My List row", rows().first { it.special == "mylist" }.entries.orEmpty().map { Names.cleanTitle(it.name) } == listOf("Furiosa", "Inside Out 2"),
            rows().first { it.special == "mylist" }.entries?.map { it.name })
        val opp = rows().first { it.special == "continue" }.entries!!.first()
        act.onMenu(opp, "continue") {}
        pump()
        (ShadowDialog.getLatestDialog()?.window?.decorView as? ViewGroup)?.let { findText(it, "↺  Remove from Continue watching")?.performClick() }
        pump(200)
        check("Continue watching removed", rows().none { it.special == "continue" } && Prefs.position(act, opp.url) == 0L, rows().map { it.title })

        // ---- mini player: Back from the player keeps it going in the corner
        val video = cards.first { it.name.startsWith("Civil") }
        val intent = Intent(act, PlayerActivity::class.java)
            .putExtra(PlayerActivity.EXTRA_URL, video.url + "Civil.War.2024.1080p.mkv")
            .putExtra(PlayerActivity.EXTRA_TITLE, "Civil War").putExtra(PlayerActivity.EXTRA_NAME, "Civil.War.2024.1080p.mkv")
        main.pause()
        val player = ticking { Robolectric.buildActivity(PlayerActivity::class.java, intent).setup() }
        pump(300)
        check("player started", Playback.player != null)
        player.get().dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK))
        player.get().dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK))
        check("Back finishes the full-screen player", player.get().isFinishing)
        main.resume()
        ticking { player.pause().stop().destroy() }
        pump(300)
        check("still playing after Back (minimized)", Playback.player != null)
        check("mini player shown", act.findViewById<View>(R.id.mini).visibility == View.VISIBLE)
        check("top bar offers Now playing / Stop", navLabels().containsAll(listOf("▶  Now playing", "■  Stop")), navLabels())
        shot("mini", act.window.decorView)
        (0 until nav.childCount).map { nav.getChildAt(it) as TextView }.first { it.text == "■  Stop" }.let { b -> ticking { b.performClick() } }
        pump()
        check("Stop ends playback", Playback.player == null && act.findViewById<View>(R.id.mini).visibility == View.GONE)

        // ---- episodes and covers
        (0 until nav.childCount).map { nav.getChildAt(it) as TextView }.first { it.text == "TV & Web Series" }.performClick()
        pumpUntil("TV section") { adapter.items.count { it is Item.Card } >= 2 }
        pump(400)
        shot("tv", act.window.decorView)

        println("RESULTS\n" + results.joinToString("\n"))
        assertTrue("failed checks:\n" + failures.joinToString("\n"), failures.isEmpty())
    }

    private fun findText(v: View, t: String): View? = when {
        v is TextView && v.text.toString().startsWith(t) -> v
        v is ViewGroup -> (0 until v.childCount).firstNotNullOfOrNull { findText(v.getChildAt(it), t) }
        else -> null
    }
}
