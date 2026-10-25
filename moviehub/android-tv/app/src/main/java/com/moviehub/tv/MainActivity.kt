package com.moviehub.tv

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.net.URLDecoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private lateinit var recycler: RecyclerView
    private lateinit var status: TextView
    private lateinit var pathView: TextView
    private val adapter = EntryAdapter(
        resumeOf = { Prefs.position(this, it.url) },
        onClick = { pos, e -> onEntry(pos, e) },
    )

    private var libraries: List<Library> = emptyList()
    private var currentUrl = ""
    private var all: List<Entry> = emptyList()
    private val stack = ArrayDeque<Pair<String, Int>>() // (folder url, selected row) to return to
    private var loadJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        recycler = findViewById(R.id.list)
        status = findViewById(R.id.status)
        pathView = findViewById(R.id.path)
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter
        findViewById<Button>(R.id.settings).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val back = stack.removeLastOrNull()
                if (back != null) load(back.first, back.second) else finish()
            }
        })
    }

    override fun onResume() {
        super.onResume()
        val servers = Prefs.servers(this)
        if (servers.isEmpty()) {
            adapter.submit(emptyList())
            pathView.text = ""
            status.text = getString(R.string.no_server)
            startActivity(Intent(this, SettingsActivity::class.java))
            return
        }
        val libs = servers.map { Library(it, Prefs.username(this), Prefs.password(this)) }
        if (libs.map { it.root to it.authHeader } != libraries.map { it.root to it.authHeader }) {
            libraries = libs
            stack.clear()
            load(HOME, 0)
        } else {
            adapter.notifyDataSetChanged() // refresh "Resume at" labels
        }
    }

    private fun load(url: String, selectRow: Int) {
        loadJob?.cancel()
        // Home lists the servers; with only one server, Home is that server's root.
        val target = if (url == HOME && libraries.size == 1) libraries[0].root else url
        if (target == HOME) {
            currentUrl = HOME
            all = libraries.map { Entry(it.name, it.root, Kind.DIR) }
            show(all, "Home", selectRow)
            return
        }
        val lib = libraries.firstOrNull { target.startsWith(it.root) } ?: return
        status.text = getString(R.string.loading)
        loadJob = lifecycleScope.launch {
            try {
                val result = withContext(Dispatchers.IO) { lib.list(target) }
                currentUrl = target
                all = result
                val prefix = if (libraries.size > 1) lib.name else ""
                show(result.filter { it.kind != Kind.SUB }, prefix + "/" + decodePath(target.removePrefix(lib.root)), selectRow)
            } catch (e: LibraryException) {
                status.text = e.message
            }
        }
    }

    private fun show(shown: List<Entry>, path: String, selectRow: Int) {
        adapter.submit(shown)
        pathView.text = path
        status.text = if (shown.isEmpty()) getString(R.string.empty_folder) else ""
        recycler.post {
            val row = selectRow.coerceIn(0, maxOf(shown.size - 1, 0))
            recycler.scrollToPosition(row)
            recycler.post { recycler.findViewHolderForAdapterPosition(row)?.itemView?.requestFocus() }
        }
    }

    private fun onEntry(position: Int, e: Entry) {
        if (e.kind == Kind.DIR) {
            stack.addLast(currentUrl to position)
            load(e.url, 0)
            return
        }
        val stem = e.name.substringBeforeLast('.')
        // Every subtitle file in the folder is offered; ones named like the video come first.
        val subs = all.filter { it.kind == Kind.SUB }.sortedBy { !it.name.startsWith(stem, ignoreCase = true) }
        startActivity(
            Intent(this, PlayerActivity::class.java)
                .putExtra(PlayerActivity.EXTRA_URL, e.url)
                .putExtra(PlayerActivity.EXTRA_TITLE, stem)
                .putStringArrayListExtra(PlayerActivity.EXTRA_SUB_URLS, ArrayList(subs.map { it.url }))
                .putStringArrayListExtra(PlayerActivity.EXTRA_SUB_NAMES, ArrayList(subs.map { it.name }))
                .putExtra(PlayerActivity.EXTRA_AUTH, libraries.firstOrNull { e.url.startsWith(it.root) }?.authHeader)
        )
    }

    private fun decodePath(p: String) = try { URLDecoder.decode(p.replace("+", "%2B"), "UTF-8") } catch (e: Exception) { p }

    companion object {
        private const val HOME = ""
    }
}

private class EntryAdapter(
    private val resumeOf: (Entry) -> Long,
    private val onClick: (Int, Entry) -> Unit,
) : RecyclerView.Adapter<EntryAdapter.VH>() {
    private var items: List<Entry> = emptyList()

    fun submit(list: List<Entry>) {
        items = list
        notifyDataSetChanged()
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val icon: TextView = v.findViewById(R.id.icon)
        val title: TextView = v.findViewById(R.id.title)
        val note: TextView = v.findViewById(R.id.note)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(LayoutInflater.from(parent.context).inflate(R.layout.item_entry, parent, false))

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: VH, position: Int) {
        val e = items[position]
        val isDir = e.kind == Kind.DIR
        h.icon.text = if (isDir) "📁" else "🎬"
        h.title.text = if (isDir) e.name else e.name.substringBeforeLast('.')
        val resume = if (isDir) 0L else resumeOf(e)
        h.note.visibility = if (resume > 30_000) View.VISIBLE else View.GONE
        h.note.text = "Resume at " + formatTime(resume)
        h.itemView.setOnClickListener { onClick(h.bindingAdapterPosition, e) }
    }

    private fun formatTime(ms: Long): String {
        val s = ms / 1000
        val h = s / 3600; val m = (s % 3600) / 60; val x = s % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, x) else "%d:%02d".format(m, x)
    }
}
