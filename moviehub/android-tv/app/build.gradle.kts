plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.moviehub.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.moviehub.tv"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("io.coil-kt:coil:2.6.0")
    implementation("androidx.media3:media3-exoplayer:1.5.0")
    implementation("androidx.media3:media3-ui:1.5.0")
    // Software decoders for AC3 / E-AC3 / DTS / TrueHD when the TV can't decode them itself.
    implementation("org.jellyfin.media3:media3-ffmpeg-decoder:1.5.0+1")

    // Unit tests: plain Kotlin logic, and the real screens under Robolectric (see ScreensTest).
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.6.1")
}

tasks.withType<Test>().configureEach {
    maxHeapSize = "2g"
    testLogging {
        showStandardStreams = true
        events("passed", "failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
