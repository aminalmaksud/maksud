package com.moviehub.tv

import android.content.Context
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.ForwardingAudioSink
import androidx.media3.exoplayer.text.TextOutput

/**
 * Renderers with user-adjustable sync:
 *  - audio: the audio sink's position drives the playback clock that video frames follow, so reporting it
 *    shifted by the offset moves the picture relative to the sound (positive = sound later);
 *  - subtitles: text renderers are asked for cues at a shifted time (positive = subtitles later).
 * The FFmpeg audio decoders (AC3/DTS…) use the same sink, so sync works for them too.
 */
@OptIn(UnstableApi::class)
class SyncRenderersFactory(
    context: Context,
    private val audioOffsetUs: () -> Long,
    private val subtitleOffsetUs: () -> Long,
) : DefaultRenderersFactory(context) {

    override fun buildAudioSink(context: Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean): AudioSink? {
        val sink = super.buildAudioSink(context, enableFloatOutput, enableAudioTrackPlaybackParams) ?: return null
        return object : ForwardingAudioSink(sink) {
            override fun getCurrentPositionUs(sourceEnded: Boolean): Long {
                val pos = super.getCurrentPositionUs(sourceEnded)
                return if (pos == AudioSink.CURRENT_POSITION_NOT_SET) pos else (pos + audioOffsetUs()).coerceAtLeast(0)
            }
        }
    }

    override fun buildTextRenderers(context: Context, output: TextOutput, outputLooper: Looper, extensionRendererMode: Int, out: ArrayList<Renderer>) {
        val first = out.size
        super.buildTextRenderers(context, output, outputLooper, extensionRendererMode, out)
        for (i in first until out.size) out[i] = OffsetRenderer(out[i], subtitleOffsetUs)
    }
}

/** Forwards everything to [inner], but renders as if playback were [offsetUs] earlier. */
@OptIn(UnstableApi::class)
private class OffsetRenderer(private val inner: Renderer, private val offsetUs: () -> Long) : Renderer by inner {
    override fun render(positionUs: Long, elapsedRealtimeUs: Long) = inner.render(positionUs - offsetUs(), elapsedRealtimeUs)
}
