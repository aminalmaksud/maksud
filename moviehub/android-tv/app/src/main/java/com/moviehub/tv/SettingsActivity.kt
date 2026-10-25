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
        server.setText(Prefs.serverUrl(this))
        user.setText(Prefs.username(this))
        pass.setText(Prefs.password(this))
        findViewById<Button>(R.id.save).setOnClickListener {
            Prefs.saveServer(this, Library.normalize(server.text.toString()), user.text.toString().trim(), pass.text.toString())
            finish()
        }
    }
}
