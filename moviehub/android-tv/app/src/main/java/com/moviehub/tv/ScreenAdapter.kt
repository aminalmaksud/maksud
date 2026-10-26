package com.moviehub.tv

import android.graphics.drawable.GradientDrawable
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
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
    /** The featured slideshow; slides arrive as rows load. */
    class Hero : Item() {
        val slides = mutableListOf<Slide>()
        var onAdded: (() -> Unit)? = null
    }
    class Slide(val entry: Entry, val info: Meta.Info)
    class Panel(val crumbs: String, val title: String, val sub: String, val colors: IntArray) : Item()
    /**
     * A horizontal row of posters: fixed [entries] or the (lazily loaded) contents of [dir].
     * [special] is "continue" or "mylist" for those two rows on Home.
     */
    class Row(val title: String, val badge: String, val dir: Entry?, var entries: List<Entry>? = null, val special: String = "") : Item() {
        var note = ""
        var loading = false
        var failed = false
    }
    class Card(val entry: Entry) : Item()
    class Episode(val entry: Entry, val index: Int) : Item()
}

interface ScreenHost {
    val scope: CoroutineScope
    fun libraryFor(url: String): Library?
    fun onOpen(entry: Entry)
    /** Hold OK / Menu on a title: the options sheet. [changed] redraws the card afterwards. */
    fun onMenu(entry: Entry, special: String, changed: () -> Unit)
    fun onOpenRow(row: Item.Row)
    fun progressOf(entry: Entry): Float
    fun watched(entry: Entry): Boolean
    fun inList(entry: Entry): Boolean
    fun sectionName(entry: Entry): String
    suspend fun rowContent(row: Item.Row): Pair<List<Entry>, String>
    fun onRowLoaded(row: Item.Row)
}

class ScreenAdapter(private val host: ScreenHost) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
    var items: List<Item> = emptyList()
        private set
    private val sharedPool = RecyclerView.RecycledViewPool()

    fun submit(list: List<Item>) { items = list; notifyDataSetChanged() }
    fun insertAt(index: Int, item: Item) { items = items.toMutableList().apply { add(index, item) }; notifyItemInserted(index) }
    fun removeAt(index: Int) { items = items.toMutableList().apply { removeAt(index) }; notifyItemRemoved(index) }

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
            is Item.Card -> (holder as CardVH).bind(it.entry, host, "")
            is Item.Episode -> (holder as EpisodeVH).bind(it)
        }
    }

    // ---------- featured slideshow ----------

    inner class HeroVH(v: View) : RecyclerView.ViewHolder(v) {
        private val backs = arrayOf<ImageView>(v.findViewById(R.id.heroBackA), v.findViewById(R.id.heroBackB))
        private var front = 0
        private val textBox: View = v.findViewById(R.id.heroText)
        private val title: TextView = v.findViewById(R.id.heroTitle)
        private val meta: TextView = v.findViewById(R.id.heroMeta)
        private val overview: TextView = v.findViewById(R.id.heroOverview)
        private val play: TextView = v.findViewById(R.id.heroPlay)
        private val list: TextView = v.findViewById(R.id.heroList)
        private val prev: TextView = v.findViewById(R.id.heroPrev)
        private val next: TextView = v.findViewById(R.id.heroNext)
        private val poster: FrameLayout = v.findViewById(R.id.heroPoster)
        private val posterImg: ImageView = v.findViewById(R.id.heroPosterImg)
        private val dots: LinearLayout = v.findViewById(R.id.heroDots)
        private val timer: View = v.findViewById(R.id.heroTimer)
        private var hero: Item.Hero? = null
        private var index = -1
        private var elapsed = 0L

        /** Every 100 ms; while a hero button has focus the slideshow waits (like hovering on the Mac). */
        private val tick = object : Runnable {
            override fun run() {
                val h = hero ?: return
                if (!itemView.hasFocus() && h.slides.size > 1) {
                    elapsed += 100
                    if (elapsed >= SLIDE_MS) show(index + 1)
                }
                timer.scaleX = (elapsed.toFloat() / SLIDE_MS).coerceIn(0f, 1f)
                itemView.postDelayed(this, 100)
            }
        }

        init {
            val ctx = v.context
            v.background = Ui.gradient(ctx, Ui.PANELS[0], 30f, GradientDrawable.Orientation.LEFT_RIGHT)
            v.clipToOutline = true
            v.findViewById<TextView>(R.id.eyebrow).background = Ui.rounded(ctx, 0x14F5CF5B, 999f, 0x8CF5CF5B.toInt(), 1.5f)
            v.findViewById<View>(R.id.heroScrim).background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                intArrayOf(0xFF2A070B.toInt(), 0xF0400B12.toInt(), 0x80561017.toInt(), 0x00000000))
            poster.background = Ui.rounded(ctx, Ui.GOLD2, 16f)
            poster.clipToOutline = true
            posterImg.clipToOutline = true
            posterImg.background = Ui.rounded(ctx, 0xFF3D0A0F.toInt(), 13f)
            timer.background = Ui.gradient(ctx, intArrayOf(Ui.GOLD, Ui.GOLD2), 2f, GradientDrawable.Orientation.LEFT_RIGHT)
            timer.pivotX = 0f
            for (b in listOf(list, prev, next)) b.background = android.graphics.drawable.StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_focused), Ui.rounded(ctx, 0x40F5CF5B, 999f, Ui.GOLD2, 3f))
                addState(intArrayOf(), Ui.rounded(ctx, 0x1AFFFFFF, 999f, 0x59FFFFFF, 1.5f))
            }
            listOf(play, list, prev, next).forEach { Ui.focusZoom(it, 1.06f) }
            prev.setOnClickListener { show(index - 1) }
            next.setOnClickListener { show(index + 1) }
            v.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
                override fun onViewAttachedToWindow(view: View) { view.removeCallbacks(tick); view.postDelayed(tick, 100) }
                override fun onViewDetachedFromWindow(view: View) { view.removeCallbacks(tick) }
            })
        }

        fun bind(h: Item.Hero) {
            hero = h
            index = -1
            h.onAdded = { renderDots(); if (index < 0) show(0) }
            renderDots()
            if (h.slides.isNotEmpty()) show(0)
        }

        private fun renderDots() {
            val h = hero ?: return
            val ctx = itemView.context
            dots.removeAllViews()
            h.slides.indices.forEach { i ->
                dots.addView(View(ctx).apply {
                    background = Ui.rounded(ctx, if (i == index) Ui.GOLD2 else 0x59FFFFFF, 999f)
                    layoutParams = LinearLayout.LayoutParams(Ui.dp(ctx, if (i == index) 28f else 9f), Ui.dp(ctx, 9f)).apply { marginEnd = Ui.dp(ctx, 8f) }
                })
            }
            val many = h.slides.size > 1
            dots.visibility = if (many) View.VISIBLE else View.GONE
            prev.visibility = dots.visibility; next.visibility = dots.visibility
            timer.visibility = dots.visibility
        }

        private fun show(i: Int) {
            val h = hero ?: return
            if (h.slides.isEmpty()) return
            val n = (i + h.slides.size) % h.slides.size
            val first = index < 0
            index = n; elapsed = 0
            val s = h.slides[n]
            val lib = host.libraryFor(s.entry.url)
            renderDots()

            // Picture: cross-fade to the other image, which drifts slowly (Ken Burns).
            val art = s.info.backdrop ?: s.info.poster
            val incoming = backs[1 - front]; val outgoing = backs[front]
            front = 1 - front
            incoming.animate().cancel()
            incoming.alpha = 0f
            incoming.setImageDrawable(null)
            if (art != null) incoming.load(art) { crossfade(false); lib?.let { l -> ScreenAdapter.authFor(art, l)?.let { a -> addHeader("Authorization", a) } } }
            val soft = s.info.backdrop == null
            incoming.scaleX = 1.12f; incoming.scaleY = 1.12f
            incoming.animate().alpha(if (soft) .28f else 1f).setDuration(1200).start()
            incoming.animate().scaleX(1f).scaleY(1f).setDuration(11_000).setInterpolator(DecelerateInterpolator()).start()
            outgoing.animate().alpha(0f).setDuration(1200).setInterpolator(LinearInterpolator()).start()

            // Without a backdrop, the poster (or a cover) stands on the right like a book on a shelf.
            poster.visibility = if (soft) View.VISIBLE else View.GONE
            if (soft) {
                posterImg.setImageDrawable(null)
                posterImg.background = CoverDrawable(itemView.context, s.entry.name, s.entry.kind == Kind.DIR && !Names.isTitleFolder(s.entry.name))
                s.info.poster?.let { pu -> posterImg.load(pu) { crossfade(true); lib?.let { l -> ScreenAdapter.authFor(pu, l)?.let { a -> addHeader("Authorization", a) } } } }
                poster.alpha = 0f; poster.rotation = 9f; poster.scaleX = .9f; poster.scaleY = .9f
                poster.animate().alpha(1f).rotation(3f).scaleX(1f).scaleY(1f).setDuration(700).setInterpolator(DecelerateInterpolator()).start()
            }

            val fill = {
                title.text = Names.cleanTitle(s.entry.name).let { t -> if (s.info.title.isNotEmpty() && s.info.backdrop != null) s.info.title else t }
                meta.text = listOfNotNull(s.info.year?.toString() ?: Names.yearIn(s.entry.name), s.info.rating.takeIf { it.isNotEmpty() }?.let { "★ $it" },
                    host.sectionName(s.entry)).filter { it.isNotEmpty() }.joinToString("  ·  ")
                overview.text = s.info.overview
                overview.visibility = if (s.info.overview.isEmpty()) View.GONE else View.VISIBLE
                list.text = if (host.inList(s.entry)) "✓  My List" else "+  My List"
                play.setOnClickListener { host.onOpen(s.entry) }
                list.setOnClickListener { host.onMenu(s.entry, "hero") { list.text = if (host.inList(s.entry)) "✓  My List" else "+  My List" } }
                textBox.translationX = 0f
                textBox.animate().alpha(1f).setDuration(300).start()
            }
            if (first) { textBox.alpha = 0f; fill() }
            else textBox.animate().alpha(0f).translationX(-Ui.dp(itemView.context, 14f).toFloat()).setDuration(260).withEndAction { fill() }.start()
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
            when (r.special) {
                "continue" -> { icon.setImageResource(R.drawable.ic_play); icon.background = Ui.rounded(ctx, Ui.GOLD, 12f) }
                "mylist" -> { icon.setImageResource(R.drawable.ic_bookmark); icon.background = Ui.rounded(ctx, Ui.PINK, 12f) }
                else -> { icon.setImageResource(Ui.rowIcon(r.title)); icon.background = Ui.rounded(ctx, Ui.tileColor(r.title), 12f) }
            }
            val hint = when (r.special) { "continue" -> "Hold OK on a title to remove it"; "mylist" -> "${r.entries?.size ?: 0} saved"; else -> "" }
            val b = listOf(r.badge, r.note.let { if (it.isNotEmpty()) "Newest · $it" else "" }, hint).filter { it.isNotEmpty() }.joinToString("  ·  ")
            badge.text = b
            badge.visibility = if (b.isEmpty()) View.GONE else View.VISIBLE
            badge.background = Ui.rounded(ctx, 0x17A3242F, 999f)
            head.isFocusable = r.dir != null || r.special == "mylist"
            head.setOnClickListener { host.onOpenRow(r) }
            val entries = r.entries
            cards.submit(entries.orEmpty(), r.special)
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
        init { Ui.focusZoom(itemView, 1.02f) }
        fun bind(e: Item.Episode) {
            val ctx = itemView.context
            val num: TextView = itemView.findViewById(R.id.num)
            num.text = Names.episodeNumber(e.entry.name, e.index).toString()
            num.background = Ui.gradient(ctx, intArrayOf(Ui.MAROON2, Ui.MAROON), 14f)
            itemView.findViewById<TextView>(R.id.title).text = episodeTitle(e.entry.name, e.index)
            val p = host.progressOf(e.entry)
            itemView.findViewById<TextView>(R.id.sub).text = when {
                p > 0f -> "Resume · ${(p * 100).toInt()}% watched  ·  hold OK to clear"
                host.watched(e.entry) -> "✓ Watched  ·  hold OK to mark unwatched"
                else -> Names.stem(e.entry.name)
            }
            itemView.setOnClickListener { host.onOpen(e.entry) }
            val menu = { host.onMenu(e.entry, "episode") { val pos = items.indexOf(e); if (pos >= 0) notifyItemChanged(pos) } }
            itemView.setOnLongClickListener { menu(); true }
            itemView.setOnKeyListener { _, code, ev -> if (code == KeyEvent.KEYCODE_MENU && ev.action == KeyEvent.ACTION_UP) { menu(); true } else false }
        }
    }

    private fun episodeTitle(name: String, i: Int): String {
        val s = Names.stem(name).replace(Regex("[._]+"), " ")
        val m = Regex("""\bS\d{1,2} ?E\d{1,3}\b\s*[-–:]?\s*(.*)$""", RegexOption.IGNORE_CASE).find(s)
        val rest = m?.groupValues?.get(1)?.replace(Regex("""\b(2160p|1080p|720p|480p|web.?dl|webrip|bluray|hdtv|x26[45]|h ?26[45]|hevc|aac|10bit).*$""", RegexOption.IGNORE_CASE), "")?.trim()
        return if (!rest.isNullOrEmpty() && rest.length > 2) rest else "Episode ${Names.episodeNumber(name, i)}"
    }

    companion object {
        const val SLIDE_MS = 8000L

        /** Send the server login only to the server itself, never to TMDB. */
        fun authFor(url: String, lib: Library): String? =
            if (url.startsWith(lib.root.split('/').take(3).joinToString("/") + "/")) lib.authHeader else null
    }
}

/** Posters in a row. */
class CardsAdapter(private val host: ScreenHost) : RecyclerView.Adapter<CardVH>() {
    private var items: List<Entry> = emptyList()
    private var special = ""
    fun submit(list: List<Entry>, special: String) { items = list; this.special = special; notifyDataSetChanged() }
    override fun getItemCount() = items.size
    override fun getItemViewType(position: Int) = 3
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = CardVH(LayoutInflater.from(parent.context).inflate(R.layout.item_card, parent, false))
    override fun onBindViewHolder(holder: CardVH, position: Int) { holder.bind(items[position], host, special) }
}

class CardVH(v: View) : RecyclerView.ViewHolder(v) {
    private val art: View = v.findViewById(R.id.art)
    private val image: ImageView = v.findViewById(R.id.image)
    private val badge: TextView = v.findViewById(R.id.badge)
    private val listMark: TextView = v.findViewById(R.id.listMark)
    private val progress: View = v.findViewById(R.id.progress)
    private val title: TextView = v.findViewById(R.id.title)
    private val sub: TextView = v.findViewById(R.id.sub)
    private var request: Disposable? = null
    private var boundUrl = ""

    init {
        art.clipToOutline = true
        Ui.focusZoom(v)
    }

    fun bind(e: Entry, host: ScreenHost, special: String) {
        val ctx = itemView.context
        boundUrl = e.url
        val category = e.kind == Kind.DIR && !Names.isTitleFolder(e.name)
        title.text = Names.cleanTitle(e.name)
        sub.text = if (category) "Folder" else Names.yearIn(e.name).orEmpty()
        art.background = CoverDrawable(ctx, e.name, category)
        request?.dispose()
        image.setImageDrawable(null)
        refresh(e, host)
        // Versions of the same movie on different servers.
        val quals = e.versions.map { it.quality }
        if (quals.size > 1) {
            badge.text = quals.joinToString(" · ")
            badge.setTextColor(Ui.GOLD2)
            badge.background = Ui.rounded(ctx, 0xB8140608.toInt(), 999f, 0x80F5CF5B.toInt(), 1f)
            badge.visibility = View.VISIBLE
        } else badge.visibility = View.GONE
        itemView.setOnClickListener { host.onOpen(e) }
        val menu = { host.onMenu(e, special) { if (boundUrl == e.url) refresh(e, host) } }
        itemView.setOnLongClickListener { menu(); true }
        itemView.setOnKeyListener { _, code, ev -> if (code == KeyEvent.KEYCODE_MENU && ev.action == KeyEvent.ACTION_UP) { menu(); true } else false }
        val lib = host.libraryFor(e.url) ?: return
        host.scope.launch {
            val m = Meta.of(lib, e)
            if (boundUrl != e.url) return@launch
            if (sub.text.isEmpty()) m.year?.let { sub.text = it.toString() }
            m.poster?.let { url ->
                request = image.load(url) {
                    crossfade(true)
                    ScreenAdapter.authFor(url, lib)?.let { a -> addHeader("Authorization", a) }
                }
            }
        }
    }

    /** Progress bar, watched tick and My List mark: these change from the options sheet. */
    fun refresh(e: Entry, host: ScreenHost) {
        val ctx = itemView.context
        val p = host.progressOf(e)
        if (p > 0f) {
            progress.visibility = View.VISIBLE
            progress.background = Ui.gradient(ctx, intArrayOf(Ui.GOLD2, Ui.PINK), 3f, GradientDrawable.Orientation.LEFT_RIGHT)
            progress.layoutParams = progress.layoutParams.apply { width = (Ui.dp(ctx, 130f) * p).toInt().coerceAtLeast(Ui.dp(ctx, 8f)) }
        } else progress.visibility = View.GONE
        val listed = host.inList(e)
        val watched = host.watched(e)
        listMark.visibility = if (listed || watched) View.VISIBLE else View.GONE
        listMark.text = if (listed) "✓" else "✓ Watched"
        listMark.setTextColor(if (listed) 0xFF3A0D10.toInt() else 0xFFFFFFFF.toInt())
        listMark.background = if (listed) Ui.gradient(ctx, intArrayOf(Ui.GOLD2, Ui.GOLD), 999f) else Ui.rounded(ctx, 0xFF1F8A5B.toInt(), 999f)
    }
}
