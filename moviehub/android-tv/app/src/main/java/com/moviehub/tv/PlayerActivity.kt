package com.moviehub.tv

import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView

class PlayerActivity : ComponentActivity() {
    private lateinit var playerView: PlayerView
    private var player: ExoPlayer? = null
    private lateinit var url: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_player)
        playerView = findViewById(R.id.player)
        url = intent.getStringExtra(EXTRA_URL) ?: run { finish(); return }
    }

    override fun onStart() {
        super.onStart()
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent("MovieHub-TV/1.0")
        intent.getStringExtra(EXTRA_AUTH)?.let { http.setDefaultRequestProperties(mapOf("Authorization" to it)) }

        val item = MediaItem.Builder().setUri(Uri.parse(url)).apply {
            intent.getStringExtra(EXTRA_SUB)?.let { sub ->
                val mime = if (sub.lowercase().endsWith(".vtt")) MimeTypes.TEXT_VTT else MimeTypes.APPLICATION_SUBRIP
                setSubtitleConfigurations(
                    listOf(MediaItem.SubtitleConfiguration.Builder(Uri.parse(sub)).setMimeType(mime).setLanguage("en").build())
                )
            }
        }.build()

        val p = ExoPlayer.Builder(this, DefaultRenderersFactory(this).setEnableDecoderFallback(true))
            .setMediaSourceFactory(DefaultMediaSourceFactory(http))
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build()
        p.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                Toast.makeText(
                    this@PlayerActivity,
                    "Can't play this file: ${error.errorCodeName}. The TV may not support its video/audio format.",
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

    /** With the controls hidden, left/right on the remote skips 10s instead of just popping the bar up. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val p = player
        if (p != null && event.action == KeyEvent.ACTION_DOWN && !playerView.isControllerFullyVisible) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_RIGHT -> { p.seekForward(); return true }
                KeyEvent.KEYCODE_DPAD_LEFT -> { p.seekBack(); return true }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
        const val EXTRA_SUB = "sub"
        const val EXTRA_AUTH = "auth"
    }
}
