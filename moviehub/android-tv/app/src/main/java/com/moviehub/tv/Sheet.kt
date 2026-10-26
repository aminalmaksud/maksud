package com.moviehub.tv

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.StateListDrawable
import android.view.Gravity
import android.view.ViewGroup
import android.view.Window
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat

/** A small dark card of choices for the remote: "Play 1080p", "Add to My List", "Remove from Continue watching"… */
object Sheet {
    class Option(val label: String, val sub: String = "", val action: () -> Unit)

    fun show(activity: Activity, title: String, subtitle: String, options: List<Option>): Dialog {
        val d = Dialog(activity)
        d.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val ctx = activity
        val box = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(Ui.dp(ctx, 26f), Ui.dp(ctx, 22f), Ui.dp(ctx, 26f), Ui.dp(ctx, 22f))
            background = Ui.rounded(ctx, 0xF51E0A0C.toInt(), 26f, 0x66F5CF5B, 1.5f)
        }
        box.addView(TextView(ctx).apply {
            text = title.uppercase()
            typeface = ResourcesCompat.getFont(ctx, R.font.bebas_neue)
            textSize = 34f
            setTextColor(Color.WHITE)
            maxLines = 2
        })
        if (subtitle.isNotEmpty()) box.addView(TextView(ctx).apply {
            text = subtitle; textSize = 14f; setTextColor(Ui.GOLD2)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(0, 0, 0, Ui.dp(ctx, 10f))
        })
        options.forEachIndexed { i, o ->
            box.addView(TextView(ctx).apply {
                text = if (o.sub.isEmpty()) o.label else android.text.SpannableString("${o.label}\n${o.sub}").apply {
                    val from = o.label.length + 1
                    setSpan(android.text.style.RelativeSizeSpan(.72f), from, length, 0)
                    setSpan(android.text.style.ForegroundColorSpan(0xFFCDB8A4.toInt()), from, length, 0)
                    setSpan(android.text.style.StyleSpan(Typeface.NORMAL), from, length, 0)
                }
                textSize = 18f
                setTextColor(Color.WHITE)
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                gravity = Gravity.CENTER_VERTICAL
                setPadding(Ui.dp(ctx, 18f), Ui.dp(ctx, 12f), Ui.dp(ctx, 18f), Ui.dp(ctx, 12f))
                background = StateListDrawable().apply {
                    addState(intArrayOf(android.R.attr.state_focused), Ui.gradient(ctx, intArrayOf(Ui.MAROON2, Ui.MAROON), 14f).apply { setStroke(Ui.dp(ctx, 3f), Ui.GOLD2) })
                    addState(intArrayOf(), Ui.rounded(ctx, 0x14FFFFFF, 14f))
                }
                isFocusable = true
                setOnClickListener { d.dismiss(); o.action() }
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = Ui.dp(ctx, 8f) }
                if (i == 0) post { requestFocus() }
            })
        }
        d.setContentView(box, ViewGroup.LayoutParams(Ui.dp(ctx, 460f), ViewGroup.LayoutParams.WRAP_CONTENT))
        d.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        d.show()
        return d
    }
}
