import Foundation

enum Risk: String, Sendable {
    /// Rebuilt automatically by apps or tools. Pre-selected after a scan.
    case safe = "Safe"
    /// Might hold something you want. Never pre-selected.
    case review = "Review"
}

enum ScanKind: Sendable {
    /// Each direct child of the folder is one item.
    case contents
    /// Every file inside the folder (at any depth) at least this big is one item.
    case filesInside(minSize: Int64)
    /// Children that belong to apps that are no longer installed.
    case leftovers
}

/// A group of locations whose *contents* are candidates for removal.
/// The folders themselves are never deleted, only what's inside them.
struct CleanupCategory: Identifiable, Sendable {
    let id: String
    let name: String
    let detail: String
    let symbol: String
    /// Folders relative to the home directory. A "*" segment matches every subfolder.
    let paths: [String]
    let risk: Risk
    /// Child names to leave alone.
    var excluded: Set<String> = []
    /// Only include items not modified for this many days.
    var minAgeDays: Int? = nil
    var kind: ScanKind = .contents
}

private let protectedCacheNames: Set<String> = [
    "CloudKit", "com.apple.bird", "com.apple.homed", "FamilyCircle",
    "com.apple.containermanagerd", "local.maccleaner",
]

extension CleanupCategory {
    static let all: [CleanupCategory] = [
        CleanupCategory(
            id: "appCaches", name: "App Caches",
            detail: "Temporary data apps rebuild automatically. Quit apps first for best results.",
            symbol: "archivebox", paths: ["Library/Caches"], risk: .safe,
            excluded: protectedCacheNames),
        CleanupCategory(
            id: "sandboxCaches", name: "Sandboxed App Caches",
            detail: "Caches for Safari, App Store apps and other sandboxed apps. Rebuilt automatically.",
            symbol: "square.stack.3d.up", paths: ["Library/Containers/*/Data/Library/Caches"],
            risk: .safe, excluded: protectedCacheNames),
        CleanupCategory(
            id: "logs", name: "Logs & Crash Reports",
            detail: "Diagnostic logs written by apps and the system.",
            symbol: "doc.text", paths: ["Library/Logs"], risk: .safe),
        CleanupCategory(
            id: "derivedData", name: "Xcode DerivedData",
            detail: "Build intermediates. Xcode regenerates them on the next build.",
            symbol: "hammer", paths: ["Library/Developer/Xcode/DerivedData"], risk: .safe),
        CleanupCategory(
            id: "deviceSupport", name: "Xcode Device Support",
            detail: "Debug symbols for old iOS/watchOS/tvOS versions. Re-downloaded when a device connects.",
            symbol: "iphone",
            paths: ["Library/Developer/Xcode/iOS DeviceSupport",
                    "Library/Developer/Xcode/watchOS DeviceSupport",
                    "Library/Developer/Xcode/tvOS DeviceSupport"],
            risk: .safe),
        CleanupCategory(
            id: "simulatorCaches", name: "Simulator Caches",
            detail: "Caches used by the iOS Simulator.",
            symbol: "ipad.and.iphone", paths: ["Library/Developer/CoreSimulator/Caches"], risk: .safe),
        CleanupCategory(
            id: "mailDownloads", name: "Mail Attachments Cache",
            detail: "Copies of attachments you opened in Mail. The originals stay in your mail.",
            symbol: "paperclip",
            paths: ["Library/Containers/com.apple.mail/Data/Library/Mail Downloads"], risk: .safe),
        CleanupCategory(
            id: "deviceUpdates", name: "iPhone & iPad Update Files",
            detail: "iOS/iPadOS installers (.ipsw) Finder downloaded. Downloaded again if ever needed.",
            symbol: "arrow.down.app",
            paths: ["Library/iTunes/iPhone Software Updates", "Library/iTunes/iPad Software Updates",
                    "Library/iTunes/iPod Software Updates"],
            risk: .safe),
        CleanupCategory(
            id: "devCaches", name: "Developer Package Caches",
            detail: "npm, pip, Gradle, Cargo, Go and similar caches. Re-downloaded when needed.",
            symbol: "shippingbox",
            paths: [".npm/_cacache", ".cache", ".gradle/caches", ".cargo/registry/cache",
                    "go/pkg/mod/cache", ".pub-cache"],
            risk: .review),
        CleanupCategory(
            id: "xcodeArchives", name: "Xcode Archives",
            detail: "App builds you archived. Keep any you might need to re-submit or symbolicate.",
            symbol: "archivebox.fill", paths: ["Library/Developer/Xcode/Archives"], risk: .review),
        CleanupCategory(
            id: "iosBackups", name: "iPhone & iPad Backups",
            detail: "Local device backups made by Finder. Make sure you have a newer backup first.",
            symbol: "externaldrive.badge.timemachine",
            paths: ["Library/Application Support/MobileSync/Backup"], risk: .review),
        CleanupCategory(
            id: "messagesAttachments", name: "Messages Attachments",
            detail: "Photos, videos and files from Messages larger than 1 MB. They stop showing in chats on this Mac; other devices keep theirs.",
            symbol: "message", paths: ["Library/Messages/Attachments"], risk: .review,
            kind: .filesInside(minSize: 1_000_000)),
        CleanupCategory(
            id: "leftovers", name: "Uninstalled App Leftovers",
            detail: "Data from apps that are no longer installed and unused for 30+ days. Check each item.",
            symbol: "puzzlepiece.extension",
            paths: ["Library/Application Support", "Library/Containers", "Library/Saved Application State",
                    "Library/HTTPStorages", "Library/WebKit"],
            risk: .review, kind: .leftovers),
        CleanupCategory(
            id: "oldDownloads", name: "Old Downloads",
            detail: "Items in Downloads not modified in the last 90 days.",
            symbol: "arrow.down.circle", paths: ["Downloads"], risk: .review, minAgeDays: 90),
        CleanupCategory(
            id: "trash", name: "Trash",
            detail: "Items already in the Trash. These are always deleted permanently.",
            symbol: "trash", paths: [".Trash"], risk: .review),
    ]
}

struct CleanupItem: Identifiable, Sendable {
    let url: URL
    let size: Int64
    var id: URL { url }
    var name: String { url.lastPathComponent }

    /// Parent folder with the home directory shown as "~".
    var displayPath: String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let parent = url.deletingLastPathComponent().path
        return parent.hasPrefix(home) ? "~" + parent.dropFirst(home.count) : parent
    }
}

struct RemovalOutcome: Sendable {
    var removed: Set<URL> = []
    var freed: Int64 = 0
    var trashed: Int64 = 0
    var failures: [String] = []
}

func formatBytes(_ bytes: Int64) -> String {
    ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
}
