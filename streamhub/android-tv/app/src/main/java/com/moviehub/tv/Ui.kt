package com.moviehub.tv

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.animation.DecelerateInterpolator
import kotlin.math.roundToInt

/** Look & feel helpers, styled after musingsofmaksud.com (parchment, maroon, gold, crimson panels). */
object Ui {
    val MAROON = 0xFF7A1820.toInt()
    val MAROON2 = 0xFFA3242F.toInt()
    val GOLD = 0xFFD4A33F.toInt()
    val GOLD2 = 0xFFF5CF5B.toInt()
    val PINK = 0xFFE23D6D.toInt()

    val TILE_COLORS = intArrayOf(0xFFF08A1C.toInt(), 0xFFB3262D.toInt(), 0xFF1F8A5B.toInt(), 0xFF2F6FD1.toInt(),
        0xFF8B3FD1.toInt(), 0xFFD4A33F.toInt(), 0xFFE23D6D.toInt(), 0xFF138A9E.toInt())

    /** Header panel gradients, one per library: crimson, gold, emerald, sapphire, violet. */
    val PANELS = listOf(
        intArrayOf(0xFF2A070B.toInt(), 0xFF561017.toInt(), 0xFF8A1B26.toInt(), 0xFFA52734.toInt()),
        intArrayOf(0xFF1D0F08.toInt(), 0xFF4A2A17.toInt(), 0xFFA2732A.toInt(), 0xFFF0C94E.toInt()),
        intArrayOf(0xFF06231A.toInt(), 0xFF0F4A35.toInt(), 0xFF1F8A5B.toInt(), 0xFF5CC489.toInt()),
        intArrayOf(0xFF0D1330.toInt(), 0xFF1F2F6B.toInt(), 0xFF3D5FC4.toInt(), 0xFF7EA2FF.toInt()),
        intArrayOf(0xFF1C0A2C.toInt(), 0xFF43166B.toInt(), 0xFF8B3FD1.toInt(), 0xFFC08BFF.toInt()),
    )

    fun dp(ctx: Context, v: Float) = (v * ctx.resources.displayMetrics.density).roundToInt()

    fun hue(s: String): Int { var h = 0; for (c in s) h = (h * 31 + c.code) % 360; return h }

    fun rounded(ctx: Context, color: Int, radiusDp: Float, strokeColor: Int? = null, strokeDp: Float = 0f) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(ctx, radiusDp).toFloat()
        if (strokeColor != null) setStroke(dp(ctx, strokeDp), strokeColor)
    }

    fun gradient(ctx: Context, colors: IntArray, radiusDp: Float, orientation: GradientDrawable.Orientation = GradientDrawable.Orientation.TL_BR) =
        GradientDrawable(orientation, colors).apply { cornerRadius = dp(ctx, radiusDp).toFloat() }

    /** Colourful stand-in poster, different for every title. */
    fun placeholder(ctx: Context, title: String): Drawable {
        val h = hue(title).toFloat()
        val c1 = Color.HSVToColor(floatArrayOf(h, .72f, .78f))
        val c2 = Color.HSVToColor(floatArrayOf((h + 25) % 360, .78f, .52f))
        val c3 = Color.HSVToColor(floatArrayOf((h + 45) % 360, .8f, .26f))
        return gradient(ctx, intArrayOf(c1, c2, c3), 16f)
    }

    fun tileColor(title: String) = TILE_COLORS[hue(title) % TILE_COLORS.size]

    fun rowIcon(title: String): Int {
        val t = title.lowercase()
        return when {
            Names.isYearFolder(title) -> R.drawable.ic_calendar
            Regex("anime|cartoon|animation").containsMatchIn(t) -> R.drawable.ic_spark
            Regex("series|tv|show|season|drama").containsMatchIn(t) -> R.drawable.ic_tv
            Regex("foreign|korean|hindi|bangla|tamil|telugu|english|chinese|japanese|dubbed").containsMatchIn(t) -> R.drawable.ic_globe
            Regex("top|imdb|best|award").containsMatchIn(t) -> R.drawable.ic_star
            else -> R.drawable.ic_film
        }
    }

    /** Focused items grow a little, as on the big screen you need to see where you are. */
    fun focusZoom(v: View, scale: Float = 1.08f) {
        v.setOnFocusChangeListener { view, focused ->
            view.animate().scaleX(if (focused) scale else 1f).scaleY(if (focused) scale else 1f)
                .translationZ(if (focused) dp(view.context, 8f).toFloat() else 0f)
                .setInterpolator(DecelerateInterpolator()).setDuration(160).start()
        }
    }
}

/** Parchment background with a faint dotted grid and scattered gold specks, as on the website. */
class ParchmentDrawable(private val ctx: Context) : Drawable() {
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x147A1820 }
    private val speck = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x99D4A33F.toInt() }
    private val specks = listOf(.12f to .18f, .63f to .09f, .82f to .31f, .28f to .64f, .91f to .72f, .47f to .88f, .06f to .92f, .38f to .27f)

    override fun draw(canvas: Canvas) {
        val b = bounds
        canvas.drawColor(0xFFF6EFE4.toInt())
        val step = Ui.dp(ctx, 22f).toFloat()
        val r = Ui.dp(ctx, 1.1f).toFloat()
        var y = step / 2
        while (y < b.height()) {
            var x = step / 2
            while (x < b.width()) { canvas.drawCircle(x, y, r, dot); x += step }
            y += step
        }
        val sr = Ui.dp(ctx, 2.2f).toFloat()
        for ((fx, fy) in specks) canvas.drawCircle(b.width() * fx, b.height() * fy, sr, speck)
    }

    override fun setAlpha(alpha: Int) {}
    override fun setColorFilter(colorFilter: ColorFilter?) {}
    @Deprecated("Deprecated in Java")
    override fun getOpacity() = PixelFormat.OPAQUE
}
