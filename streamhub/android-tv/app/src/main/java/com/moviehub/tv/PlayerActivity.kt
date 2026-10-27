package com.moviehub.tv

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.StateListDrawable
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.annotation.OptIn
import androidx.core.content.res.ResourcesCompat
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.PlayerView
import androidx.media3.ui.SubtitleView
import java.util.Locale
import kotlin.math.abs

@OptIn(UnstableApi::class)
class PlayerActivity : ComponentActivity() {
    private lateinit var playerView: PlayerView
    private lateinit var trackBar: View
    private lateinit var panel: ScrollView
    private lateinit var body: LinearLayout
    private lateinit var toastView: TextView
    private var player: ExoPlayer? = null
    private lateinit var url: String
    private var fileName = ""
    /** Back shrinks the video into the corner of the home screen instead of stopping it. */
    private var minimizing = false
    private var panelTab = "audio"

    private class TrackOption(val group: Tracks.Group, val index: Int, val format: Format, val label: String, val selected: Boolean)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_player)
        playerView = findViewById(R.id.player)
        trackBar = findViewById(R.id.trackBar)
        panel = findViewById(R.id.panel)
        body = findViewById(R.id.panelBody)
        toastView = findViewById(R.id.toast)
        url = intent.getStringExtra(EXTRA_URL) ?: run { finish(); return }
        fileName = intent.getStringExtra(EXTRA_NAME) ?: Uri.decode(url.substringAfterLast('/'))
        findViewById<TextView>(R.id.playerTitle).text = intent.getStringExtra(EXTRA_TITLE) ?: ""
        Names.parse(fileName).let { p ->
            findViewById<TextView>(R.id.playerSub).text = listOfNotNull(
                if (p.season != null && p.episode != null) "S${p.season} · E${p.episode}" else p.year?.toString(),
            ).joinToString(" · ")
        }

        panel.background = Ui.rounded(this, 0xF21E0A0C.toInt(), 26f, 0x55F5CF5B, 1f)
        toastView.background = Ui.rounded(this, 0xD92A070B.toInt(), 16f, 0x59F5CF5B, 1f)
        findViewById<Button>(R.id.audioBtn).setOnClickListener { openPanel("audio") }
        findViewById<Button>(R.id.subsBtn).setOnClickListener { openPanel("subs") }
        findViewById<Button>(R.id.styleBtn).setOnClickListener { openPanel("style") }
        findViewById<Button>(R.id.syncBtn).setOnClickListener { openPanel("sync") }
        findViewById<Button>(R.id.listBtn).apply {
            setOnClickListener {
                val on = Prefs.toggleList(this@PlayerActivity, listEntry())
                toast(if (on) "Added to My List" else "Removed from My List"); updateListButton()
            }
        }
        updateListButton()
        // The buttons appear and hide together with the playback controls.
        playerView.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility ->
            if (panel.visibility != View.VISIBLE) trackBar.visibility = visibility
        })
        applySubtitleStyle()
    }

    override fun onStart() {
        super.onStart()
        minimizing = false
        val p = Playback.start(this, intent.extras ?: Bundle())
        p.addListener(listener)
        Playback.onStopped += finishWhenStopped
        playerView.player = p
        playerView.controllerShowTimeoutMs = 4000
        playerView.requestFocus()
        player = p
    }

    private val listener = object : Player.Listener {
        override fun onPlayerError(error: PlaybackException) {
            toast("Can't play this file (${error.errorCodeName}). The TV may not support its video format.", 5000)
        }
        override fun onTracksChanged(tracks: Tracks) { if (panel.visibility == View.VISIBLE) buildPanel() }
    }
    private val finishWhenStopped: () -> Unit = { if (!isFinishing) finish() }

    override fun onStop() {
        super.onStop()
        player?.removeListener(listener)
        Playback.onStopped -= finishWhenStopped
        // The home screen may already show this player in its corner; only let go of our own view.
        if (playerView.player === player) playerView.player = null
        if (minimizing || isChangingConfigurations) Playback.save(this) else Playback.stop(this)
        player = null
    }

    /** What "My List" saves from the player: a series (the episode's folder), or the movie itself. */
    private fun listEntry(): Entry {
        if (!Names.EPISODE.containsMatchIn(fileName)) return Entry(fileName, url, Kind.VIDEO)
        val dir = url.substringBeforeLast('/') + "/"
        return Entry(Uri.decode(dir.trimEnd('/').substringAfterLast('/')), dir, Kind.DIR)
    }

    private fun updateListButton() {
        val on = Prefs.inList(this, listEntry().url)
        findViewById<Button>(R.id.listBtn).text = if (on) "✓  My List" else "+  My List"
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val p = player
        if (panel.visibility == View.VISIBLE) {
            if (event.keyCode == KeyEvent.KEYCODE_BACK || event.keyCode == KeyEvent.KEYCODE_MENU) {
                if (event.action == KeyEvent.ACTION_UP) closePanel()
                return true
            }
            return super.dispatchKeyEvent(event)
        }
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) { minimizing = true; finish() }
            return true
        }
        if (p != null && event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK -> { openPanel("audio"); return true }
                KeyEvent.KEYCODE_CAPTIONS -> { openPanel("subs"); return true }
            }
            // With the controls hidden, left/right on the remote skips 10s instead of just popping the bar up.
            if (!playerView.isControllerFullyVisible) {
                when (event.keyCode) {
                    KeyEvent.KEYCODE_DPAD_RIGHT -> { p.seekForward(); return true }
                    KeyEvent.KEYCODE_DPAD_LEFT -> { p.seekBack(); return true }
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    // ---------- side panel ----------

    private fun openPanel(tab: String) {
        panelTab = tab
        playerView.hideController()
        trackBar.visibility = View.GONE
        panel.visibility = View.VISIBLE
        buildPanel()
        body.post { (body.findViewWithTag<View>("tab:$tab") ?: body.getChildAt(0))?.requestFocus() }
    }

    private fun closePanel() {
        panel.visibility = View.GONE
        playerView.showController()
        trackBar.visibility = View.VISIBLE
        playerView.requestFocus()
    }

    private fun buildPanel() {
        val focusedTag = body.findFocus()?.tag as? String
        body.removeAllViews()
        body.addView(chipRow(listOf("tab:audio" to "Audio", "tab:subs" to "Subtitles", "tab:style" to "Style", "tab:sync" to "Sync"),
            selected = "tab:$panelTab", tabs = true) { tag -> panelTab = tag.removePrefix("tab:"); buildPanel() })
        when (panelTab) {
            "audio" -> audioTab()
            "subs" -> subtitleTab()
            "style" -> styleTab()
            else -> syncTab()
        }
        focusedTag?.let { t -> body.post { body.findViewWithTag<View>(t)?.requestFocus() } }
    }

    private fun audioTab() {
        header("Audio track")
        val opts = tracksOf(C.TRACK_TYPE_AUDIO)
        if (opts.isEmpty()) hint("No audio track the TV can play.")
        opts.forEachIndexed { i, o ->
            option("audio:$i", o.label, null, o.selected) {
                player?.let { p ->
                    p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
                        .setOverrideForType(TrackSelectionOverride(o.group.mediaTrackGroup, o.index)).build()
                }
                Prefs.setAudioLang(this, o.format.language.orEmpty())
                buildPanel()
            }
        }
        header("Audio sync")
        stepper("async", Prefs.audioSync(this, url), listOf(-0.5f, -0.1f, 0.1f, 0.5f)) { setAudioSync(it) }
        hint("Voices before lips move? Press +. After? Press −. Saved for this video.")
    }

    private fun subtitleTab() {
        val p = player ?: return
        header("Subtitles")
        val opts = tracksOf(C.TRACK_TYPE_TEXT)
        val off = p.trackSelectionParameters.disabledTrackTypes.contains(C.TRACK_TYPE_TEXT) || opts.none { it.selected }
        option("sub:off", "Off", null, off) {
            p.trackSelectionParameters = p.trackSelectionParameters.buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()
            Prefs.setSubLang(this, "off"); buildPanel()
        }
        opts.forEachIndexed { i, o ->
            option("sub:$i", o.label, null, !off && o.selected) {
                p.trackSelectionParameters = p.trackSelectionParameters.buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                    .setOverrideForType(TrackSelectionOverride(o.group.mediaTrackGroup, o.index)).build()
                Prefs.setSubLang(this, o.format.language.orEmpty()); buildPanel()
            }
        }
        if (opts.isEmpty()) hint("No subtitles for this video.")
    }

    private fun styleTab() {
        header("Font")
        val fonts = listOf("clean" to "Clean", "classic" to "Classic", "rounded" to "Rounded", "epic" to "Epic", "bangla" to "বাংলা", "mono" to "Typewriter")
        fonts.chunked(3).forEach { row ->
            body.addView(chipRow(row.map { "font:${it.first}" to it.second }, "font:${Prefs.subFont(this)}",
                typefaces = row.associate { "font:${it.first}" to typefaceFor(it.first) }) { tag ->
                Prefs.setSubStyle(this, font = tag.removePrefix("font:")); applySubtitleStyle(); buildPanel()
            })
        }
        header("Colour")
        body.addView(swatches())
        header("Edge")
        body.addView(chipRow(listOf("edge:shadow" to "Shadow", "edge:outline" to "Outline", "edge:glow" to "Raised", "edge:none" to "None"),
            "edge:${Prefs.subEdge(this)}") { tag -> Prefs.setSubStyle(this, edge = tag.removePrefix("edge:")); applySubtitleStyle(); buildPanel() })
        header("Background")
        body.addView(chipRow(listOf("bg:0" to "None", "bg:110" to "Soft", "bg:210" to "Box"),
            "bg:${Prefs.subBg(this)}") { tag -> Prefs.setSubStyle(this, bg = tag.removePrefix("bg:").toInt()); applySubtitleStyle(); buildPanel() })
        header("Position")
        body.addView(chipRow(listOf("pos:low" to "Low", "pos:mid" to "Middle", "pos:high" to "High"),
            "pos:${Prefs.subPos(this)}") { tag -> Prefs.setSubStyle(this, pos = tag.removePrefix("pos:")); applySubtitleStyle(); buildPanel() })
        header("Size")
        body.addView(chipRow(listOf("size:-" to "A −", "size:v" to "${(Prefs.subScale(this) * 100).toInt()}%", "size:+" to "A +"), "") { tag ->
            val cur = Prefs.subScale(this)
            when (tag) {
                "size:-" -> Prefs.setSubScale(this, (cur - 0.1f).coerceAtLeast(0.6f))
                "size:+" -> Prefs.setSubScale(this, (cur + 0.1f).coerceAtMost(2.2f))
            }
            applySubtitleStyle(); buildPanel()
        })
    }

    private fun syncTab() {
        header("Subtitle sync")
        stepper("ssync", Prefs.subSync(this, url), listOf(-1f, -0.1f, 0.1f, 1f)) { setSubSync(it) }
        hint("Words show up before they’re spoken? Press +. After? Press −.")
        header("Audio sync")
        stepper("async", Prefs.audioSync(this, url), listOf(-0.5f, -0.1f, 0.1f, 0.5f)) { setAudioSync(it) }
        hint("Voices before lips move? Press +. After? Press −. Both are saved for this video.")
    }

    private fun setAudioSync(v: Float) {
        val s = (Math.round(v.coerceIn(-10f, 10f) * 10) / 10f)
        Prefs.setAudioSync(this, url, s)
        Playback.audioSyncUs = (s * 1_000_000).toLong()
        toast("Audio ${signed(s)}"); buildPanel()
    }

    private fun setSubSync(v: Float) {
        val s = (Math.round(v.coerceIn(-60f, 60f) * 10) / 10f)
        Prefs.setSubSync(this, url, s)
        Playback.subSyncUs = (s * 1_000_000).toLong()
        toast("Subtitles ${signed(s)}"); buildPanel()
    }

    private fun signed(v: Float) = (if (v > 0) "+" else if (v < 0) "−" else "") + String.format(Locale.US, "%.1f s", abs(v))

    // ---------- panel widgets ----------

    private fun focusBg(selected: Boolean, radius: Float = 14f) = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_focused), Ui.rounded(this@PlayerActivity, Ui.MAROON2, radius, Ui.GOLD2, 3f))
        addState(intArrayOf(), if (selected) Ui.rounded(this@PlayerActivity, 0x33F5CF5B, radius, Ui.GOLD2, 1.5f) else Ui.rounded(this@PlayerActivity, 0x14FFFFFF, radius))
    }

    private fun header(text: String) = body.addView(TextView(this).apply {
        this.text = text.uppercase()
        typeface = ResourcesCompat.getFont(context, R.font.bebas_neue)
        textSize = 20f
        letterSpacing = 0.08f
        setTextColor(Ui.GOLD2)
        setPadding(Ui.dp(context, 6f), Ui.dp(context, 16f), 0, Ui.dp(context, 6f))
    })

    private fun hint(text: String) = body.addView(TextView(this).apply {
        this.text = text; textSize = 13f; setTextColor(0xFFC8B3A3.toInt())
        setPadding(Ui.dp(context, 6f), Ui.dp(context, 4f), Ui.dp(context, 6f), Ui.dp(context, 4f))
    })

    private fun option(tag: String, label: String, sub: String?, checked: Boolean, onClick: () -> Unit) {
        body.addView(TextView(this).apply {
            this.tag = tag
            text = (if (checked) "✓  " else "     ") + label + (sub?.let { "\n     $it" } ?: "")
            textSize = 17f
            setTextColor(if (checked) Ui.GOLD2 else Color.WHITE)
            setTypeface(typeface, if (checked) Typeface.BOLD else Typeface.NORMAL)
            setPadding(Ui.dp(context, 14f), Ui.dp(context, 11f), Ui.dp(context, 14f), Ui.dp(context, 11f))
            background = focusBg(false)
            isFocusable = true
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = Ui.dp(context, 4f) }
        })
    }

    private fun chipRow(
        chips: List<Pair<String, String>>, selected: String, tabs: Boolean = false,
        typefaces: Map<String, Typeface?> = emptyMap(), onPick: (String) -> Unit,
    ) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, Ui.dp(context, 3f), 0, Ui.dp(context, 3f))
        chips.forEach { (tag, label) ->
            addView(TextView(context).apply {
                this.tag = tag
                text = label
                textSize = if (tabs) 15f else 16f
                gravity = Gravity.CENTER
                typefaces[tag]?.let { typeface = it } ?: setTypeface(typeface, Typeface.BOLD)
                setTextColor(if (tag == selected) Color.WHITE else 0xFFE8D9CA.toInt())
                setPadding(Ui.dp(context, 12f), Ui.dp(context, 9f), Ui.dp(context, 12f), Ui.dp(context, 9f))
                background = if (tabs && tag == selected) StateListDrawable().apply {
                    addState(intArrayOf(android.R.attr.state_focused), Ui.rounded(context, Ui.MAROON2, 999f, Ui.GOLD2, 3f))
                    addState(intArrayOf(), Ui.rounded(context, Ui.MAROON, 999f))
                } else focusBg(tag == selected, 999f)
                isFocusable = tag != "size:v"
                setOnClickListener { onPick(tag) }
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = Ui.dp(context, 6f) }
            })
        }
    }

    private val swatchColors = intArrayOf(0xFFFFFFFF.toInt(), 0xFFFFE066.toInt(), 0xFF7EF0FF.toInt(), 0xFFA8FF8A.toInt(), 0xFFFFB3D1.toInt(), 0xFFFFC58A.toInt())

    private fun swatches() = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(Ui.dp(context, 4f), Ui.dp(context, 4f), 0, Ui.dp(context, 4f))
        val current = Prefs.subColor(this@PlayerActivity)
        swatchColors.forEach { c ->
            addView(View(context).apply {
                tag = "color:$c"
                val on = c == current
                background = StateListDrawable().apply {
                    addState(intArrayOf(android.R.attr.state_focused), Ui.rounded(context, c, 999f, Ui.MAROON2, 5f))
                    addState(intArrayOf(), Ui.rounded(context, c, 999f, if (on) Ui.GOLD2 else 0x33FFFFFF, if (on) 4f else 2f))
                }
                isFocusable = true
                setOnClickListener { Prefs.setSubStyle(this@PlayerActivity, color = c); applySubtitleStyle(); buildPanel() }
                Ui.focusZoom(this, 1.15f)
                layoutParams = LinearLayout.LayoutParams(Ui.dp(context, 40f), Ui.dp(context, 40f)).apply { marginEnd = Ui.dp(context, 12f) }
            })
        }
    }

    private fun stepper(tagPrefix: String, value: Float, steps: List<Float>, onSet: (Float) -> Unit) {
        val half = steps.size / 2
        val chips = steps.take(half).map { "$tagPrefix:$it" to fmtStep(it) } + ("$tagPrefix:v" to signed(value)) +
            steps.drop(half).map { "$tagPrefix:$it" to fmtStep(it) }
        body.addView(chipRow(chips, "") { tag ->
            val d = tag.substringAfter(':').toFloatOrNull() ?: return@chipRow
            onSet(value + d)
        }.also { row ->
            // the middle chip shows the value and also resets it
            row.findViewWithTag<TextView>("$tagPrefix:v")?.apply {
                isFocusable = true
                setTextColor(Ui.GOLD2)
                setOnClickListener { onSet(0f) }
            }
        })
    }

    private fun fmtStep(v: Float) = (if (v > 0) "+" else "−") + (if (abs(v) >= 1f) abs(v).toInt().toString() else abs(v).toString().removePrefix("0"))

    private fun toast(msg: String, ms: Long = 1200) {
        toastView.text = msg
        toastView.visibility = View.VISIBLE
        toastView.removeCallbacks(hideToast)
        toastView.postDelayed(hideToast, ms)
    }
    private val hideToast = Runnable { toastView.visibility = View.GONE }

    // ---------- subtitle style ----------

    private fun typefaceFor(key: String): Typeface? = when (key) {
        "classic" -> Typeface.SERIF
        "rounded" -> Typeface.create("sans-serif-medium", Typeface.NORMAL)
        "epic" -> ResourcesCompat.getFont(this, R.font.cinzel)
        "bangla" -> ResourcesCompat.getFont(this, R.font.hind_siliguri_semibold)
        "mono" -> Typeface.MONOSPACE
        else -> ResourcesCompat.getFont(this, R.font.plus_jakarta_sans)
    }

    private fun applySubtitleStyle() {
        val sv = playerView.subtitleView ?: return
        val edge = when (Prefs.subEdge(this)) {
            "outline" -> CaptionStyleCompat.EDGE_TYPE_OUTLINE
            "glow" -> CaptionStyleCompat.EDGE_TYPE_RAISED
            "none" -> CaptionStyleCompat.EDGE_TYPE_NONE
            else -> CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW
        }
        val bg = Color.argb(Prefs.subBg(this).coerceIn(0, 255), 0, 0, 0)
        sv.setApplyEmbeddedStyles(false)
        sv.setApplyEmbeddedFontSizes(false)
        sv.setStyle(CaptionStyleCompat(Prefs.subColor(this), bg, Color.TRANSPARENT, edge, Color.BLACK, typefaceFor(Prefs.subFont(this))))
        sv.setFractionalTextSize(SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * Prefs.subScale(this))
        sv.setBottomPaddingFraction(when (Prefs.subPos(this)) { "mid" -> 0.16f; "high" -> 0.28f; else -> SubtitleView.DEFAULT_BOTTOM_PADDING_FRACTION })
    }

    // ---------- tracks ----------

    private fun tracksOf(type: Int): List<TrackOption> {
        val p = player ?: return emptyList()
        return p.currentTracks.groups.filter { it.type == type }.flatMap { g ->
            (0 until g.length).filter { g.isTrackSupported(it) }.map { i ->
                val f = g.getTrackFormat(i)
                TrackOption(g, i, f, describe(f, type), g.isTrackSelected(i))
            }
        }
    }

    /** "English · Dolby Digital 5.1", "Hindi · Commentary", "English · Movie.en.srt" */
    private fun describe(f: Format, type: Int): String {
        val parts = mutableListOf<String>()
        f.language?.takeIf { it.isNotEmpty() && it != C.LANGUAGE_UNDETERMINED }?.let {
            parts += Locale.forLanguageTag(it).getDisplayLanguage(Locale.ENGLISH).ifEmpty { it }
        }
        f.label?.takeIf { it.isNotBlank() && it !in parts }?.let { parts += it }
        if (type == C.TRACK_TYPE_AUDIO) {
            codecName(f.sampleMimeType)?.let { parts += it }
            when {
                f.channelCount >= 8 -> parts += "7.1"
                f.channelCount >= 6 -> parts += "5.1"
                f.channelCount == 2 -> parts += "Stereo"
                f.channelCount == 1 -> parts += "Mono"
            }
        }
        if ((f.selectionFlags and C.SELECTION_FLAG_FORCED) != 0) parts += "Forced"
        return parts.joinToString(" · ").ifEmpty { getString(R.string.track_unnamed) }
    }

    private fun codecName(mime: String?) = when (mime) {
        MimeTypes.AUDIO_AC3 -> "Dolby Digital"
        MimeTypes.AUDIO_E_AC3, MimeTypes.AUDIO_E_AC3_JOC -> "Dolby Digital+"
        MimeTypes.AUDIO_TRUEHD -> "Dolby TrueHD"
        MimeTypes.AUDIO_DTS, MimeTypes.AUDIO_DTS_HD, MimeTypes.AUDIO_DTS_EXPRESS -> "DTS"
        MimeTypes.AUDIO_AAC -> "AAC"
        MimeTypes.AUDIO_MPEG -> "MP3"
        MimeTypes.AUDIO_OPUS -> "Opus"
        MimeTypes.AUDIO_FLAC -> "FLAC"
        else -> null
    }

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
        const val EXTRA_NAME = "name"
        const val EXTRA_SUB_URLS = "subUrls"
        const val EXTRA_SUB_NAMES = "subNames"
        const val EXTRA_AUTH = "auth"
    }
}
