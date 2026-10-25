package com.moviehub.tv

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.content.res.ResourcesCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.net.URLDecoder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch

/** Netflix-style browser: Home shows a row per category of every library; folders show rows, posters or episodes. */
class MainActivity : ComponentActivity(), ScreenHost {
    private lateinit var content: RecyclerView
    private lateinit var status: TextView
    private lateinit var nav: LinearLayout
    private val adapter = ScreenAdapter(this)

    private var libraries: List<Library> = emptyList()
    private val roots = HashMap<Library, String>() // library -> folder shown as its top (after wrapper folders)

    /** null url = Home. */
    private data class Screen(val lib: Library?, val url: String?, var focus: Int = 0)
    private var current = Screen(null, null)
    private val stack = ArrayDeque<Screen>()
    private var loadJob: Job? = null
    private var heroShown = false

    override val scope: CoroutineScope get() = lifecycleScope

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        findViewById<View>(R.id.root).background = ParchmentDrawable(this)
        content = findViewById(R.id.content)
        status = findViewById(R.id.status)
        nav = findViewById(R.id.nav)
        findViewById<TextView>(R.id.logoMark).background =
            Ui.gradient(this, intArrayOf(0xFFB2323E.toInt(), Ui.MAROON, 0xFF3D0A0F.toInt()), 13f).apply { setStroke(Ui.dp(this@MainActivity, 2f), Ui.GOLD) }
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
    }

    override fun onResume() {
        super.onResume()
        val keyChanged = Meta.tmdbKey != Prefs.tmdbKey(this)
        Meta.tmdbKey = Prefs.tmdbKey(this)
        val servers = Prefs.servers(this)
        if (servers.isEmpty()) {
            libraries = emptyList(); adapter.submit(emptyList()); renderNav()
            showStatus(getString(R.string.no_server))
            startActivity(Intent(this, SettingsActivity::class.java))
            return
        }
        val libs = servers.map { Library(it, Prefs.username(this), Prefs.password(this)) }
        if (libs.map { it.root to it.authHeader + it.name } != libraries.map { it.root to it.authHeader + it.name }) {
            libraries = libs
            roots.clear(); Meta.clear(); stack.clear()
            show(Screen(null, null))
        } else if (keyChanged) {
            Meta.clear(); show(current) // posters from TMDB
        } else {
            adapter.notifyDataSetChanged() // progress bars
        }
    }

    // ---------- navigation ----------

    private fun show(screen: Screen) {
        current = screen
        loadJob?.cancel()
        renderNav()
        if (screen.url == null) showHome() else showFolder(screen.lib!!, screen.url)
    }

    private fun open(lib: Library, url: String) {
        current.focus = focusedPosition()
        stack.addLast(current)
        show(Screen(lib, url))
    }

    private fun focusedPosition(): Int {
        val f = content.focusedChild ?: return 0
        return content.getChildAdapterPosition(f).coerceAtLeast(0)
    }

    private fun renderNav() {
        nav.removeAllViews()
        val font = ResourcesCompat.getFont(this, R.font.plus_jakarta_sans)
        fun pill(label: String, selected: Boolean, onClick: () -> Unit) = TextView(this).apply {
            text = label
            typeface = font
            textSize = 16f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setTextColor(if (selected) Ui.GOLD2 else 0xFF6E5849.toInt())
            setPadding(Ui.dp(context, 18f), Ui.dp(context, 9f), Ui.dp(context, 18f), Ui.dp(context, 9f))
            setBackgroundResource(R.drawable.pill_nav)
            isSelected = selected
            isFocusable = true
            setOnClickListener { onClick() }
            setOnFocusChangeListener { v, has -> (v as TextView).setTextColor(if (has || v.isSelected) (if (v.isSelected) Ui.GOLD2 else Ui.MAROON) else 0xFF6E5849.toInt()) }
        }
        nav.background = Ui.rounded(this, 0xFFFFFCF7.toInt(), 999f, 0xFFEADBC8.toInt(), 1f)
        nav.setPadding(Ui.dp(this, 5f), Ui.dp(this, 5f), Ui.dp(this, 5f), Ui.dp(this, 5f))
        nav.addView(pill(getString(R.string.home), current.url == null) { stack.clear(); show(Screen(null, null)) })
        libraries.forEach { lib ->
            nav.addView(pill(lib.name, current.lib == lib) {
                stack.clear(); stack.addLast(Screen(null, null))
                scope.launch { show(Screen(lib, rootOf(lib))) }
            })
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

    /** A library's real top folder: lone wrapper folders like "DHAKA-FLIX-7/" are skipped. */
    private suspend fun rootOf(lib: Library): String {
        roots[lib]?.let { return it }
        var url = lib.root
        repeat(3) {
            val items = try { Meta.list(lib, url) } catch (e: Exception) { return url }
            val dirs = items.filter { it.kind == Kind.DIR }
            if (dirs.size != 1 || items.any { it.kind == Kind.VIDEO }) { roots[lib] = url; return url }
            url = dirs[0].url
        }
        roots[lib] = url
        return url
    }

    // ---------- screens ----------

    private fun showHome() {
        heroShown = false
        showStatus(getString(R.string.loading))
        adapter.submit(emptyList())
        loadJob = scope.launch {
            val items = mutableListOf<Item>()
            val recent = Prefs.recent(this@MainActivity).filter { libraryFor(it.first) != null }
            if (recent.isNotEmpty()) {
                items += Item.Row(getString(R.string.continue_watching), "", null, null, recent.map { Entry(it.second, it.first, Kind.VIDEO) })
            }
            val listings = libraries.map { lib -> async { lib to try { Meta.list(lib, rootOf(lib)) } catch (e: Exception) { null } } }.awaitAll()
            for ((lib, list) in listings) {
                if (list == null) continue
                val badge = if (libraries.size > 1) lib.name else ""
                if (Names.isCategoryFolder(list)) {
                    Names.sortCategories(list.filter { it.kind == Kind.DIR }).forEach { d -> items += Item.Row(d.name, badge, lib, d.url) }
                } else {
                    items += Item.Row(lib.name, "", lib, rootOf(lib))
                }
            }
            showStatus(if (items.isEmpty()) "Can’t reach your servers right now. Check Settings or your connection." else null)
            adapter.submit(items)
            restoreFocus(current.focus)
        }
    }

    private fun showFolder(lib: Library, url: String) {
        showStatus(getString(R.string.loading))
        adapter.submit(emptyList())
        loadJob = scope.launch {
            val list = try { Meta.list(lib, url) } catch (e: LibraryException) { showStatus(e.message); return@launch }
            val root = rootOf(lib)
            val rel = url.removePrefix(root).trimEnd('/').split('/').filter { it.isNotEmpty() }.map { decode(it) }
            val title = rel.lastOrNull() ?: lib.name
            val crumbs = (listOf(lib.name) + rel.dropLast(1)).joinToString("  ›  ")
            val dirs = list.filter { it.kind == Kind.DIR }
            val vids = list.filter { it.kind == Kind.VIDEO }
            val sub = listOfNotNull(dirs.size.takeIf { it > 0 }?.let { "$it folder" + if (it > 1) "s" else "" },
                vids.size.takeIf { it > 0 }?.let { "$it video" + if (it > 1) "s" else "" }).joinToString(" · ")
            val colors = Ui.PANELS[libraries.indexOf(lib).coerceAtLeast(0) % Ui.PANELS.size]
            val items = mutableListOf<Item>(Item.Panel(if (rel.isEmpty()) "" else crumbs, title, sub, colors))
            when {
                Names.isCategoryFolder(list) -> Names.sortCategories(dirs).forEach { items += Item.Row(it.name, "", lib, it.url) }
                dirs.isEmpty() && Names.isEpisodeList(vids) -> vids.forEachIndexed { i, v -> items += Item.Episode(v, lib, i) }
                else -> (dirs + vids).forEach { items += Item.Card(it, lib) }
            }
            showStatus(if (dirs.isEmpty() && vids.isEmpty()) getString(R.string.empty_folder) else null)
            adapter.submit(items)
            restoreFocus(if (current.focus > 0) current.focus else 1)
        }
    }

    // ---------- ScreenHost ----------

    override fun libraryFor(url: String) = libraries.firstOrNull { url.startsWith(it.root) }

    override fun progressOf(url: String): Float {
        val pos = Prefs.position(this, url)
        val dur = Prefs.duration(this, url)
        return if (pos > 30_000 && dur > 0) (pos.toFloat() / dur).coerceIn(0.02f, 1f) else 0f
    }

    /** A row shows a folder's titles; for a folder of years, the newest year's titles. */
    override suspend fun rowContent(row: Item.Row): Pair<List<Entry>, String> {
        val lib = row.lib ?: return (row.entries ?: emptyList()) to ""
        var items = Meta.list(lib, row.dirUrl!!).filter { it.kind == Kind.DIR || it.kind == Kind.VIDEO }
        var note = ""
        val dirs = items.filter { it.kind == Kind.DIR }
        if (dirs.isNotEmpty() && items.none { it.kind == Kind.VIDEO } && dirs.all { Names.isYearFolder(it.name) || !Names.isTitleFolder(it.name) }) {
            val newest = if (dirs.any { Names.isYearFolder(it.name) }) dirs.maxByOrNull { Names.yearOf(it.name) }!! else dirs[0]
            items = Meta.list(lib, newest.url).filter { it.kind == Kind.DIR || it.kind == Kind.VIDEO }
            note = newest.name.replace(Regex("[()\\[\\]]"), "").trim()
        }
        return items.take(40) to note
    }

    override fun onRowLoaded(row: Item.Row) {
        // Feature the first title of the first library row on Home, in the crimson panel.
        if (current.url != null || heroShown || row.lib == null) return
        val first = row.entries?.firstOrNull() ?: return
        heroShown = true
        adapter.insertAt(0, Item.Hero(first, row.lib))
    }

    override fun onOpenRow(row: Item.Row) {
        val lib = row.lib ?: return
        open(lib, row.dirUrl ?: return)
    }

    override fun onOpen(entry: Entry, lib: Library) {
        if (entry.kind == Kind.VIDEO) { play(lib, entry); return }
        scope.launch {
            val list = try { Meta.list(lib, entry.url) } catch (e: Exception) { null }
            val vids = list?.filter { it.kind == Kind.VIDEO }.orEmpty()
            val episodic = Regex("""\bseason\b|^s\d{1,2}$|\bseries\b""", RegexOption.IGNORE_CASE).containsMatchIn(entry.name) ||
                vids.any { Names.EPISODE.containsMatchIn(it.name) }
            // A folder holding just a movie plays it straight away.
            if (list != null && vids.isNotEmpty() && vids.size <= 3 && !episodic && list.none { it.kind == Kind.DIR }) {
                play(lib, vids.firstOrNull { !Regex("sample|trailer", RegexOption.IGNORE_CASE).containsMatchIn(it.name) } ?: vids[0], list)
            } else open(lib, entry.url)
        }
    }

    private fun play(lib: Library, e: Entry, folder: List<Entry>? = null) {
        scope.launch {
            val items = folder ?: try { Meta.list(lib, e.url.substringBeforeLast('/') + "/") } catch (x: Exception) { emptyList() }
            val stem = Names.stem(e.name)
            val subs = items.filter { it.kind == Kind.SUB }.sortedBy { !it.name.startsWith(stem, ignoreCase = true) }
            val title = Meta.of(lib, e).title
            startActivity(
                Intent(this@MainActivity, PlayerActivity::class.java)
                    .putExtra(PlayerActivity.EXTRA_URL, e.url)
                    .putExtra(PlayerActivity.EXTRA_TITLE, title)
                    .putExtra(PlayerActivity.EXTRA_NAME, e.name)
                    .putStringArrayListExtra(PlayerActivity.EXTRA_SUB_URLS, ArrayList(subs.map { it.url }))
                    .putStringArrayListExtra(PlayerActivity.EXTRA_SUB_NAMES, ArrayList(subs.map { it.name }))
                    .putExtra(PlayerActivity.EXTRA_AUTH, lib.authHeader)
            )
        }
    }

    private fun decode(p: String) = try { URLDecoder.decode(p.replace("+", "%2B"), "UTF-8") } catch (e: Exception) { p }

    companion object {
        private const val SPAN = 6
    }
}
