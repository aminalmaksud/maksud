package com.moviehub.tv

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import androidx.activity.ComponentActivity

class SettingsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        val server = findViewById<EditText>(R.id.server)
        val user = findViewById<EditText>(R.id.user)
        val pass = findViewById<EditText>(R.id.pass)
        server.setText(Prefs.servers(this).joinToString("\n"))
        user.setText(Prefs.username(this))
        pass.setText(Prefs.password(this))
        findViewById<Button>(R.id.dhakaflix).setOnClickListener { server.setText(DHAKAFLIX) }
        findViewById<Button>(R.id.save).setOnClickListener {
            val servers = server.text.toString().split('\n').map { Library.normalizeLine(it) }.filter { it.isNotEmpty() }
            Prefs.saveServers(this, servers, user.text.toString().trim(), pass.text.toString())
            finish()
        }
    }

    companion object {
        /** DhakaFlix BDIX servers (reachable through ISPs that peer with them). */
        val DHAKAFLIX = listOf(
            "Movies | http://172.16.50.7/DHAKA-FLIX-7/",
            "Movies 1080p | http://172.16.50.14/DHAKA-FLIX-14/",
            "TV & Web Series | http://172.16.50.12/DHAKA-FLIX-12/",
            "Anime & Cartoons | http://172.16.50.10/DHAKA-FLIX-10/",
        ).joinToString("\n")
    }
}
