import Foundation

/// File system work. Everything here is synchronous and meant to run off the main thread.
enum DiskScanner {
    static let home = FileManager.default.homeDirectoryForCurrentUser.standardizedFileURL

    private static let sizeKeys: [URLResourceKey] = [
        .isRegularFileKey, .totalFileAllocatedSizeKey, .fileAllocatedSizeKey,
    ]

    static func items(for category: CleanupCategory) -> [CleanupItem] {
        let fm = FileManager.default
        let cutoff = category.minAgeDays.map { Date().addingTimeInterval(-Double($0) * 86_400) }
        var items: [CleanupItem] = []

        for relative in category.paths {
            let folder = home.appendingPathComponent(relative, isDirectory: true)
            // Fails quietly if the folder doesn't exist or needs Full Disk Access.
            guard let children = try? fm.contentsOfDirectory(
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
        return items.sorted { $0.size > $1.size }
    }

    /// Bytes actually used on disk by a file or everything inside a folder.
    static func allocatedSize(of url: URL) -> Int64 {
        let values = try? url.resourceValues(forKeys: Set(sizeKeys + [.isDirectoryKey]))
        guard values?.isDirectory == true else {
            return Int64(values?.totalFileAllocatedSize ?? values?.fileAllocatedSize ?? 0)
        }
        guard let enumerator = FileManager.default.enumerator(
            at: url, includingPropertiesForKeys: sizeKeys, options: [],
            errorHandler: { _, _ in true }
        ) else { return 0 }

        var total: Int64 = 0
        for case let file as URL in enumerator {
            guard let v = try? file.resourceValues(forKeys: Set(sizeKeys)), v.isRegularFile == true else {
                continue
            }
            total += Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)
        }
        return total
    }

    /// Files at least `minSize` bytes anywhere in your home folder, except ~/Library
    /// (app-managed data) and the inside of bundles such as apps or Photos libraries.
    static func largeFiles(minSize: Int64) -> [CleanupItem] {
        let library = home.appendingPathComponent("Library").path
        guard let enumerator = FileManager.default.enumerator(
            at: home, includingPropertiesForKeys: sizeKeys, options: [.skipsPackageDescendants],
            errorHandler: { _, _ in true }
        ) else { return [] }

        var found: [CleanupItem] = []
        for case let url as URL in enumerator {
            if url.path == library {
                enumerator.skipDescendants()
                continue
            }
            guard let v = try? url.resourceValues(forKeys: Set(sizeKeys)), v.isRegularFile == true else {
                continue
            }
            let size = Int64(v.totalFileAllocatedSize ?? v.fileAllocatedSize ?? 0)
            if size >= minSize { found.append(CleanupItem(url: url, size: size)) }
        }
        return found.sorted { $0.size > $1.size }
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
