package com.moviehub.tv

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.annotation.OptIn
import androidx.core.content.res.ResourcesCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/**
 * Netflix-style browser. Home: Continue watching, My List, then a row per category of every section. Libraries
 * whose names differ only by quality ("Movies", "Movies 1080p") are one section, their same-named folders joined.
 */
@OptIn(UnstableApi::class)
class MainActivity : ComponentActivity(), ScreenHost {
    private lateinit var content: RecyclerView
    private lateinit var status: TextView
    private lateinit var nav: LinearLayout
    private lateinit var mini: View
    private lateinit var miniPlayer: PlayerView
    private val adapter = ScreenAdapter(this)

    private var libraries: List<Library> = emptyList()
    private class Group(val name: String, val libs: List<Library>)
    private var groups: List<Group> = emptyList()
    private val roots = HashMap<Library, String>() // library -> folder shown as its top (after wrapper folders)

    /** [dir] null = Home, or My List when [special] is "mylist". */
    private data class Screen(val dir: Entry?, val special: String = "", var focus: Int = 0)
    private var current = Screen(null)
    private val stack = ArrayDeque<Screen>()
    private var loadJob: Job? = null
    private var hero: Item.Hero? = null
    private val heroQueue = ArrayList<Entry>()
    private var heroBusy = false
    private var launchingPlayer = false

    override val scope: CoroutineScope get() = lifecycleScope

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        findViewById<View>(R.id.root).background = ParchmentDrawable(this)
        content = findViewById(R.id.content)
        status = findViewById(R.id.status)
        nav = findViewById(R.id.nav)
        mini = findViewById(R.id.mini)
        miniPlayer = findViewById(R.id.miniPlayer)
        mini.background = Ui.rounded(this, 0xFF1E0A0C.toInt(), 18f, Ui.GOLD2, 3f)
        mini.clipToOutline = true
        miniPlayer.subtitleView?.visibility = View.GONE
        findViewById<TextView>(R.id.logoTv).background = Ui.gradient(this, intArrayOf(Ui.PINK, Ui.MAROON2), 7f)

        val grid = GridLayoutManager(this, SPAN)
        grid.spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
            override fun getSpanSize(position: Int) = adapter.spanOf(position, SPAN)
        }
        content.layoutManager = grid
        content.adapter = adapter
        content.itemAnimator = null
        findViewById<ImageButton>(R.id.settings).apply {
            setOnClickListener { startActivity(Intent(this@MainActivity, SettingsActivity::class.java)) }
            Ui.focusZoom(this, 1.1f)
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val back = stack.removeLastOrNull()
                if (back != null) show(back) else finish()
            }
        })
        Playback.onStopped += miniStopped
    }

    override fun onDestroy() {
        super.onDestroy()
        Playback.onStopped -= miniStopped
    }

    override fun onResume() {
        super.onResume()
        launchingPlayer = false
        updateMini()
        val keyChanged = Meta.tmdbKey != Prefs.tmdbKey(this)
        Meta.tmdbKey = Prefs.tmdbKey(this)
        val servers = Prefs.servers(this)
        if (servers.isEmpty()) {
            libraries = emptyList(); groups = emptyList(); adapter.submit(emptyList()); renderNav()
            showStatus(getString(R.string.no_server))
            startActivity(Intent(this, SettingsActivity::class.java))
            return
        }
        val libs = servers.map { Library(it, Prefs.username(this), Prefs.password(this)) }
        if (libs.map { it.root to it.authHeader + it.name } != libraries.map { it.root to it.authHeader + it.name }) {
            libraries = libs
            groups = libs.groupBy { Merge.groupKey(it.name) }.values.map { g -> Group(g.minByOrNull { it.name.length }!!.name, g) }
            roots.clear(); Meta.clear(); stack.clear()
            show(Screen(null))
        } else if (keyChanged) {
            Meta.clear(); show(current) // posters from TMDB
        } else {
            refreshAfterPlayback()
        }
    }

    override fun onStop() {
        super.onStop()
        if (miniPlayer.player != null) miniPlayer.player = null
        // Leaving the app (Home button, or Back out of it) stops the video; opening the player does not.
        if (!launchingPlayer && !isChangingConfigurations) Playback.stop(this)
    }

    // ---------- mini player ----------

    private val miniStopped: () -> Unit = { updateMini(); renderNav() }

    private fun updateMini() {
        val p = Playback.player
        mini.visibility = if (p != null) View.VISIBLE else View.GONE
        if (p != null) {
            if (miniPlayer.player !== p) miniPlayer.player = p
            findViewById<TextView>(R.id.miniTitle).text = Playback.title.ifEmpty { Names.cleanTitle(Playback.fileName) }
        } else miniPlayer.player = null
        renderNav()
    }

    private fun expandPlayer() {
        val args = Playback.args ?: return
        launchingPlayer = true
        miniPlayer.player = null
        startActivity(Intent(this, PlayerActivity::class.java).putExtras(args))
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val p = Playback.player
        if (p != null && event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> { p.playWhenReady = !p.playWhenReady; return true }
                KeyEvent.KEYCODE_MEDIA_PLAY -> { p.playWhenReady = true; return true }
                KeyEvent.KEYCODE_MEDIA_PAUSE -> { p.playWhenReady = false; return true }
                KeyEvent.KEYCODE_MEDIA_STOP -> { Playback.stop(this); return true }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    // ---------- navigation ----------

    private fun show(screen: Screen) {
        current = screen
        loadJob?.cancel()
        renderNav()
        when {
            screen.special == "mylist" -> showMyList()
            screen.dir == null -> showHome()
            else -> showFolder(screen.dir)
        }
    }

    private fun open(dir: Entry) {
        current.focus = focusedPosition()
        stack.addLast(current)
        show(Screen(dir))
    }

    private fun focusedPosition(): Int {
        val f = content.focusedChild ?: return 0
        return content.getChildAdapterPosition(f).coerceAtLeast(0)
    }

    private fun renderNav() {
        nav.removeAllViews()
        val font = ResourcesCompat.getFont(this, R.font.plus_jakarta_sans)
        fun pill(label: String, selected: Boolean, accent: Boolean = false, onClick: () -> Unit) = TextView(this).apply {
            text = label
            typeface = font
            textSize = 16f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            val rest = if (accent) Ui.MAROON2 else 0xFF6E5849.toInt()
            setTextColor(if (selected) Ui.GOLD2 else rest)
            setPadding(Ui.dp(context, 18f), Ui.dp(context, 9f), Ui.dp(context, 18f), Ui.dp(context, 9f))
            setBackgroundResource(R.drawable.pill_nav)
            isSelected = selected
            isFocusable = true
            setOnClickListener { onClick() }
            setOnFocusChangeListener { v, has -> (v as TextView).setTextColor(if (has || v.isSelected) (if (v.isSelected) Ui.GOLD2 else Ui.MAROON) else rest) }
        }
        nav.background = Ui.rounded(this, 0xFFFFFCF7.toInt(), 999f, 0xFFEADBC8.toInt(), 1f)
        nav.setPadding(Ui.dp(this, 5f), Ui.dp(this, 5f), Ui.dp(this, 5f), Ui.dp(this, 5f))
        val home = current.dir == null && current.special.isEmpty()
        nav.addView(pill(getString(R.string.home), home) { stack.clear(); show(Screen(null)) })
        val curGroup = current.dir?.let { groupOf(it) }
        groups.forEach { g ->
            nav.addView(pill(g.name, curGroup == g) {
                stack.clear(); stack.addLast(Screen(null))
                scope.launch { show(Screen(groupRoot(g))) }
            })
        }
        nav.addView(pill(getString(R.string.my_list), current.special == "mylist") { stack.clear(); stack.addLast(Screen(null)); show(Screen(null, "mylist")) })
        if (Playback.player != null) {
            nav.addView(pill("▶  Now playing", false, accent = true) { expandPlayer() })
            nav.addView(pill("■  Stop", false, accent = true) { Playback.stop(this) })
        }
    }

    private fun showStatus(msg: String?) {
        status.text = msg.orEmpty()
        status.visibility = if (msg.isNullOrEmpty()) View.GONE else View.VISIBLE
    }

    private fun restoreFocus(pos: Int) {
        content.post {
            content.scrollToPosition(pos)
            content.post { (content.findViewHolderForAdapterPosition(pos)?.itemView ?: content.getChildAt(0))?.requestFocus() }
        }
    }

    // ---------- sections and folders ----------

    /** A library's real top folder: lone wrapper folders like "DHAKA-FLIX-7/" are skipped (a lone "English Movies" is kept). */
    private suspend fun rootOf(lib: Library): String {
        roots[lib]?.let { return it }
        var url = lib.root
        repeat(3) {
            val items = try { Meta.list(lib, url) } catch (e: Exception) { return url }
            val dirs = items.filter { it.kind == Kind.DIR }
            if (dirs.size != 1 || items.any { it.kind == Kind.VIDEO } || dirs[0].name.any { c -> c.isWhitespace() }) { roots[lib] = url; return url }
            url = dirs[0].url
        }
        roots[lib] = url
        return url
    }

    private suspend fun groupRoot(g: Group): Entry {
        val urls = coroutineScope { g.libs.map { async { rootOf(it) } }.awaitAll() }
        return Entry(g.name, urls[0], Kind.DIR, urls)
    }

    private fun groupOf(e: Entry): Group? = libraryFor(e.url)?.let { lib -> groups.firstOrNull { lib in it.libs } }

    /** A folder's entries; a joined folder lists every library's copy and merges them. */
    private suspend fun listDir(dir: Entry): List<Entry> {
        if (dir.sources.size <= 1) {
            val lib = libraryFor(dir.url) ?: throw LibraryException("Unknown server")
            return Meta.list(lib, dir.url)
        }
        val got = coroutineScope {
            dir.sources.map { u ->
                async {
                    val lib = libraryFor(u) ?: return@async null
                    try { Meta.list(lib, u) to lib.name } catch (e: Exception) { null }
                }
            }.awaitAll()
        }.filterNotNull()
        if (got.isEmpty()) throw LibraryException("Can’t reach these servers right now")
        return Merge.merge(got)
    }

    // ---------- screens ----------

    private fun specialRows(): List<Item.Row> {
        val rows = mutableListOf<Item.Row>()
        val recent = Prefs.recent(this).filter { libraryFor(it.first) != null }
        if (recent.isNotEmpty()) rows += Item.Row(getString(R.string.continue_watching), "", null, recent.map { Entry(it.second, it.first, Kind.VIDEO) }, "continue")
        val saved = Prefs.myList(this).filter { libraryFor(it.url) != null }
        if (saved.isNotEmpty()) rows += Item.Row(getString(R.string.my_list), "", null, saved, "mylist")
        return rows
    }

    private fun showHome() {
        hero = null; heroQueue.clear(); heroBusy = false
        showStatus(getString(R.string.loading))
        adapter.submit(emptyList())
        loadJob = scope.launch {
            val items = mutableListOf<Item>()
            items += specialRows()
            val sections = groups.map { g -> async { g to try { groupRoot(g).let { it to listDir(it) } } catch (e: Exception) { null } } }.awaitAll()
            for ((g, got) in sections) {
                val (root, list) = got ?: continue
                val badge = if (groups.size > 1) g.name else ""
                if (Names.isCategoryFolder(list)) {
                    Names.sortCategories(list.filter { it.kind == Kind.DIR }).forEach { d -> items += Item.Row(d.name, badge, d) }
                } else {
                    items += Item.Row(g.name, "", root)
                }
            }
            showStatus(if (items.isEmpty()) "Can’t reach your servers right now. Check Settings or your connection." else null)
            adapter.submit(items)
            restoreFocus(current.focus)
            heroOffer(Prefs.myList(this@MainActivity).take(6))
        }
    }

    private fun showMyList() {
        val saved = Prefs.myList(this).filter { libraryFor(it.url) != null }
        val items = mutableListOf<Item>(Item.Panel("Home", getString(R.string.my_list), if (saved.isEmpty()) "" else "${saved.size} saved for later", Ui.PANELS[4]))
        saved.forEach { items += Item.Card(it) }
        showStatus(if (saved.isEmpty()) "Nothing saved yet. Hold OK on any poster (or press Menu) and choose “Add to My List”." else null)
        adapter.submit(items)
        restoreFocus(if (current.focus > 0) current.focus else 1)
    }

    private fun showFolder(dir: Entry) {
        showStatus(getString(R.string.loading))
        adapter.submit(emptyList())
        loadJob = scope.launch {
            val list = try { listDir(dir) } catch (e: LibraryException) { showStatus(e.message); return@launch }
            val trail = stack.mapNotNull { it.dir?.name }
            val title = dir.name
            val crumbs = (listOf(getString(R.string.home)) + trail).joinToString("  ›  ")
            val dirs = list.filter { it.kind == Kind.DIR }
            val vids = list.filter { it.kind == Kind.VIDEO }
            val sub = listOfNotNull(dirs.size.takeIf { it > 0 }?.let { "$it folder" + if (it > 1) "s" else "" },
                vids.size.takeIf { it > 0 }?.let { "$it video" + if (it > 1) "s" else "" }).joinToString(" · ")
            val colors = Ui.PANELS[groups.indexOf(groupOf(dir)).coerceAtLeast(0) % Ui.PANELS.size]
            val items = mutableListOf<Item>(Item.Panel(crumbs, title, sub, colors))
            when {
                Names.isCategoryFolder(list) -> Names.sortCategories(dirs).forEach { items += Item.Row(it.name, "", it) }
                dirs.isEmpty() && Names.isEpisodeList(vids) -> vids.forEachIndexed { i, v -> items += Item.Episode(v, i) }
                else -> (dirs + vids).forEach { items += Item.Card(it) }
            }
            showStatus(if (dirs.isEmpty() && vids.isEmpty()) getString(R.string.empty_folder) else null)
            adapter.submit(items)
            restoreFocus(if (current.focus > 0) current.focus else 1)
        }
    }

    /** After watching, or after the options sheet: progress bars, Continue watching and My List rows. */
    private fun refreshAfterPlayback() {
        if (current.dir != null || current.special.isNotEmpty()) {
            if (current.special == "mylist") show(current) else adapter.notifyDataSetChanged()
            return
        }
        val fresh = specialRows().associateBy { it.special }
        for (kind in listOf("continue", "mylist")) {
            val pos = adapter.items.indexOfFirst { it is Item.Row && it.special == kind }
            val row = fresh[kind]
            when {
                pos >= 0 && row == null -> adapter.removeAt(pos)
                pos >= 0 && row != null -> { (adapter.items[pos] as Item.Row).entries = row.entries; adapter.notifyItemChanged(pos) }
                pos < 0 && row != null -> {
                    val after = adapter.items.indexOfLast { it is Item.Hero || (it is Item.Row && it.special == "continue") }
                    adapter.insertAt(after + 1, row)
                }
            }
        }
    }

    // ---------- featured slideshow ----------

    /** Each row offers a few random titles; ones with a backdrop or poster make the slides. */
    private fun heroOffer(entries: List<Entry>) {
        if (current.dir != null || current.special.isNotEmpty() || entries.isEmpty()) return
        heroQueue += entries.filter { it.kind == Kind.DIR || it.kind == Kind.VIDEO }.take(12).shuffled().take(3)
        if (heroBusy) return
        heroBusy = true
        val screen = current
        scope.launch(kotlinx.coroutines.Dispatchers.Main) {
            val plain = ArrayList<Item.Slide>()
            try {
                while (heroQueue.isNotEmpty() && (hero?.slides?.size ?: 0) < HERO_MAX && current === screen) {
                    val e = heroQueue.removeAt(0)
                    if (hero?.slides?.any { it.entry.url == e.url } == true) continue
                    val lib = libraryFor(e.url) ?: continue
                    val info = Meta.of(lib, e)
                    if (current !== screen) return@launch
                    if (info.backdrop != null || info.poster != null) addSlide(Item.Slide(e, info)) else plain += Item.Slide(e, info)
                }
                while ((hero?.slides?.size ?: 0) < 3 && plain.isNotEmpty() && current === screen) addSlide(plain.removeAt(0))
            } finally { heroBusy = false }
        }
    }

    private fun addSlide(s: Item.Slide) {
        val h = hero ?: Item.Hero().also { hero = it; adapter.insertAt(0, it) }
        h.slides += s
        h.onAdded?.invoke()
    }

    // ---------- ScreenHost ----------

    override fun libraryFor(url: String) = libraries.firstOrNull { url.startsWith(it.root) }

    override fun sectionName(entry: Entry) = groupOf(entry)?.name ?: libraryFor(entry.url)?.name.orEmpty()

    private fun progressOfUrl(url: String): Float {
        val pos = Prefs.position(this, url)
        val dur = Prefs.duration(this, url)
        return if (pos > 30_000 && dur > 0) (pos.toFloat() / dur).coerceIn(0.02f, 1f) else 0f
    }

    override fun progressOf(entry: Entry) = (listOf(entry.url) + entry.versions.map { it.url }).maxOf { progressOfUrl(it) }
    override fun watched(entry: Entry) = (listOf(entry.url) + entry.versions.map { it.url }).any { Prefs.watched(this, it) }
    override fun inList(entry: Entry) = Prefs.inList(this, entry.url)

    /** A row shows a folder's titles; for a folder of years, the newest year's titles. */
    override suspend fun rowContent(row: Item.Row): Pair<List<Entry>, String> {
        val dir = row.dir ?: return (row.entries ?: emptyList()) to ""
        var items = listDir(dir).filter { it.kind == Kind.DIR || it.kind == Kind.VIDEO }
        var note = ""
        val dirs = items.filter { it.kind == Kind.DIR }
        if (dirs.isNotEmpty() && items.none { it.kind == Kind.VIDEO } && dirs.all { Names.isYearFolder(it.name) || !Names.isTitleFolder(it.name) }) {
            val newest = if (dirs.any { Names.isYearFolder(it.name) }) dirs.maxByOrNull { Names.yearOf(it.name) }!! else dirs[0]
            items = listDir(newest).filter { it.kind == Kind.DIR || it.kind == Kind.VIDEO }
            note = newest.name.replace(Regex("[()\\[\\]]"), "").trim()
        }
        return items.take(40) to note
    }

    override fun onRowLoaded(row: Item.Row) {
        if (row.dir != null) heroOffer(row.entries.orEmpty())
    }

    override fun onOpenRow(row: Item.Row) {
        if (row.special == "mylist") { current.focus = focusedPosition(); stack.addLast(current); show(Screen(null, "mylist")); return }
        open(row.dir ?: return)
    }

    override fun onOpen(entry: Entry) {
        if (entry.kind == Kind.VIDEO) { play(entry); return }
        scope.launch {
            val list = try { listDir(entry) } catch (e: Exception) { null }
            val main = movieIn(entry, list)
            if (main != null) play(main, list) else open(entry)
        }
    }

    /** A folder holding just a movie (not a season) plays it straight away. */
    private fun movieIn(dir: Entry, list: List<Entry>?): Entry? {
        val vids = list?.filter { it.kind == Kind.VIDEO }.orEmpty()
        val episodic = Regex("""\bseason\b|^s\d{1,2}$|\bseries\b""", RegexOption.IGNORE_CASE).containsMatchIn(dir.name) ||
            vids.any { Names.EPISODE.containsMatchIn(it.name) }
        if (list == null || vids.isEmpty() || vids.size > 3 || episodic || list.any { it.kind == Kind.DIR }) return null
        return vids.firstOrNull { !Regex("sample|trailer", RegexOption.IGNORE_CASE).containsMatchIn(it.name) } ?: vids[0]
    }

    private fun fmtTime(ms: Long): String {
        val s = ms / 1000; val h = s / 3600; val m = (s % 3600) / 60
        return if (h > 0) "$h:${"%02d".format(m)}:${"%02d".format(s % 60)}" else "$m:${"%02d".format(s % 60)}"
    }

    /** One copy plays at once; several (1080p, 720p…) ask which, starting with the one being watched. */
    private fun play(e: Entry, folder: List<Entry>? = null) {
        if (e.versions.size < 2) { playFile(e.url, e.name, folder.takeIf { e.versions.isEmpty() }); return }
        val title = Names.cleanTitle(e.name)
        val versions = e.versions.sortedByDescending { progressOfUrl(it.url) }
        Sheet.show(this, title, "Choose quality", versions.map { v ->
            val pos = Prefs.position(this, v.url)
            Sheet.Option(if (pos > 30_000) "▶  Resume ${v.quality} from ${fmtTime(pos)}" else "▶  Play ${v.quality}", v.name) { playFile(v.url, v.name, null) }
        })
    }

    private fun playFile(url: String, name: String, folder: List<Entry>?) {
        val lib = libraryFor(url) ?: return
        if (Playback.isActive(url)) { expandPlayer(); return }
        scope.launch {
            val items = folder ?: try { Meta.list(lib, url.substringBeforeLast('/') + "/") } catch (x: Exception) { emptyList() }
            val stem = Names.stem(name)
            val subs = items.filter { it.kind == Kind.SUB }.sortedBy { !it.name.startsWith(stem, ignoreCase = true) }
            val title = Meta.of(lib, Entry(name, url, Kind.VIDEO)).title
            launchingPlayer = true
            miniPlayer.player = null
            startActivity(
                Intent(this@MainActivity, PlayerActivity::class.java)
                    .putExtra(PlayerActivity.EXTRA_URL, url)
                    .putExtra(PlayerActivity.EXTRA_TITLE, title)
                    .putExtra(PlayerActivity.EXTRA_NAME, name)
                    .putStringArrayListExtra(PlayerActivity.EXTRA_SUB_URLS, ArrayList(subs.map { it.url }))
                    .putStringArrayListExtra(PlayerActivity.EXTRA_SUB_NAMES, ArrayList(subs.map { it.name }))
                    .putExtra(PlayerActivity.EXTRA_AUTH, lib.authHeader)
            )
        }
    }

    /** Hold OK (or Menu) on a title: play a version, add to / remove from My List, remove progress. */
    override fun onMenu(entry: Entry, special: String, changed: () -> Unit) {
        val opts = mutableListOf<Sheet.Option>()
        val urls = listOf(entry.url) + entry.versions.map { it.url }
        if (special != "hero") {
            if (entry.versions.size > 1) entry.versions.forEach { v -> opts += Sheet.Option("▶  Play ${v.quality}", v.name) { playFile(v.url, v.name, null) } }
            else opts += Sheet.Option(if (entry.kind == Kind.DIR) "▶  Open" else "▶  Play") { onOpen(entry) }
        }
        val listed = inList(entry)
        opts += Sheet.Option(if (listed) "✓  Remove from My List" else "+  Add to My List") {
            Prefs.toggleList(this, entry); changed(); refreshAfterPlayback()
        }
        val started = urls.any { Prefs.position(this, it) > 0 || Prefs.recent(this).any { r -> r.first == it } }
        val done = urls.any { Prefs.watched(this, it) }
        if (started || special == "continue") opts += Sheet.Option("↺  Remove from Continue watching", "Forgets where you stopped") {
            urls.forEach { Prefs.forget(this, it) }; changed(); refreshAfterPlayback()
        } else if (done) opts += Sheet.Option("↺  Mark as unwatched") {
            urls.forEach { Prefs.forget(this, it) }; changed(); refreshAfterPlayback()
        }
        val sub = listOfNotNull(Names.yearIn(entry.name), entry.versions.takeIf { it.size > 1 }?.joinToString(" · ") { it.quality }, sectionName(entry).ifEmpty { null }).joinToString("  ·  ")
        Sheet.show(this, Names.cleanTitle(entry.name), sub, opts)
    }

    companion object {
        private const val SPAN = 6
        private const val HERO_MAX = 8
    }
}
