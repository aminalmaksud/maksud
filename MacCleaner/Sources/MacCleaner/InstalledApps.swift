import Foundation

/// What's installed on this Mac, used to decide whether a folder in ~/Library belongs to a removed app.
/// It errs on the side of "still installed": anything it can't confidently rule out is kept.
struct InstalledApps {
    private var bundleIDs: Set<String> = []
    /// First two parts of each bundle ID ("com.microsoft"), so shared vendor folders are kept.
    private var vendors: Set<String> = []
    /// Normalized app names and bundle ID parts ("googlechrome", "chrome").
    private var names: Set<String> = []

    /// Folders macOS itself creates in ~/Library/Application Support and similar places.
    private static let systemFolders: Set<String> = [
        "addressbook", "animoji", "appstore", "applemediaservices", "callhistorydb",
        "callhistorytransactions", "clouddocs", "contextstoreagent", "coreparsec", "crashreporter",
        "differentialprivacy", "diskimages", "dock", "facetime", "familycircled", "fileprovider",
        "homeenergyd", "icdd", "icloud", "identityservicesd", "ilifemediabrowser", "knowledge",
        "locationaccessstored", "mobilesync", "networkserviceproxy", "proapps", "quicklook",
        "syncservices", "transparencyd", "ubiquity", "videosubscriptionsd", "caches", "accounts",
        "accountsd", "siri", "spotlight", "stocks", "weather", "maps", "shortcuts", "photos",
        "music", "tv", "podcasts", "books", "news", "mail", "safari", "notes", "reminders",
        "calendar", "contacts", "messages", "freeform", "keychain", "storekit", "assistant",
        "cloudkit", "mobiledevice", "itunes", "garageband", "imovie", "logic", "finalcut",
        "launchpad", "systempreferences", "systemsettings", "screentime", "wallpaper",
    ]

    static func load() -> InstalledApps {
        var apps = InstalledApps()
        for url in applicationURLs() {
            let bundle = Bundle(url: url)
            if let id = bundle?.bundleIdentifier?.lowercased() {
                apps.bundleIDs.insert(id)
                let parts = id.split(separator: ".").map(String.init)
                if parts.count >= 2 { apps.vendors.insert(parts[0...1].joined(separator: ".")) }
                for part in parts.dropFirst(2) { apps.insertName(part) }
            }
            apps.insertName(url.deletingPathExtension().lastPathComponent)
            for key in ["CFBundleName", "CFBundleDisplayName", "CFBundleExecutable"] {
                if let name = bundle?.object(forInfoDictionaryKey: key) as? String { apps.insertName(name) }
            }
        }
        return apps
    }

    /// Words too common in app names to tell apps apart.
    private static let genericWords: Set<String> = [
        "app", "apps", "mac", "macos", "osx", "helper", "agent", "desktop", "client", "plus", "pro",
        "lite", "free", "launcher", "updater", "update", "service", "daemon", "extension", "widget",
        "beta", "main", "core", "data", "support", "tool", "tools", "player", "installer", "uninstaller",
    ]

    private mutating func insertName(_ name: String) {
        let n = Self.normalize(name)
        if n.count >= 3 && !Self.genericWords.contains(n) { names.insert(n) }
    }

    private static func normalize(_ s: String) -> String {
        String(s.lowercased().unicodeScalars.filter(CharacterSet.alphanumerics.contains).map(Character.init))
    }

    func owns(folderNamed rawName: String) -> Bool {
        var name = rawName.lowercased()
        if name.hasSuffix(".savedstate") { name = String(name.dropLast(".savedstate".count)) }
        if name.hasPrefix(".") || name.hasPrefix("com.apple.") || name.hasPrefix("group.com.apple.") {
            return true
        }

        let parts = name.split(separator: ".").map(String.init)
        if parts.count >= 3 {
            // Looks like a bundle ID.
            if bundleIDs.contains(where: { name == $0 || name.hasPrefix($0 + ".") || $0.hasPrefix(name + ".") }) {
                return true
            }
            return vendors.contains(parts[0...1].joined(separator: "."))
        }

        let n = Self.normalize(name)
        if n.count < 3 || Self.systemFolders.contains(n) { return true }
        // Substring matches ("Google" vs "Google Chrome") only when the shorter word is distinctive enough.
        return names.contains { app in
            app == n || (min(app.count, n.count) >= 4 && (app.contains(n) || n.contains(app)))
        }
    }

    /// Every app Spotlight knows about, plus the usual app folders in case Spotlight is off.
    private static func applicationURLs() -> Set<URL> {
        var urls = Set<URL>()

        let mdfind = Process()
        mdfind.executableURL = URL(fileURLWithPath: "/usr/bin/mdfind")
        mdfind.arguments = ["kMDItemContentType == 'com.apple.application-bundle'"]
        let pipe = Pipe()
        mdfind.standardOutput = pipe
        mdfind.standardError = FileHandle.nullDevice
        if (try? mdfind.run()) != nil {
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            mdfind.waitUntilExit()
            for line in String(decoding: data, as: UTF8.self).split(separator: "\n") {
                urls.insert(URL(fileURLWithPath: String(line)))
            }
        }

        let folders = ["/Applications", "/System/Applications", "/System/Library/CoreServices",
                       DiskScanner.home.appendingPathComponent("Applications").path]
        for folder in folders {
            guard let enumerator = FileManager.default.enumerator(
                at: URL(fileURLWithPath: folder), includingPropertiesForKeys: nil,
                options: [.skipsPackageDescendants, .skipsHiddenFiles]
            ) else { continue }
            for case let url as URL in enumerator where url.pathExtension == "app" {
                urls.insert(url)
            }
        }
        return urls
    }
}
