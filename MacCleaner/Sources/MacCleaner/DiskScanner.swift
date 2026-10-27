import CryptoKit
import Foundation

/// File system work. Everything here is synchronous and meant to run off the main thread.
enum DiskScanner {
    static let home = FileManager.default.homeDirectoryForCurrentUser.standardizedFileURL

    private static let sizeKeys: [URLResourceKey] = [
        .isRegularFileKey, .totalFileAllocatedSizeKey, .fileAllocatedSizeKey,
    ]

    static func items(for category: CleanupCategory) -> [CleanupItem] {
        let folders = category.paths.flatMap(folders(matching:))
        let items: [CleanupItem]
        switch category.kind {
        case .contents:
            items = contents(of: folders, category: category)
        case .filesInside(let minSize):
            items = folders.flatMap { files(in: $0, minSize: minSize) }
        case .leftovers:
            items = leftovers(in: folders)
        }
        return items.sorted { $0.size > $1.size }
    }

    /// Resolves a home-relative path where a "*" segment matches every subfolder.
    static func folders(matching relative: String) -> [URL] {
        var current = [home]
        for part in relative.split(separator: "/").map(String.init) {
            if part == "*" {
                current = current.flatMap {
                    (try? FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil)) ?? []
                }
            } else {
                current = current.map { $0.appendingPathComponent(part, isDirectory: true) }
            }
        }
        return current
    }

    private static func contents(of folders: [URL], category: CleanupCategory) -> [CleanupItem] {
        let cutoff = category.minAgeDays.map { Date().addingTimeInterval(-Double($0) * 86_400) }
        var items: [CleanupItem] = []

        for folder in folders {
            // Fails quietly if the folder doesn't exist or needs Full Disk Access.
            guard let children = try? FileManager.default.contentsOfDirectory(
                at: folder, includingPropertiesForKeys: [.contentModificationDateKey]
            ) else { continue }

            for child in children {
                let name = child.lastPathComponent
                if name == ".DS_Store" || name == ".localized" || category.excluded.contains(name) {
                    continue
                }
                if let cutoff {
                    let modified = (try? child.resourceValues(forKeys: [.contentModificationDateKey]))?
                        .contentModificationDate ?? .distantFuture
                    if modified > cutoff { continue }
                }
                let size = allocatedSize(of: child)
                if size > 0 { items.append(CleanupItem(url: child, size: size)) }
            }
        }
        return items
    }

    private static func files(in folder: URL, minSize: Int64) -> [CleanupItem] {
        guard let enumerator = FileManager.default.enumerator(
            at: folder, includingPropertiesForKeys: sizeKeys, options: [],
            errorHandler: { _, _ in true }
        ) else { return [] }

        var found: [CleanupItem] = []
        for case let url as URL in enumerator {
            guard let v = try? url.resourceValues(forKeys: Set(sizeKeys)), v.isRegularFile == true else {
                continue
            }
            let size = Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)
            if size >= minSize { found.append(CleanupItem(url: url, size: size)) }
        }
        return found
    }

    /// Children of the folders that no installed app claims and that nothing has touched in 30 days.
    private static func leftovers(in folders: [URL]) -> [CleanupItem] {
        let apps = InstalledApps.load()
        let cutoff = Date().addingTimeInterval(-30 * 86_400)
        var items: [CleanupItem] = []

        for folder in folders {
            guard let children = try? FileManager.default.contentsOfDirectory(
                at: folder, includingPropertiesForKeys: nil
            ) else { continue }

            for child in children where !apps.owns(folderNamed: child.lastPathComponent) {
                let usage = usage(of: child)
                if usage.size > 0 && usage.lastModified < cutoff {
                    items.append(CleanupItem(url: child, size: usage.size))
                }
            }
        }
        return items
    }

    /// Bytes actually used on disk by a file or everything inside a folder.
    static func allocatedSize(of url: URL) -> Int64 { usage(of: url).size }

    /// Bytes used on disk, plus the newest modification date of anything inside.
    static func usage(of url: URL) -> (size: Int64, lastModified: Date) {
        let keys = sizeKeys + [.contentModificationDateKey]
        let values = try? url.resourceValues(forKeys: Set(keys + [.isDirectoryKey]))
        var latest = values?.contentModificationDate ?? .distantPast
        guard values?.isDirectory == true else {
            return (Int64(values?.totalFileAllocatedSize ?? values?.fileAllocatedSize ?? 0), latest)
        }
        guard let enumerator = FileManager.default.enumerator(
            at: url, includingPropertiesForKeys: keys, options: [],
            errorHandler: { _, _ in true }
        ) else { return (0, latest) }

        var total: Int64 = 0
        for case let file as URL in enumerator {
            guard let v = try? file.resourceValues(forKeys: Set(keys)) else { continue }
            if let modified = v.contentModificationDate, modified > latest { latest = modified }
            if v.isRegularFile == true {
                total += Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)
            }
        }
        return (total, latest)
    }

    /// Visits every regular file in the home folder, except ~/Library (app-managed data),
    /// hidden folders when `skipHidden` is set, and the inside of bundles such as apps or Photos libraries.
    private static func forEachUserFile(keys: [URLResourceKey], skipHidden: Bool,
                                        _ body: (URL, URLResourceValues) -> Void) {
        let library = home.appendingPathComponent("Library").path
        var options: FileManager.DirectoryEnumerationOptions = [.skipsPackageDescendants]
        if skipHidden { options.insert(.skipsHiddenFiles) }
        guard let enumerator = FileManager.default.enumerator(
            at: home, includingPropertiesForKeys: keys, options: options,
            errorHandler: { _, _ in true }
        ) else { return }

        for case let url as URL in enumerator {
            if url.path == library {
                enumerator.skipDescendants()
                continue
            }
            guard let v = try? url.resourceValues(forKeys: Set(keys)), v.isRegularFile == true else {
                continue
            }
            body(url, v)
        }
    }

    static func largeFiles(minSize: Int64) -> [CleanupItem] {
        var found: [CleanupItem] = []
        forEachUserFile(keys: sizeKeys, skipHidden: false) { url, v in
            let size = Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)
            if size >= minSize { found.append(CleanupItem(url: url, size: size)) }
        }
        return found.sorted { $0.size > $1.size }
    }

    /// Groups of files with identical contents, biggest waste first.
    /// Within a group the oldest file comes first; that's the copy "Select extras" keeps.
    static func duplicateGroups(minSize: Int64) -> [[CleanupItem]] {
        struct Candidate {
            let url: URL
            let allocated: Int64
            let modified: Date
        }
        let keys = sizeKeys + [.fileSizeKey, .fileResourceIdentifierKey, .contentModificationDateKey]

        // 1. Bucket by exact byte size; only same-size files can match.
        //    Files with nothing on disk (e.g. iCloud placeholders) are skipped so they aren't downloaded.
        var bySize: [Int: [Candidate]] = [:]
        var seenFiles = Set<NSObject>()
        forEachUserFile(keys: keys, skipHidden: true) { url, v in
            let allocated = Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)
            guard allocated >= minSize, let size = v.fileSize else { return }
            // Hard links are the same file, not duplicates.
            if let id = v.fileResourceIdentifier as? NSObject, !seenFiles.insert(id).inserted { return }
            bySize[size, default: []].append(
                Candidate(url: url, allocated: allocated, modified: v.contentModificationDate ?? .distantPast))
        }

        // 2. Narrow with a hash of the first 64 KB, then confirm with a hash of the whole file.
        var groups: [[CleanupItem]] = []
        for bucket in bySize.values where bucket.count > 1 {
            for quick in Dictionary(grouping: bucket, by: { sha256($0.url, limit: 65_536) ?? UUID().uuidString }).values
            where quick.count > 1 {
                for full in Dictionary(grouping: quick, by: { sha256($0.url, limit: nil) ?? UUID().uuidString }).values
                where full.count > 1 {
                    groups.append(full.sorted { $0.modified < $1.modified }
                        .map { CleanupItem(url: $0.url, size: $0.allocated) })
                }
            }
        }
        return groups.sorted { wasted(by: $0) > wasted(by: $1) }
    }

    static func wasted(by group: [CleanupItem]) -> Int64 {
        group.dropFirst().reduce(0) { $0 + $1.size }
    }

    private static func sha256(_ url: URL, limit: Int?) -> String? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        var hasher = SHA256()
        var remaining = limit ?? Int.max
        while remaining > 0 {
            let chunk: Data? = autoreleasepool { try? handle.read(upToCount: min(1 << 20, remaining)) }
            guard let chunk, !chunk.isEmpty else { break }
            hasher.update(data: chunk)
            remaining -= chunk.count
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// Moves items to the Trash, or deletes them when `permanently` is set.
    /// Items already in the Trash are always deleted. Refuses anything outside the home folder.
    static func remove(_ items: [CleanupItem], permanently: Bool) -> RemovalOutcome {
        let fm = FileManager.default
        let homePath = home.path + "/"
        let trashPath = home.appendingPathComponent(".Trash").path + "/"
        var outcome = RemovalOutcome()

        for item in items {
            let path = item.url.standardizedFileURL.path
            guard path.hasPrefix(homePath) else {
                outcome.failures.append("\(item.name): outside your home folder, skipped")
                continue
            }
            do {
                if permanently || path.hasPrefix(trashPath) {
                    try fm.removeItem(at: item.url)
                    outcome.freed += item.size
                } else {
                    try fm.trashItem(at: item.url, resultingItemURL: nil)
                    outcome.trashed += item.size
                }
                outcome.removed.insert(item.url)
            } catch {
                outcome.failures.append("\(item.name): \(error.localizedDescription)")
            }
        }
        return outcome
    }

    /// (free, total) bytes for the startup disk.
    static func diskSpace() -> (free: Int64, total: Int64) {
        let values = try? URL(fileURLWithPath: "/").resourceValues(forKeys: [
            .volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey,
        ])
        return (values?.volumeAvailableCapacityForImportantUsage ?? 0,
                Int64(values?.volumeTotalCapacity ?? 0))
    }
}
