package com.moviehub.tv

import android.content.Context
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.res.ResourcesCompat
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Cover for a title without a poster, like a book jacket: a palette from the website, a pattern, a big serif
 * initial in a ring, a gold frame, year and quality tags and the title. Same design as the Mac app's covers.
 */
class CoverDrawable(private val ctx: Context, rawName: String, private val folder: Boolean = false) : Drawable() {
    private val title = Names.cleanTitle(rawName)
    private val tags = listOfNotNull(Names.yearIn(rawName), Merge.qualityOf(rawName).ifEmpty { null })
    private val h = Ui.hue(title)
    private val pal = PALETTES[h % PALETTES.size]
    private val a = pal[0]
    private val b = pal[1]
    private val c = pal[2]
    private val pattern = h % 4
    private val mono = title.firstOrNull { it.isLetterOrDigit() }?.uppercaseChar()?.toString() ?: "✦"

    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val tp = TextPaint(Paint.ANTI_ALIAS_FLAG)
    private fun dp(v: Float) = v * ctx.resources.displayMetrics.density
    private fun alpha(color: Int, f: Float) = (color and 0x00FFFFFF) or ((255 * f).toInt() shl 24)

    override fun draw(canvas: Canvas) {
        val r = RectF(bounds)
        val w = r.width(); val hgt = r.height()
        if (w <= 0 || hgt <= 0) return
        val wide = w > hgt
        val save = canvas.save()
        val radius = dp(12f)
        canvas.clipPath(Path().apply { addRoundRect(r, radius, radius, Path.Direction.CW) })

        // background: deep gradient with a glow of the accent at the top right
        p.shader = LinearGradient(r.left, r.top, r.left + w * .35f, r.bottom, a, b, Shader.TileMode.CLAMP)
        canvas.drawRect(r, p)
        p.shader = RadialGradient(r.left + w * .85f, r.top, w * 1.1f, alpha(c, .35f), alpha(c, 0f), Shader.TileMode.CLAMP)
        canvas.drawRect(r, p)
        p.shader = null

        // pattern, fading out towards the bottom
        val layer = canvas.saveLayerAlpha(r, 110)
        p.color = alpha(c, .55f); p.style = Paint.Style.FILL; p.strokeWidth = dp(1.4f)
        when (pattern) {
            0 -> { val s = dp(13f); var y = r.top + s / 2; while (y < r.bottom) { var x = r.left + s / 2; while (x < r.right) { canvas.drawCircle(x, y, dp(1.2f), p); x += s }; y += s } }
            1 -> { p.style = Paint.Style.STROKE; val s = dp(13f); var x = r.left - hgt; while (x < r.right) { canvas.drawLine(x, r.bottom, x + hgt, r.top, p); x += s } }
            2 -> { p.style = Paint.Style.STROKE; val cx = r.left + w * .8f; val cy = r.top + hgt * .12f; for (i in 0 until 36) { val t = Math.toRadians(i * 10.0); canvas.drawLine(cx, cy, cx + (cos(t) * w * 2).toFloat(), cy + (sin(t) * w * 2).toFloat(), p) } }
            else -> { p.style = Paint.Style.STROKE; val cx = r.left + w * .85f; val cy = r.top + hgt * .1f; var rr = dp(16f); while (rr < w * 2) { canvas.drawCircle(cx, cy, rr, p); rr += dp(16f) } }
        }
        p.style = Paint.Style.FILL
        p.shader = LinearGradient(0f, r.top, 0f, r.bottom, intArrayOf(0x00000000, 0x00000000, 0xFF000000.toInt()), floatArrayOf(0f, .25f, .8f), Shader.TileMode.CLAMP)
        p.xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.DST_OUT)
        canvas.drawRect(r, p)
        p.xfermode = null; p.shader = null
        canvas.restoreToCount(layer)

        // the initial in a ring
        val size = if (wide) w * .34f else w * .64f
        val cx = if (wide) r.right - w * .26f else r.centerX()
        val cy = if (wide) r.top + hgt * .42f else r.top + hgt * .13f + size * .52f
        p.style = Paint.Style.STROKE
        p.strokeWidth = dp(1f); p.color = alpha(c, .3f)
        canvas.drawCircle(cx, cy, size * .55f, p)
        p.strokeWidth = dp(9f); p.color = alpha(c, .07f)
        canvas.drawCircle(cx, cy, size * .55f + dp(5f), p)
        tp.typeface = serif; tp.textSize = size; tp.textAlign = Paint.Align.CENTER
        val base = cy - (tp.descent() + tp.ascent()) / 2
        tp.style = Paint.Style.FILL
        tp.shader = LinearGradient(0f, cy - size / 2, 0f, cy + size / 2, alpha(c, .42f), alpha(c, .04f), Shader.TileMode.CLAMP)
        canvas.drawText(mono, cx, base, tp)
        tp.shader = null; tp.style = Paint.Style.STROKE; tp.strokeWidth = dp(1.3f); tp.color = alpha(c, .75f)
        canvas.drawText(mono, cx, base, tp)
        tp.style = Paint.Style.FILL; tp.textAlign = Paint.Align.LEFT

        // gold frame with a star top and bottom
        val inset = dp(7f)
        val fr = RectF(r.left + inset, r.top + inset, r.right - inset, r.bottom - inset)
        p.strokeWidth = dp(1.3f); p.color = alpha(c, .6f)
        canvas.drawRoundRect(fr, radius - inset / 2, radius - inset / 2, p)
        p.style = Paint.Style.FILL
        tp.color = c; tp.textSize = dp(10f); tp.textAlign = Paint.Align.CENTER; tp.typeface = Typeface.DEFAULT
        for (y in listOf(fr.top, fr.bottom)) {
            p.color = if (y == fr.top) blend(a, b, .1f) else b
            canvas.drawRect(fr.centerX() - dp(8f), y - dp(1.5f), fr.centerX() + dp(8f), y + dp(1.5f), p)
            canvas.drawText("✦", fr.centerX(), y + dp(3.5f), tp)
        }
        tp.textAlign = Paint.Align.LEFT

        // icon chip
        val chip = RectF(r.left + dp(15f), r.top + dp(15f), r.left + dp(41f), r.top + dp(41f))
        p.color = c
        canvas.drawRoundRect(chip, dp(8f), dp(8f), p)
        ResourcesCompat.getDrawable(ctx.resources, if (folder) R.drawable.ic_folder else R.drawable.ic_film, null)?.mutate()?.let { d ->
            d.setTint(b)
            val pad = dp(6f).toInt()
            d.setBounds(chip.left.toInt() + pad, chip.top.toInt() + pad, chip.right.toInt() - pad, chip.bottom.toInt() - pad)
            d.draw(canvas)
        }

        // title (bottom), with tags above it and a short accent line below
        val left = r.left + dp(15f)
        val textW = (if (wide) w * .55f else w - dp(30f)).toInt().coerceAtLeast(10)
        tp.typeface = display; tp.color = 0xFFFFFFFF.toInt()
        tp.textSize = if (wide) dp(26f) else min(dp(30f), w * .15f)
        tp.setShadowLayer(dp(6f), 0f, dp(2f), 0x73000000)
        val layout = StaticLayout(title.uppercase(), tp, textW, Layout.Alignment.ALIGN_NORMAL, .92f, 0f, false)
        val lines = min(layout.lineCount, if (wide) 2 else 4)
        val textH = layout.getLineBottom(lines - 1).toFloat()
        val lineY = r.bottom - dp(20f)
        val top = lineY - dp(8f) - textH
        canvas.save(); canvas.translate(left, top)
        canvas.clipRect(0f, 0f, textW.toFloat(), textH)
        layout.draw(canvas)
        canvas.restore()
        tp.clearShadowLayer()
        p.shader = LinearGradient(left, 0f, left + dp(34f), 0f, c, alpha(c, 0f), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(left, lineY, left + dp(34f), lineY + dp(3f), dp(2f), dp(2f), p)
        p.shader = null

        var x = left
        val tagY = top - dp(8f)
        tp.typeface = Typeface.DEFAULT_BOLD; tp.textSize = dp(10.5f)
        tags.forEachIndexed { i, t ->
            val tw = tp.measureText(t)
            val pill = RectF(x, tagY - dp(17f), x + tw + dp(14f), tagY)
            if (i == 0) { p.style = Paint.Style.FILL; p.color = c; canvas.drawRoundRect(pill, dp(9f), dp(9f), p); tp.color = b }
            else { p.style = Paint.Style.STROKE; p.strokeWidth = dp(1f); p.color = alpha(c, .7f); canvas.drawRoundRect(pill, dp(9f), dp(9f), p); tp.color = c }
            canvas.drawText(t, x + dp(7f), tagY - dp(5f), tp)
            x = pill.right + dp(5f)
        }
        p.style = Paint.Style.FILL
        canvas.restoreToCount(save)
    }

    private fun blend(x: Int, y: Int, f: Float): Int {
        fun ch(s: Int) = (((x shr s) and 255) * (1 - f) + ((y shr s) and 255) * f).toInt() shl s
        return (0xFF shl 24) or ch(16) or ch(8) or ch(0)
    }

    private val serif: Typeface? by lazy { ResourcesCompat.getFont(ctx, R.font.cinzel) ?: Typeface.SERIF }
    private val display: Typeface? by lazy { ResourcesCompat.getFont(ctx, R.font.bebas_neue) }

    override fun setAlpha(alpha: Int) {}
    override fun setColorFilter(colorFilter: ColorFilter?) {}
    @Deprecated("Deprecated in Java")
    override fun getOpacity() = PixelFormat.TRANSLUCENT

    companion object {
        /** Base, deep shade, accent: crimson, emerald, royal, amethyst, amber, teal, rose, olive, vermilion. */
        val PALETTES = listOf(
            intArrayOf(0xFFA3242F.toInt(), 0xFF2A070B.toInt(), 0xFFF5CF5B.toInt()),
            intArrayOf(0xFF127052.toInt(), 0xFF06231A.toInt(), 0xFFF5CF5B.toInt()),
            intArrayOf(0xFF2F4FB0.toInt(), 0xFF0D1330.toInt(), 0xFFF0C94E.toInt()),
            intArrayOf(0xFF6D2BB0.toInt(), 0xFF1C0A2C.toInt(), 0xFFFFC9E0.toInt()),
            intArrayOf(0xFFC06A1C.toInt(), 0xFF3A1708.toInt(), 0xFFFFE2A8.toInt()),
            intArrayOf(0xFF0E7C8C.toInt(), 0xFF05262C.toInt(), 0xFFFFD27A.toInt()),
            intArrayOf(0xFFB0285F.toInt(), 0xFF2C0716.toInt(), 0xFFFFD0E0.toInt()),
            intArrayOf(0xFF7A6A16.toInt(), 0xFF1C1806.toInt(), 0xFFF5E6A0.toInt()),
            intArrayOf(0xFFC23B22.toInt(), 0xFF350D06.toInt(), 0xFFFFD38A.toInt()),
        )
    }
}

