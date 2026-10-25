package com.moviehub.tv

import android.app.AlertDialog
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.PlayerView
import androidx.media3.ui.SubtitleView
import java.util.Locale

class PlayerActivity : ComponentActivity() {
    private lateinit var playerView: PlayerView
    private lateinit var trackBar: View
    private var player: ExoPlayer? = null
    private lateinit var url: String

    private class TrackOption(val group: Tracks.Group, val index: Int, val format: Format, val label: String, val selected: Boolean)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_player)
        playerView = findViewById(R.id.player)
        trackBar = findViewById(R.id.trackBar)
        url = intent.getStringExtra(EXTRA_URL) ?: run { finish(); return }
        findViewById<TextView>(R.id.playerTitle).text = intent.getStringExtra(EXTRA_TITLE) ?: ""

        findViewById<Button>(R.id.audioBtn).setOnClickListener { showAudioDialog() }
        findViewById<Button>(R.id.subsBtn).setOnClickListener { showSubtitleDialog() }
        // The Audio / Subtitles buttons appear and hide together with the playback controls.
        playerView.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility ->
            trackBar.visibility = visibility
        })
        playerView.subtitleView?.apply {
            setApplyEmbeddedStyles(false)
            setStyle(CaptionStyleCompat(Color.WHITE, Color.TRANSPARENT, Color.TRANSPARENT, CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW, Color.BLACK, null))
        }
        applySubtitleSize()
    }

    override fun onStart() {
        super.onStart()
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent("MovieHub-TV/1.0")
        intent.getStringExtra(EXTRA_AUTH)?.let { http.setDefaultRequestProperties(mapOf("Authorization" to it)) }

        val stem = url.substringAfterLast('/').substringBeforeLast('.').let { Uri.decode(it) }
        val subUrls = intent.getStringArrayListExtra(EXTRA_SUB_URLS).orEmpty()
        val subNames = intent.getStringArrayListExtra(EXTRA_SUB_NAMES).orEmpty()
        val sideloaded = subUrls.zip(subNames).mapIndexed { i, (subUrl, name) ->
            val lang = guessLanguage(name, stem)
            val mime = if (name.lowercase().endsWith(".vtt")) MimeTypes.TEXT_VTT else MimeTypes.APPLICATION_SUBRIP
            MediaItem.SubtitleConfiguration.Builder(Uri.parse(subUrl))
                .setMimeType(mime)
                .setLanguage(lang)
                .setLabel(name)
                // A file named like the video is switched on by default.
                .setSelectionFlags(if (i == 0 && name.startsWith(stem, ignoreCase = true)) C.SELECTION_FLAG_DEFAULT else 0)
                .build()
        }
        val item = MediaItem.Builder().setUri(Uri.parse(url)).setSubtitleConfigurations(sideloaded).build()

        val renderers = DefaultRenderersFactory(this)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
            .setEnableDecoderFallback(true)
        val p = ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(http))
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build()

        // Reuse the languages picked last time.
        val params = p.trackSelectionParameters.buildUpon()
        Prefs.audioLang(this).takeIf { it.isNotEmpty() }?.let { params.setPreferredAudioLanguage(it) }
        when (val sub = Prefs.subLang(this)) {
            "off" -> params.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            "" -> {}
            else -> params.setPreferredTextLanguage(sub)
        }
        p.trackSelectionParameters = params.build()

        p.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                Toast.makeText(
                    this@PlayerActivity,
                    "Can't play this file: ${error.errorCodeName}. The TV may not support its video format.",
                    Toast.LENGTH_LONG,
                ).show()
            }
        })
        p.setMediaItem(item, Prefs.position(this, url).let { if (it > 30_000) it else 0L })
        p.prepare()
        p.playWhenReady = true
        playerView.player = p
        playerView.controllerShowTimeoutMs = 4000
        playerView.requestFocus()
        player = p
    }

    override fun onStop() {
        super.onStop()
        player?.let {
            Prefs.savePosition(this, url, it.currentPosition, it.duration.coerceAtLeast(0))
            it.release()
        }
        player = null
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val p = player
        if (p != null && event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK -> { showAudioDialog(); return true }
                KeyEvent.KEYCODE_CAPTIONS -> { showSubtitleDialog(); return true }
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

    private fun tracksOf(type: Int): List<TrackOption> {
        val p = player ?: return emptyList()
        return p.currentTracks.groups.filter { it.type == type }.flatMap { g ->
            (0 until g.length).filter { g.isTrackSupported(it) }.map { i ->
                val f = g.getTrackFormat(i)
                TrackOption(g, i, f, describe(f, type), g.isTrackSelected(i))
            }
        }
    }

    private fun dialog() = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)

    private fun showAudioDialog() {
        val p = player ?: return
        val options = tracksOf(C.TRACK_TYPE_AUDIO)
        if (options.isEmpty()) { toast("This video has no audio track the TV can play"); return }
        dialog().setTitle(R.string.audio)
            .setSingleChoiceItems(options.map { it.label }.toTypedArray(), options.indexOfFirst { it.selected }) { d, which ->
                val o = options[which]
                p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
                    .setOverrideForType(TrackSelectionOverride(o.group.mediaTrackGroup, o.index))
                    .build()
                Prefs.setAudioLang(this, o.format.language.orEmpty())
                d.dismiss()
            }
            .show()
    }

    private fun showSubtitleDialog() {
        val p = player ?: return
        val options = tracksOf(C.TRACK_TYPE_TEXT)
        val off = p.trackSelectionParameters.disabledTrackTypes.contains(C.TRACK_TYPE_TEXT) || options.none { it.selected }
        val sizeLabel = getString(R.string.subtitle_size, (Prefs.subScale(this) * 100).toInt())
        val labels = listOf(getString(R.string.off)) + options.map { it.label } + sizeLabel
        val checked = if (off) 0 else options.indexOfFirst { it.selected } + 1
        dialog().setTitle(R.string.subtitles)
            .setSingleChoiceItems(labels.toTypedArray(), checked) { d, which ->
                d.dismiss()
                val b = p.trackSelectionParameters.buildUpon()
                when (which) {
                    0 -> {
                        p.trackSelectionParameters = b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()
                        Prefs.setSubLang(this, "off")
                    }
                    labels.size - 1 -> {
                        val sizes = listOf(0.8f, 1f, 1.3f, 1.6f, 2f)
                        val next = sizes[(sizes.indexOfFirst { it >= Prefs.subScale(this) - 0.01f } + 1) % sizes.size]
                        Prefs.setSubScale(this, next)
                        applySubtitleSize()
                        toast(getString(R.string.subtitle_size, (next * 100).toInt()))
                    }
                    else -> {
                        val o = options[which - 1]
                        p.trackSelectionParameters = b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                            .setOverrideForType(TrackSelectionOverride(o.group.mediaTrackGroup, o.index))
                            .build()
                        Prefs.setSubLang(this, o.format.language.orEmpty())
                    }
                }
            }
            .show()
    }

    private fun applySubtitleSize() {
        playerView.subtitleView?.setFractionalTextSize(SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * Prefs.subScale(this))
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

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

    /** "Movie.en.srt" next to "Movie.mkv" -> "en"; anything unrecognised -> null. */
    private fun guessLanguage(subName: String, videoStem: String): String? {
        val rest = subName.substringBeforeLast('.').let {
            if (it.startsWith(videoStem, ignoreCase = true)) it.substring(videoStem.length) else it
        }.trim('.', '_', '-', ' ')
        val token = rest.split('.', '_', '-', ' ').firstOrNull { it.isNotEmpty() }?.lowercase() ?: return null
        val byName = mapOf("english" to "en", "eng" to "en", "bangla" to "bn", "bengali" to "bn", "ben" to "bn", "hindi" to "hi", "hin" to "hi")
        return byName[token] ?: token.takeIf { it.length == 2 && Locale(it).getDisplayLanguage(Locale.ENGLISH) != it }
    }

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
        const val EXTRA_SUB_URLS = "subUrls"
        const val EXTRA_SUB_NAMES = "subNames"
        const val EXTRA_AUTH = "auth"
    }
}
