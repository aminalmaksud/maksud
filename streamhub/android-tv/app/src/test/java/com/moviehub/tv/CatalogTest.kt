package com.moviehub.tv

import org.junit.Assert.assertEquals
import org.junit.Test

class CatalogTest {
    private fun dir(n: String, u: String) = Entry(n, u, Kind.DIR)
    private fun vid(n: String, u: String) = Entry(n, u, Kind.VIDEO)

    @Test fun groupsLibrariesThatDifferOnlyByQuality() {
        assertEquals(Merge.groupKey("Movies"), Merge.groupKey("Movies 1080p"))
        assertEquals(Merge.groupKey("Movies"), Merge.groupKey("Movies (4K)"))
        assertEquals("tv web series", Merge.groupKey("TV & Web Series"))
    }

    @Test fun joinsCategoryAndYearFolders() {
        val a = listOf(dir("English Movies (1080p)", "http://a/EM/"), dir("TV & WEB Series", "http://a/TV/"))
        val b = listOf(dir("English Movies", "http://b/EM/"), dir("Hindi Movies", "http://b/HM/"))
        val m = Merge.merge(listOf(a to "Movies 1080p", b to "Movies"))
        assertEquals(listOf("English Movies", "TV & WEB Series", "Hindi Movies"), m.map { it.name })
        assertEquals(listOf("http://a/EM/", "http://b/EM/"), m[0].sources)
        assertEquals(listOf("(2024)"), Merge.merge(listOf(listOf(dir("(2024) 1080p", "x")) to "", listOf(dir("(2024)", "y")) to "")).map { it.name })
    }

    @Test fun oneMovieTwoVersionsBestFirst() {
        val a = listOf(vid("Dune.Part.Two.2024.720p.mp4", "http://b/d720.mp4"))
        val b = listOf(vid("Dune.Part.Two.2024.1080p.WEB-DL.mkv", "http://a/d1080.mkv"), Entry("poster.jpg", "http://a/p.jpg", Kind.IMAGE))
        val m = Merge.merge(listOf(a to "Movies", b to "Movies 1080p"))
        assertEquals(2, m.size)
        val dune = m.first { it.kind == Kind.VIDEO }
        assertEquals(listOf("1080p", "720p"), dune.versions.map { it.quality })
        assertEquals("http://a/d1080.mkv", dune.url)
    }

    @Test fun qualityFallsBackToLibraryName() {
        val m = Merge.merge(listOf(listOf(vid("Jawan.2023.mkv", "a")) to "Movies", listOf(vid("Jawan.2023.720p.mkv", "b")) to "Movies HD"))
        assertEquals(listOf("720p", "Movies"), m[0].versions.map { it.quality })
    }

    @Test fun joinedFolderTakesTheBestName() {
        val m = Merge.merge(listOf(listOf(dir("Dune Part Two (2024) 720p", "a")) to "Movies", listOf(dir("Dune Part Two (2024) 1080p", "b")) to "Movies 1080p"))
        assertEquals("Dune Part Two (2024) 1080p", m[0].name)
        val n = Merge.merge(listOf(listOf(dir("Dune Part Two (2024) 1080p", "b")) to "", listOf(dir("Dune Part Two (2024)", "a")) to ""))
        assertEquals("Dune Part Two (2024)", n[0].name)
    }

    @Test fun differentTitlesStaySeparate() {
        val m = Merge.merge(listOf(listOf(dir("Dune (2021)", "a")) to "", listOf(dir("Dune Part Two (2024)", "b")) to ""))
        assertEquals(2, m.size)
    }

    @Test fun namesParseForCovers() {
        assertEquals("Breaking Bad", Names.cleanTitle("Breaking Bad (TV Series 2008–2013) 1080p"))
        assertEquals("Oppenheimer", Names.cleanTitle("Oppenheimer (2023) 1080p"))
        assertEquals("Interstellar", Names.cleanTitle("Interstellar.2014.2160p.mkv"))
        assertEquals("(2024)", Names.cleanTitle("(2024)"))
        assertEquals("2012", Names.cleanTitle("2012 (2009)"))
        assertEquals("2023", Names.yearIn("Oppenheimer (2023) 1080p"))
    }
}
