package com.moviehub.tv

import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.request.Disposable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** Everything on a browse screen is one of these, shown by [ScreenAdapter]. */
sealed class Item {
    class Hero(val entry: Entry, val lib: Library) : Item()
    class Panel(val crumbs: String, val title: String, val sub: String, val colors: IntArray) : Item()
    /** A horizontal row of posters: either fixed entries or the (lazily loaded) contents of [dirUrl]. */
    class Row(val title: String, val badge: String, val lib: Library?, val dirUrl: String?, var entries: List<Entry>? = null) : Item() {
        var note = ""
        var loading = false
        var failed = false
    }
    class Card(val entry: Entry, val lib: Library) : Item()
    class Episode(val entry: Entry, val lib: Library, val index: Int) : Item()
}

interface ScreenHost {
    val scope: CoroutineScope
    fun libraryFor(url: String): Library?
    fun onOpen(entry: Entry, lib: Library)
    fun onOpenRow(row: Item.Row)
    fun progressOf(url: String): Float
    suspend fun rowContent(row: Item.Row): Pair<List<Entry>, String>
    fun onRowLoaded(row: Item.Row)
}

class ScreenAdapter(private val host: ScreenHost) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
    var items: List<Item> = emptyList()
        private set
    private val sharedPool = RecyclerView.RecycledViewPool()

    fun submit(list: List<Item>) { items = list; notifyDataSetChanged() }
    fun insertAt(index: Int, item: Item) { items = items.toMutableList().apply { add(index, item) }; notifyItemInserted(index) }

    override fun getItemCount() = items.size
    override fun getItemViewType(position: Int) = when (items[position]) {
        is Item.Hero -> 0; is Item.Panel -> 1; is Item.Row -> 2; is Item.Card -> 3; is Item.Episode -> 4
    }

    /** Cards sit in a grid; everything else spans the full width. */
    fun spanOf(position: Int, spanCount: Int) = if (items.getOrNull(position) is Item.Card) 1 else spanCount

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inf = LayoutInflater.from(parent.context)
        return when (viewType) {
            0 -> HeroVH(inf.inflate(R.layout.item_hero, parent, false))
            1 -> PanelVH(inf.inflate(R.layout.item_panel, parent, false))
            2 -> RowVH(inf.inflate(R.layout.item_row, parent, false))
            3 -> CardVH(inf.inflate(R.layout.item_card, parent, false))
            else -> EpisodeVH(inf.inflate(R.layout.item_episode, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val it = items[position]) {
            is Item.Hero -> (holder as HeroVH).bind(it)
            is Item.Panel -> (holder as PanelVH).bind(it)
            is Item.Row -> (holder as RowVH).bind(it)
            is Item.Card -> (holder as CardVH).bind(it.entry, it.lib, host)
            is Item.Episode -> (holder as EpisodeVH).bind(it)
        }
    }

    inner class HeroVH(v: View) : RecyclerView.ViewHolder(v) {
        private val art: ImageView = v.findViewById(R.id.heroArt)
        private val title: TextView = v.findViewById(R.id.heroTitle)
        private val meta: TextView = v.findViewById(R.id.heroMeta)
        private val play: TextView = v.findViewById(R.id.heroPlay)
        init {
            val ctx = v.context
            v.background = Ui.gradient(ctx, Ui.PANELS[0], 30f, GradientDrawable.Orientation.LEFT_RIGHT)
            v.clipToOutline = true
            v.findViewById<TextView>(R.id.eyebrow).background = Ui.rounded(ctx, 0x14F5CF5B, 999f, 0x8CF5CF5B.toInt(), 1.5f)
            Ui.focusZoom(play, 1.06f)
        }
        fun bind(h: Item.Hero) {
            title.text = Names.displayTitle(h.entry)
            meta.text = h.lib.name
            art.setImageDrawable(null)
            host.scope.launch {
                val m = Meta.of(h.lib, h.entry)
                if (m.year != null) meta.text = "${m.year}  ·  ${h.lib.name}"
                m.poster?.let { p -> art.load(p) { crossfade(true); authFor(p, h.lib)?.let { a -> addHeader("Authorization", a) } } }
            }
            play.setOnClickListener { host.onOpen(h.entry, h.lib) }
        }
    }

    inner class PanelVH(v: View) : RecyclerView.ViewHolder(v) {
        fun bind(p: Item.Panel) {
            itemView.background = Ui.gradient(itemView.context, p.colors, 26f, GradientDrawable.Orientation.LEFT_RIGHT)
            itemView.findViewById<TextView>(R.id.crumbs).text = p.crumbs
            itemView.findViewById<TextView>(R.id.title).text = p.title
            itemView.findViewById<TextView>(R.id.sub).text = p.sub
        }
    }

    inner class RowVH(v: View) : RecyclerView.ViewHolder(v) {
        private val head: LinearLayout = v.findViewById(R.id.rowHead)
        private val icon: ImageView = v.findViewById(R.id.rowIcon)
        private val title: TextView = v.findViewById(R.id.rowTitle)
        private val badge: TextView = v.findViewById(R.id.rowBadge)
        private val list: RecyclerView = v.findViewById(R.id.rowList)
        private val cards = CardsAdapter(host)
        init {
            list.layoutManager = LinearLayoutManager(v.context, LinearLayoutManager.HORIZONTAL, false)
            list.adapter = cards
            list.setRecycledViewPool(sharedPool)
            list.itemAnimator = null
        }
        fun bind(r: Item.Row) {
            val ctx = itemView.context
            title.text = r.title
            icon.setImageResource(if (r.dirUrl == null && r.lib == null) R.drawable.ic_play else Ui.rowIcon(r.title))
            icon.background = Ui.rounded(ctx, if (r.lib == null) Ui.GOLD else Ui.tileColor(r.title), 12f)
            val b = listOf(r.badge, r.note.let { if (it.isNotEmpty()) "Newest · $it" else "" }).filter { it.isNotEmpty() }.joinToString("  ·  ")
            badge.text = b
            badge.visibility = if (b.isEmpty()) View.GONE else View.VISIBLE
            badge.background = Ui.rounded(ctx, 0x17A3242F, 999f)
            head.isFocusable = r.dirUrl != null
            head.setOnClickListener { host.onOpenRow(r) }
            val entries = r.entries
            cards.submit(entries.orEmpty().map { it to (r.lib ?: host.libraryFor(it.url)) }.filter { it.second != null }.map { it.first to it.second!! })
            if (entries == null && !r.loading && !r.failed) {
                r.loading = true
                host.scope.launch {
                    try {
                        val (got, note) = host.rowContent(r)
                        r.entries = got; r.note = note
                    } catch (e: Exception) {
                        r.failed = true; r.entries = emptyList()
                    }
                    r.loading = false
                    val pos = items.indexOf(r)
                    if (pos >= 0) notifyItemChanged(pos)
                    host.onRowLoaded(r)
                }
            }
        }
    }

    inner class EpisodeVH(v: View) : RecyclerView.ViewHolder(v) {
        fun bind(e: Item.Episode) {
            val ctx = itemView.context
            val num: TextView = itemView.findViewById(R.id.num)
            num.text = Names.episodeNumber(e.entry.name, e.index).toString()
            num.background = Ui.gradient(ctx, intArrayOf(Ui.MAROON2, Ui.MAROON), 14f)
            itemView.findViewById<TextView>(R.id.title).text = episodeTitle(e.entry.name, e.index)
            val p = host.progressOf(e.entry.url)
            itemView.findViewById<TextView>(R.id.sub).text = if (p > 0f) "Resume · ${(p * 100).toInt()}% watched" else Names.stem(e.entry.name)
            itemView.setOnClickListener { host.onOpen(e.entry, e.lib) }
            Ui.focusZoom(itemView, 1.02f)
        }
    }

    private fun episodeTitle(name: String, i: Int): String {
        val s = Names.stem(name).replace(Regex("[._]+"), " ")
        val m = Regex("""\bS\d{1,2} ?E\d{1,3}\b\s*[-–:]?\s*(.*)$""", RegexOption.IGNORE_CASE).find(s)
        val rest = m?.groupValues?.get(1)?.replace(Regex("""\b(2160p|1080p|720p|480p|web.?dl|webrip|bluray|hdtv|x26[45]|h ?26[45]|hevc|aac|10bit).*$""", RegexOption.IGNORE_CASE), "")?.trim()
        return if (!rest.isNullOrEmpty() && rest.length > 2) rest else "Episode ${Names.episodeNumber(name, i)}"
    }

    companion object {
        /** Send the server login only to the server itself, never to TMDB. */
        fun authFor(url: String, lib: Library): String? =
            if (url.startsWith(lib.root.split('/').take(3).joinToString("/") + "/")) lib.authHeader else null
    }
}

/** Posters in a row. */
class CardsAdapter(private val host: ScreenHost) : RecyclerView.Adapter<CardVH>() {
    private var items: List<Pair<Entry, Library>> = emptyList()
    fun submit(list: List<Pair<Entry, Library>>) { items = list; notifyDataSetChanged() }
    override fun getItemCount() = items.size
    override fun getItemViewType(position: Int) = 3
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = CardVH(LayoutInflater.from(parent.context).inflate(R.layout.item_card, parent, false))
    override fun onBindViewHolder(holder: CardVH, position: Int) { val (e, lib) = items[position]; holder.bind(e, lib, host) }
}

class CardVH(v: View) : RecyclerView.ViewHolder(v) {
    private val art: View = v.findViewById(R.id.art)
    private val ph: TextView = v.findViewById(R.id.phTitle)
    private val image: ImageView = v.findViewById(R.id.image)
    private val badge: TextView = v.findViewById(R.id.badge)
    private val progress: View = v.findViewById(R.id.progress)
    private val title: TextView = v.findViewById(R.id.title)
    private val sub: TextView = v.findViewById(R.id.sub)
    private var request: Disposable? = null
    private var boundUrl = ""

    init {
        art.clipToOutline = true
        Ui.focusZoom(v)
    }

    fun bind(e: Entry, lib: Library, host: ScreenHost) {
        val ctx = itemView.context
        boundUrl = e.url
        val name = Names.displayTitle(e)
        title.text = name
        sub.text = if (e.kind == Kind.DIR && !Names.isTitleFolder(e.name)) "Folder" else ""
        ph.text = name
        art.background = Ui.placeholder(ctx, name)
        request?.dispose()
        image.setImageDrawable(null)
        val p = host.progressOf(e.url)
        if (p > 0f) {
            progress.visibility = View.VISIBLE
            progress.background = Ui.gradient(ctx, intArrayOf(Ui.GOLD2, Ui.PINK), 3f, GradientDrawable.Orientation.LEFT_RIGHT)
            progress.layoutParams = progress.layoutParams.apply { width = (Ui.dp(ctx, 130f) * p).toInt().coerceAtLeast(Ui.dp(ctx, 8f)) }
        } else progress.visibility = View.GONE
        badge.visibility = View.GONE
        itemView.setOnClickListener { host.onOpen(e, lib) }
        host.scope.launch {
            val m = Meta.of(lib, e)
            if (boundUrl != e.url) return@launch
            m.year?.let {
                sub.text = it.toString()
                badge.text = it.toString()
                badge.background = Ui.gradient(ctx, intArrayOf(Ui.MAROON2, Ui.MAROON), 999f)
                badge.visibility = View.VISIBLE
            }
            m.poster?.let { url ->
                request = image.load(url) {
                    crossfade(true)
                    ScreenAdapter.authFor(url, lib)?.let { a -> addHeader("Authorization", a) }
                }
            }
        }
    }
}
