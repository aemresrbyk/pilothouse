// Home-screen and lock-screen widget: how many agents need you, and which.
// Refreshes every 15 minutes on its own, and right away when a push arrives or the app is open.
import WidgetKit
import SwiftUI

struct Entry: TimelineEntry {
    let date: Date
    let sessions: [Session]
    let note: String?
    var waiting: [Session] { sessions.filter(\.waiting) }

    static let sample = Entry(date: .now, sessions: [
        Session(id: "1", project: "pilothouse", projectId: "", agent: "Claude Code", status: "waiting", tail: "", choices: [], risk: "normal", sig: "", summary: "Bash(npm test)", preview: ""),
        Session(id: "2", project: "api-server", projectId: "", agent: "Codex", status: "running", tail: "", choices: [], risk: "normal", sig: "", summary: "", preview: ""),
        Session(id: "3", project: "landing", projectId: "", agent: "Gemini CLI", status: "idle", tail: "", choices: [], risk: "normal", sig: "", summary: "", preview: "")
    ], note: nil)
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { .sample }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        if context.isPreview { completion(.sample); return }
        Task { completion(await load()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        Task {
            let entry = await load()
            completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(15 * 60))))
        }
    }

    private func load() async -> Entry {
        guard Client.shared.paired else { return Entry(date: .now, sessions: [], note: "Open the app to pair") }
        do { return Entry(date: .now, sessions: try await Client.shared.sessions(), note: nil) }
        catch { return Entry(date: .now, sessions: [], note: "Computer offline") }
    }
}

struct WidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Text("\(entry.waiting.count)").font(.title2.bold())
                    Image(systemName: "location.north.fill").font(.caption2)
                }
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.waiting.isEmpty ? "Pilothouse" : "\(entry.waiting.count) need you").font(.headline)
                Text(entry.note ?? entry.waiting.first.map { "\($0.project): \($0.summary)" } ?? "\(entry.sessions.count) agents, all fine")
                    .font(.caption).lineLimit(2)
            }
        case .accessoryInline:
            Text(entry.waiting.isEmpty ? "Agents: all fine" : "\(entry.waiting.count) agents need you")
        case .systemSmall:
            small
        default:
            medium
        }
    }

    private var header: some View {
        HStack(spacing: 5) {
            Image(systemName: "location.north.fill").foregroundStyle(Color.lime).font(.caption)
            Text("Pilothouse").font(.caption.bold()).foregroundStyle(.white)
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 2) {
            header
            Spacer()
            Text("\(entry.waiting.count)")
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .foregroundStyle(entry.waiting.isEmpty ? Color.white : Color.amber)
            Text(entry.waiting.isEmpty ? "all clear" : "need you").font(.caption).foregroundStyle(.secondary)
            Text(entry.note ?? entry.waiting.first?.project ?? "\(entry.sessions.count) agents")
                .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(entry.waiting.first.flatMap { URL(string: "pilothouse://session/\($0.id)") })
    }

    private var medium: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                header
                Spacer()
                if !entry.waiting.isEmpty {
                    Text("\(entry.waiting.count) need you").font(.caption.bold()).foregroundStyle(Color.amber)
                }
            }
            if let note = entry.note {
                Spacer()
                Text(note).font(.callout).foregroundStyle(.secondary)
                Spacer()
            } else if entry.sessions.isEmpty {
                Spacer()
                Text("No agent tabs open").font(.callout).foregroundStyle(.secondary)
                Spacer()
            } else {
                ForEach(entry.sessions.prefix(4)) { s in
                    Link(destination: URL(string: "pilothouse://session/\(s.id)")!) {
                        HStack(spacing: 8) {
                            Circle().fill(Color.status(s.status)).frame(width: 7, height: 7)
                            Text(s.project).font(.caption.bold()).foregroundStyle(.white).lineLimit(1)
                            Text(s.agent).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                            Spacer()
                            Text(statusLabel(s.status)).font(.caption2).foregroundStyle(Color.status(s.status))
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

struct PilothouseWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PilothouseAgents", provider: Provider()) { entry in
            WidgetView(entry: entry).containerBackground(Color.ink, for: .widget)
        }
        .configurationDisplayName("Agents")
        .description("Which of your agents need you.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct PilothouseWidgetBundle: WidgetBundle {
    var body: some Widget { PilothouseWidget() }
}
