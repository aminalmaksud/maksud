import Foundation

@MainActor
final class CleanerModel: ObservableObject {
    @Published private(set) var results: [String: [CleanupItem]] = [:]
    @Published var selected: Set<URL> = []

    @Published private(set) var largeFiles: [CleanupItem] = []
    @Published var largeSelected: Set<URL> = []
    @Published var largeThresholdMB = 500
    @Published private(set) var hasSearchedLargeFiles = false

    @Published private(set) var duplicateGroups: [[CleanupItem]] = []
    @Published var duplicateSelected: Set<URL> = []
    @Published var duplicateMinMB = 10
    @Published private(set) var hasSearchedDuplicates = false

    @Published var deletePermanently = false
    /// Non-nil while scanning or cleaning; describes what's happening.
    @Published private(set) var busy: String?
    @Published var message: String?

    @Published private(set) var freeSpace: Int64 = 0
    @Published private(set) var totalSpace: Int64 = 0

    init() { refreshDiskSpace() }

    func items(in category: CleanupCategory) -> [CleanupItem] { results[category.id] ?? [] }

    func size(of category: CleanupCategory) -> Int64 {
        items(in: category).reduce(0) { $0 + $1.size }
    }

    var selectedSize: Int64 {
        results.values.joined().filter { selected.contains($0.url) }.reduce(0) { $0 + $1.size }
    }

    var largeSelectedSize: Int64 {
        largeFiles.filter { largeSelected.contains($0.url) }.reduce(0) { $0 + $1.size }
    }

    var duplicateSelectedSize: Int64 {
        duplicateGroups.joined().filter { duplicateSelected.contains($0.url) }.reduce(0) { $0 + $1.size }
    }

    var duplicateWaste: Int64 {
        duplicateGroups.reduce(0) { $0 + DiskScanner.wasted(by: $1) }
    }

    /// Groups where every copy is selected, so removing them would leave no copy at all.
    var fullySelectedDuplicateGroups: Int {
        duplicateGroups.filter { $0.allSatisfy { duplicateSelected.contains($0.url) } }.count
    }

    func scan() async {
        guard busy == nil else { return }
        results = [:]
        selected = []
        for category in CleanupCategory.all {
            busy = "Scanning \(category.name)…"
            let items = await Task.detached(priority: .userInitiated) {
                DiskScanner.items(for: category)
            }.value
            results[category.id] = items
            if category.risk == .safe { selected.formUnion(items.map(\.url)) }
        }
        busy = nil
        refreshDiskSpace()
    }

    func scanLargeFiles() async {
        guard busy == nil else { return }
        busy = "Searching your home folder for large files…"
        let minSize = Int64(largeThresholdMB) * 1_000_000
        largeFiles = await Task.detached(priority: .userInitiated) {
            DiskScanner.largeFiles(minSize: minSize)
        }.value
        largeSelected = []
        hasSearchedLargeFiles = true
        busy = nil
    }

    func scanDuplicates() async {
        guard busy == nil else { return }
        busy = "Comparing files in your home folder… this can take a few minutes."
        let minSize = Int64(duplicateMinMB) * 1_000_000
        duplicateGroups = await Task.detached(priority: .userInitiated) {
            DiskScanner.duplicateGroups(minSize: minSize)
        }.value
        duplicateSelected = []
        hasSearchedDuplicates = true
        busy = nil
    }

    /// Selects every copy except the oldest in each group.
    func selectDuplicateExtras() {
        duplicateSelected = Set(duplicateGroups.flatMap { $0.dropFirst().map(\.url) })
    }

    func removeSelectedDuplicates() async {
        let removed = await remove(duplicateGroups.joined().filter { duplicateSelected.contains($0.url) })
        duplicateGroups = duplicateGroups
            .map { $0.filter { !removed.contains($0.url) } }
            .filter { $0.count > 1 }
        duplicateSelected.subtract(removed)
    }

    func cleanSelected() async {
        let items = results.values.joined().filter { selected.contains($0.url) }
        _ = await remove(Array(items))
        await scan()
    }

    func removeSelectedLargeFiles() async {
        let removed = await remove(largeFiles.filter { largeSelected.contains($0.url) })
        largeFiles.removeAll { removed.contains($0.url) }
        largeSelected.subtract(removed)
    }

    private func remove(_ items: [CleanupItem]) async -> Set<URL> {
        guard busy == nil, !items.isEmpty else { return [] }
        busy = "Cleaning \(items.count) items…"
        let permanently = deletePermanently
        let outcome = await Task.detached(priority: .userInitiated) {
            DiskScanner.remove(items, permanently: permanently)
        }.value
        busy = nil
        message = summary(of: outcome)
        refreshDiskSpace()
        return outcome.removed
    }

    private func summary(of outcome: RemovalOutcome) -> String {
        var parts: [String] = []
        if outcome.freed > 0 { parts.append("Freed \(formatBytes(outcome.freed)).") }
        if outcome.trashed > 0 {
            parts.append("Moved \(formatBytes(outcome.trashed)) to the Trash. Empty the Trash to get that space back.")
        }
        if !outcome.failures.isEmpty {
            parts.append("\(outcome.failures.count) item(s) couldn't be removed (in use or protected): "
                         + outcome.failures.prefix(3).joined(separator: "; "))
        }
        return parts.isEmpty ? "Nothing was removed." : parts.joined(separator: " ")
    }

    func refreshDiskSpace() {
        let space = DiskScanner.diskSpace()
        freeSpace = space.free
        totalSpace = space.total
    }
}
