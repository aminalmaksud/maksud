package com.moviehub.tv

import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import java.util.Locale

/**
 * The one player of the app. It outlives the full-screen player so that Back can shrink the video into the corner
 * of the home screen (the mini player) while it keeps playing.
 */
@OptIn(UnstableApi::class)
object Playback {
    var player: ExoPlayer? = null
        private set
    /** The extras the player was started with; reopening the full-screen player uses them again. */
    var args: Bundle? = null
        private set
    var url = ""
        private set
    var fileName = ""
        private set
    val title: String get() = args?.getString(PlayerActivity.EXTRA_TITLE).orEmpty()

    // Sync, in microseconds; read live by the renderers (positive = later).
    @Volatile var audioSyncUs = 0L
    @Volatile var subSyncUs = 0L

    /** Called when playback stops for good (finished, or stopped from the mini player). */
    val onStopped = LinkedHashSet<() -> Unit>()

    fun isActive(u: String? = null) = player != null && (u == null || u == url)

    /** Starts [extras]' video, or hands back the player if that video is already playing. */
    fun start(context: Context, extras: Bundle): ExoPlayer {
        val ctx = context.applicationContext
        val u = extras.getString(PlayerActivity.EXTRA_URL).orEmpty()
        player?.let { if (u == url) return it; stop(ctx) }
        args = Bundle(extras); url = u
        fileName = extras.getString(PlayerActivity.EXTRA_NAME) ?: Uri.decode(u.substringAfterLast('/'))
        audioSyncUs = (Prefs.audioSync(ctx, u) * 1_000_000).toLong()
        subSyncUs = (Prefs.subSync(ctx, u) * 1_000_000).toLong()

        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent("MusingsofMaksudTV/1.0")
        extras.getString(PlayerActivity.EXTRA_AUTH)?.let { http.setDefaultRequestProperties(mapOf("Authorization" to it)) }

        val stem = Names.stem(fileName)
        val subUrls = extras.getStringArrayList(PlayerActivity.EXTRA_SUB_URLS).orEmpty()
        val subNames = extras.getStringArrayList(PlayerActivity.EXTRA_SUB_NAMES).orEmpty()
        val sideloaded = subUrls.zip(subNames).mapIndexed { i, (subUrl, name) ->
            val mime = if (name.lowercase().endsWith(".vtt")) MimeTypes.TEXT_VTT else MimeTypes.APPLICATION_SUBRIP
            MediaItem.SubtitleConfiguration.Builder(Uri.parse(subUrl))
                .setMimeType(mime)
                .setLanguage(guessLanguage(name, stem))
                .setLabel(name)
                // A file named like the video is switched on by default.
                .setSelectionFlags(if (i == 0 && name.startsWith(stem, ignoreCase = true)) C.SELECTION_FLAG_DEFAULT else 0)
                .build()
        }
        val item = MediaItem.Builder().setUri(Uri.parse(u)).setSubtitleConfigurations(sideloaded).build()

        val renderers = SyncRenderersFactory(ctx, { audioSyncUs }, { subSyncUs })
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
            .setEnableDecoderFallback(true)
        val p = ExoPlayer.Builder(ctx, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(http))
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build()

        // Reuse the languages picked last time.
        val params = p.trackSelectionParameters.buildUpon()
        Prefs.audioLang(ctx).takeIf { it.isNotEmpty() }?.let { params.setPreferredAudioLanguage(it) }
        when (val sub = Prefs.subLang(ctx)) {
            "off" -> params.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            "" -> {}
            else -> params.setPreferredTextLanguage(sub)
        }
        p.trackSelectionParameters = params.build()
        p.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) { if (state == Player.STATE_ENDED && player === p) stop(ctx) }
        })
        p.setMediaItem(item, Prefs.position(ctx, u).let { if (it > 30_000) it else 0L })
        p.prepare()
        p.playWhenReady = true
        player = p
        return p
    }

    /** Remembers where it is (resume point and "Continue watching"). */
    fun save(context: Context) {
        val p = player ?: return
        val dur = p.duration.coerceAtLeast(0)
        val pos = if (p.playbackState == Player.STATE_ENDED) dur else p.currentPosition
        Prefs.savePosition(context, url, pos, dur)
        Prefs.touchRecent(context, url, fileName, keep = pos > 30_000 && (dur == 0L || pos < dur - 60_000))
    }

    fun stop(context: Context) {
        val p = player ?: return
        save(context)
        player = null
        p.release()
        onStopped.toList().forEach { it() }
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
}
