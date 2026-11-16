// Home-screen and lock-screen widget: how many agents need you, and which.
// Refreshes every 15 minutes on its own, and right away when a push arrives or the app is open.
import WidgetKit
import ActivityKit
import SwiftUI

struct Entry: TimelineEntry {
    let date: Date
    let sessions: [Session]
    let note: String?
    var waiting: [Session] { sessions.filter(\.waiting) }

    static let sample = Entry(date: .now, sessions: [
        Session(sid: "1", project: "pilothouse", projectId: "", agent: "Claude Code", status: "waiting", tail: "", choices: [], risk: "normal", sig: "", summary: "Bash(npm test)", preview: ""),
        Session(sid: "2", project: "api-server", projectId: "", agent: "Codex", status: "running", tail: "", choices: [], risk: "normal", sig: "", summary: "", preview: ""),
        Session(sid: "3", project: "landing", projectId: "", agent: "Gemini CLI", status: "idle", tail: "", choices: [], risk: "normal", sig: "", summary: "", preview: "")
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
        guard Client.anyPaired else { return Entry(date: .now, sessions: [], note: "Open the app to pair") }
        // Every paired computer; the widget shows whichever answer.
        var all: [Session] = []
        var failed = 0
        for c in Client.all { if let list = try? await c.sessions() { all += list } else { failed += 1 } }
        if failed == Client.all.count { return Entry(date: .now, sessions: [], note: "Computer offline") }
        return Entry(date: .now, sessions: all.sorted { ($0.waiting ? 0 : 1) < ($1.waiting ? 0 : 1) }, note: nil)
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

// Lock screen and Dynamic Island: counts only (see Shared/AgentsActivity.swift).
struct AgentsLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AgentsActivityAttributes.self) { ctx in
            HStack(spacing: 14) {
                Image(systemName: "location.north.circle.fill").font(.title2).foregroundStyle(Color.lime)
                VStack(alignment: .leading, spacing: 2) {
                    Text(ctx.state.needsYou > 0 ? "\(ctx.state.needsYou) need\(ctx.state.needsYou == 1 ? "s" : "") you" : "All agents on it")
                        .font(.headline).foregroundStyle(ctx.state.needsYou > 0 ? Color.amber : .white)
                    Text("\(ctx.state.working) working").font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding()
            .activityBackgroundTint(Color.ink)
            .activitySystemActionForegroundColor(Color.lime)
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("\(ctx.state.needsYou)", systemImage: "hand.raised.fill").foregroundStyle(Color.amber)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Label("\(ctx.state.working)", systemImage: "bolt.fill").foregroundStyle(Color.lime)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(ctx.state.needsYou > 0 ? "Open Pilothouse to answer" : "Your agents are working").font(.caption).foregroundStyle(.secondary)
                }
            } compactLeading: {
                Text("\(ctx.state.needsYou)").foregroundStyle(ctx.state.needsYou > 0 ? Color.amber : .secondary)
            } compactTrailing: {
                Text("\(ctx.state.working)").foregroundStyle(Color.lime)
            } minimal: {
                Text("\(ctx.state.needsYou + ctx.state.working)").foregroundStyle(ctx.state.needsYou > 0 ? Color.amber : Color.lime)
            }
            .widgetURL(URL(string: "pilothouse://home"))
        }
    }
}

@main
struct PilothouseWidgetBundle: WidgetBundle {
    var body: some Widget {
        PilothouseWidget()
        AgentsLiveActivity()
    }
}
