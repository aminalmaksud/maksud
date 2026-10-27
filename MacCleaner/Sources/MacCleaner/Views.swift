import AppKit
import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 12) {
            DiskSpaceHeader()
            TabView {
                CleanupView().tabItem { Label("Cleanup", systemImage: "sparkles") }
                LargeFilesView().tabItem { Label("Large Files", systemImage: "doc.badge.ellipsis") }
            }
        }
        .padding()
    }
}

// MARK: - Header

struct DiskSpaceHeader: View {
    @EnvironmentObject private var model: CleanerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Label("Startup Disk", systemImage: "internaldrive").font(.headline)
                Spacer()
                Text("\(formatBytes(model.freeSpace)) free of \(formatBytes(model.totalSpace))")
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                Button("Full Disk Access…") {
                    let url = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
                    NSWorkspace.shared.open(URL(string: url)!)
                }
                .help("Some folders (Trash, Mail, device backups) can only be scanned after you grant Full Disk Access.")
            }
            ProgressView(value: Double(max(model.totalSpace - model.freeSpace, 0)),
                         total: Double(max(model.totalSpace, 1)))
        }
    }
}

// MARK: - Cleanup tab

struct CleanupView: View {
    @EnvironmentObject private var model: CleanerModel
    @State private var confirming = false

    var body: some View {
        VStack(spacing: 10) {
            List {
                ForEach(CleanupCategory.all) { CategoryRow(category: $0) }
            }
            HStack {
                StatusText()
                Spacer()
                Toggle("Delete permanently", isOn: $model.deletePermanently)
                    .help("Off: items go to the Trash so you can restore them. On: deleted right away.")
                Button("Rescan") { Task { await model.scan() } }
                    .disabled(model.busy != nil)
                Button("Clean \(formatBytes(model.selectedSize))") { confirming = true }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.busy != nil || model.selected.isEmpty)
            }
        }
        .padding(8)
        .task { if model.results.isEmpty { await model.scan() } }
        .confirmationDialog(
            "Clean \(model.selected.count) items (\(formatBytes(model.selectedSize)))?",
            isPresented: $confirming
        ) {
            Button(model.deletePermanently ? "Delete Permanently" : "Move to Trash", role: .destructive) {
                Task { await model.cleanSelected() }
            }
        } message: {
            Text(model.deletePermanently
                 ? "This can't be undone."
                 : "Items go to the Trash so you can restore them. Anything already in the Trash is deleted permanently.")
        }
    }
}

struct CategoryRow: View {
    let category: CleanupCategory
    @EnvironmentObject private var model: CleanerModel
    @State private var expanded = false

    private var items: [CleanupItem] { model.items(in: category) }

    private var allSelected: Binding<Bool> {
        Binding(
            get: { !items.isEmpty && items.allSatisfy { model.selected.contains($0.url) } },
            set: { on in
                let urls = items.map(\.url)
                if on { model.selected.formUnion(urls) } else { model.selected.subtract(urls) }
            }
        )
    }

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            if items.isEmpty {
                Text("Nothing found.").foregroundStyle(.secondary)
            }
            ForEach(items) { ItemRow(item: $0, selection: $model.selected) }
        } label: {
            HStack(spacing: 10) {
                Toggle("", isOn: allSelected).labelsHidden().disabled(items.isEmpty)
                Image(systemName: category.symbol)
                    .frame(width: 22)
                    .foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(category.name).font(.headline)
                        RiskBadge(risk: category.risk)
                    }
                    Text(category.detail).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(model.results[category.id] == nil ? "—" : formatBytes(model.size(of: category)))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }
}

struct RiskBadge: View {
    let risk: Risk

    var body: some View {
        Text(risk.rawValue)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(Capsule().fill(risk == .safe ? Color.green.opacity(0.2) : Color.orange.opacity(0.25)))
            .foregroundStyle(risk == .safe ? Color.green : Color.orange)
    }
}

// MARK: - Large files tab

struct LargeFilesView: View {
    @EnvironmentObject private var model: CleanerModel
    @State private var confirming = false

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Picker("Show files larger than", selection: $model.largeThresholdMB) {
                    Text("100 MB").tag(100)
                    Text("500 MB").tag(500)
                    Text("1 GB").tag(1_000)
                    Text("5 GB").tag(5_000)
                }
                .fixedSize()
                Button("Search") { Task { await model.scanLargeFiles() } }
                    .disabled(model.busy != nil)
                Spacer()
                Text("Searches your home folder (not ~/Library). Review each file before removing it.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            List {
                if model.hasSearchedLargeFiles && model.largeFiles.isEmpty {
                    Text("No files that large.").foregroundStyle(.secondary)
                }
                ForEach(model.largeFiles) { ItemRow(item: $0, selection: $model.largeSelected) }
            }
            HStack {
                StatusText()
                Spacer()
                Toggle("Delete permanently", isOn: $model.deletePermanently)
                Button("Remove \(formatBytes(model.largeSelectedSize))") { confirming = true }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.busy != nil || model.largeSelected.isEmpty)
            }
        }
        .padding(8)
        .confirmationDialog("Remove \(model.largeSelected.count) files?", isPresented: $confirming) {
            Button(model.deletePermanently ? "Delete Permanently" : "Move to Trash", role: .destructive) {
                Task { await model.removeSelectedLargeFiles() }
            }
        } message: {
            Text(model.deletePermanently ? "This can't be undone." : "You can restore them from the Trash.")
        }
    }
}

// MARK: - Shared rows

struct ItemRow: View {
    let item: CleanupItem
    @Binding var selection: Set<URL>

    var body: some View {
        HStack(spacing: 8) {
            Toggle("", isOn: Binding(
                get: { selection.contains(item.url) },
                set: { on in
                    if on { selection.insert(item.url) } else { selection.remove(item.url) }
                }
            ))
            .labelsHidden()
            Image(nsImage: NSWorkspace.shared.icon(forFile: item.url.path))
                .resizable()
                .frame(width: 18, height: 18)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.name).lineLimit(1)
                Text(item.displayPath)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer()
            Text(formatBytes(item.size)).monospacedDigit().foregroundStyle(.secondary)
            Button {
                NSWorkspace.shared.activateFileViewerSelecting([item.url])
            } label: {
                Image(systemName: "magnifyingglass")
            }
            .buttonStyle(.borderless)
            .help("Show in Finder")
        }
    }
}

struct StatusText: View {
    @EnvironmentObject private var model: CleanerModel

    var body: some View {
        if let busy = model.busy {
            HStack(spacing: 6) {
                ProgressView().controlSize(.small)
                Text(busy).foregroundStyle(.secondary)
            }
        } else if let message = model.message {
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineLimit(3)
                .textSelection(.enabled)
        }
    }
}
