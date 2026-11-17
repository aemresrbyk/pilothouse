import SwiftUI
import VisionKit

struct RootView: View {
    @EnvironmentObject var model: Model
    var body: some View {
        if model.paired { HomeView() } else { PairView() }
    }
}

// MARK: - Pairing

struct PairView: View {
    // adding: pushed from Settings to pair one more computer (otherwise it is the first-run screen).
    var adding = false
    @EnvironmentObject var model: Model
    @Environment(\.dismiss) private var dismiss
    @State private var scanning = false
    @State private var link = ""
    @State private var error: String?
    @State private var busy = false
    @State private var securityCode: String?

    @State private var showPaste = false

    var body: some View {
        // Scanning the QR is the only way in, so it fills the screen; pasting a link and the demo stay small.
        VStack(spacing: 20) {
            HStack(spacing: 8) {
                Image(systemName: "location.north.circle.fill").foregroundStyle(Color.lime)
                Text("Pilothouse").font(.headline)
                Spacer()
            }
            Spacer(minLength: 0)
            if let securityCode {
                VStack(spacing: 10) {
                    Text("Security code").font(.headline).foregroundStyle(.secondary)
                    Text("\(securityCode.prefix(3)) \(securityCode.suffix(3))")
                        .font(.system(size: 52, weight: .semibold, design: .monospaced)).foregroundStyle(Color.lime)
                    Text("Your computer shows a code too. Click Allow there if they match.")
                        .foregroundStyle(.secondary).multilineTextAlignment(.center)
                    ProgressView().padding(.top, 4)
                }
                .frame(maxWidth: .infinity)
                .padding(28)
                .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 24))
                .accessibilityElement(children: .combine)
            } else {
                Button { scanning = true } label: {
                    VStack(spacing: 16) {
                        Image(systemName: "qrcode.viewfinder").font(.system(size: 96, weight: .light))
                        Text("Scan QR code").font(.title.bold())
                    }
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 44)
                    .background(Color.lime, in: RoundedRectangle(cornerRadius: 28))
                }
                .buttonStyle(.plain)
                .disabled(busy || !DataScannerViewController.isSupported)
                .accessibilityHint("Opens the camera to scan the QR code shown in Pilothouse on your computer")
                VStack(alignment: .leading, spacing: 8) {
                    step(1, "Open Pilothouse on your computer")
                    step(2, "Settings → Remote control")
                    step(3, "Scan it, then click Allow there")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if !DataScannerViewController.isSupported {
                    Text("This iPhone can't scan codes here. Paste the link instead.").font(.callout).foregroundStyle(.orange)
                }
            }
            if busy && securityCode == nil { ProgressView() }
            if let error { Text(error).foregroundStyle(.orange).font(.callout).multilineTextAlignment(.center) }
            Spacer(minLength: 0)
            VStack(spacing: 12) {
                if showPaste || !DataScannerViewController.isSupported {
                    HStack {
                        TextField("Paste the link", text: $link).textFieldStyle(.roundedBorder).autocorrectionDisabled().textInputAutocapitalization(.never)
                        Button("Pair") { pair(link) }.disabled(link.isEmpty || busy)
                    }
                } else {
                    Button("Paste a link instead") { showPaste = true }.font(.callout).foregroundStyle(.secondary)
                }
                if !adding {
                    Button("No computer at hand? Try a demo") {
                        Client.startDemo()
                        model.paired = true
                        Task { await model.refresh() }
                    }
                    .font(.callout)
                }
            }
        }
        .padding(24)
        .sheet(isPresented: $scanning) {
            QRScanner { code in scanning = false; pair(code) }.ignoresSafeArea()
        }
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(spacing: 10) {
            Text("\(n)").font(.callout.bold()).foregroundStyle(.black).frame(width: 24, height: 24).background(Color.lime, in: Circle())
            Text(text).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func pair(_ code: String) {
        busy = true
        error = nil
        let shown = Client.newSecurityCode()
        securityCode = shown
        Task {
            defer { busy = false; securityCode = nil }
            do {
                try await Client.pair(link: code, name: UIDevice.current.name, securityCode: shown)
                Push.enable() // registers the push token with the new computer too
                model.paired = true
                await model.refresh()
                if adding { dismiss() }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

struct QRScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {
        if !vc.isScanning { try? vc.startScanning() }
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var done = false
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ scanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems {
                if case .barcode(let code) = item, let value = code.payloadStringValue, !done {
                    done = true
                    scanner.stopScanning()
                    onCode(value)
                }
            }
        }
    }
}

// MARK: - Home

struct HomeView: View {
    @EnvironmentObject var model: Model
    @Environment(\.scenePhase) private var phase
    @State private var path: [String] = []
    @State private var opening: String?

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if let e = model.error {
                    Section { Label(e, systemImage: "wifi.exclamationmark").foregroundStyle(.orange).font(.callout) }
                }
                let waiting = model.sessions.filter(\.waiting)
                if !waiting.isEmpty {
                    Section("Needs you") { ForEach(waiting) { s in NavigationLink(value: s.id) { SessionRow(s: s) } } }
                }
                let others = model.sessions.filter { !$0.waiting }
                if !others.isEmpty {
                    Section("Agents") { ForEach(others) { s in NavigationLink(value: s.id) { SessionRow(s: s) } } }
                }
                if model.sessions.isEmpty && model.error == nil {
                    Section { Text("No agent tabs open. Open one from Projects below.").foregroundStyle(.secondary) }
                }
                if !model.conversations.isEmpty {
                    Section {
                        ForEach(model.conversations.prefix(8)) { c in
                            NavigationLink { ConversationView(c: c) } label: { ConversationRow(c: c) }
                        }
                    } header: { Text("Conversations") } footer: { Text("Claude Code and Codex sessions from any terminal, including ones outside Pilothouse.") }
                }
                if !model.usage.isEmpty {
                    Section("Usage") { ForEach(model.usage) { u in UsageRow(u: u) } }
                }
                if !model.projects.isEmpty {
                    Section {
                        ForEach(model.projects) { p in
                            HStack {
                                NavigationLink { TodosView(projectId: p.id, name: p.name) } label: { Text(p.name) }
                                if opening == p.id { ProgressView() } else {
                                    Button("Open agent") { open(p) }.buttonStyle(.bordered).disabled(opening != nil)
                                }
                            }
                        }
                    } header: { Text("Projects") } footer: { Text("Tap a project for its to-dos.") }
                }
            }
            .navigationTitle("Pilothouse")
            .navigationDestination(for: String.self) { id in SessionView(id: id) }
            .toolbar {
                NavigationLink { PairView(adding: true) } label: { Image(systemName: "qrcode.viewfinder") }.accessibilityLabel("Add a computer")
                NavigationLink { SettingsView() } label: { Image(systemName: "gearshape") }
            }
            .refreshable { await model.refresh(); await model.refreshProjects() }
        }
        // On the stack, not the list: the list disappears when a session is pushed, and polling must go on.
        .task(id: phase) {
            guard phase == .active else { return }
            var tick = 0
            while !Task.isCancelled {
                if tick % 15 == 0 { await model.refreshProjects() } // projects and usage change slowly
                await model.refresh()
                tick += 1
                try? await Task.sleep(for: .seconds(2))
            }
        }
        .onChange(of: model.openSession) { _, id in
            if let id { path = [id]; model.openSession = nil }
        }
    }

    private func open(_ p: Project) {
        opening = p.id
        Task {
            try? await Client.of(p.computer).open(p.pid)
            try? await Task.sleep(for: .seconds(2))
            await model.refresh()
            await model.refreshProjects()
            opening = nil
        }
    }
}

struct SessionRow: View {
    let s: Session
    var body: some View {
        HStack(spacing: 10) {
            Circle().fill(Color.status(s.status)).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(s.project).font(.headline)
                    Text(statusLabel(s.status)).font(.caption).foregroundStyle(Color.status(s.status))
                }
                Text(Client.all.count > 1 ? "\(s.agent) · \(s.computerName)" : s.agent).font(.caption2.bold()).foregroundStyle(Color.lime.opacity(0.8))
                Text(s.waiting ? s.summary : s.preview).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer()
            if s.waiting && s.risky { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red) }
        }
    }
}

// MARK: - Session

struct SessionView: View {
    let id: String
    @EnvironmentObject var model: Model
    @StateObject private var speech = Speech()
    @State private var armed: String?
    @State private var text = ""
    @State private var error: String?
    @State private var busy = false
    @State private var chat: ChatLog?
    @State private var showTerminal = false
    @FocusState private var typing: Bool

    private var session: Session? { model.sessions.first { $0.id == id } }

    var body: some View {
        VStack(spacing: 0) {
            // Claude Code / Codex tabs read as a chat (from the agent's transcript); the terminal stays one tap away.
            if chat != nil {
                Picker("View", selection: $showTerminal) {
                    Text("Chat").tag(false)
                    Text("Terminal").tag(true)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }
            ScrollViewReader { proxy in
                ScrollView {
                    if let chat, !showTerminal {
                        LazyVStack(alignment: .leading, spacing: 10) {
                            ForEach(Array(chat.messages.enumerated()), id: \.offset) { _, m in Bubble(m: m) }
                            if session?.status == "running" {
                                HStack(spacing: 6) { ProgressView(); Text("Working…").font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                        .padding(12)
                    } else {
                        if session == nil {
                            Text("This tab was closed on the computer.").foregroundStyle(.secondary).padding(12)
                        } else {
                            TerminalScreen(id: id).padding(8)
                        }
                    }
                    Color.clear.frame(height: 1).id("end")
                }
                .scrollDismissesKeyboard(.interactively)
                .onTapGesture { typing = false }
                .onAppear { proxy.scrollTo("end", anchor: .bottom) }
                .onChange(of: session?.tail) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
                .onChange(of: chat?.messages.count) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
                .onChange(of: showTerminal) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
            }
        }
        .task {
            while !Task.isCancelled {
                chat = try? await route(id).client.tabChat(route(id).sid)
                try? await Task.sleep(for: .seconds(2))
            }
        }
        .safeAreaInset(edge: .bottom) { controls.padding(12).background(.bar) }
        .navigationTitle(session?.project ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if session?.status == "running" {
                    Button("Stop", role: .destructive) { Task { try? await route(id).client.stop(route(id).sid) } }
                }
                NavigationLink { DiffView(id: id) } label: { Text("Changes") }
                if let s = session, !s.projectId.isEmpty {
                    NavigationLink { TodosView(projectId: "\(s.computer)~\(s.projectId)", name: s.project) } label: { Image(systemName: "checklist") }
                        .accessibilityLabel("To-dos")
                }
            }
        }
        .onChange(of: speech.text) { _, t in if !t.isEmpty { text = t } }
        .onChange(of: session?.sig) { _, _ in armed = nil }
    }

    @ViewBuilder private var controls: some View {
        VStack(spacing: 8) {
            if let s = session, s.waiting, !s.choices.isEmpty {
                // What the agent asks, on its own: the chat above does not show approval prompts.
                Text(s.summary.isEmpty ? "The agent asks for approval." : s.summary)
                    .font(.system(size: 13, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(Color.amber.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                if s.risky {
                    Label("Risky command: deletes, force-pushes, deploys, sudo or secrets. Check it before approving.", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(Array(s.choices.enumerated()), id: \.element) { i, c in
                    let isArmed = armed == c.key
                    Button { choose(s, c) } label: {
                        Text(isArmed ? "Tap again to approve: \(c.label)" : "\(c.key.trimmingCharacters(in: .whitespacesAndNewlines)). \(c.label)")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(isArmed ? .red : (i == 0 ? .lime : Color(white: 0.22)))
                    .foregroundStyle(i == 0 && !isArmed ? Color.black : Color.white)
                    .disabled(busy)
                }
            }
            if let s = session, s.waiting, !s.choices.isEmpty { ChangesPeek(id: s.id) }
            if chat == nil || showTerminal { KeyBar(id: id) }
            if let e = error ?? speech.problem { Text(e).font(.caption).foregroundStyle(.orange) }
            HStack(alignment: .bottom) {
                TextField(speech.listening ? "Listening…" : "Message the agent", text: $text, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                    .focused($typing)
                Button { speech.toggle() } label: {
                    Image(systemName: speech.listening ? "stop.circle.fill" : "mic.circle").font(.title2)
                }
                .foregroundStyle(speech.listening ? .red : .lime)
                .accessibilityLabel(speech.listening ? "Stop listening" : "Speak a message")
                Button { send() } label: { Image(systemName: "arrow.up.circle.fill").font(.title2) }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
                    .accessibilityLabel("Send")
            }
        }
    }

    private func choose(_ s: Session, _ c: Choice) {
        let needsConfirm = s.risky && !c.label.lowercased().hasPrefix("no")
        if needsConfirm && armed != c.key { armed = c.key; return }
        armed = nil
        Task {
            if needsConfirm, !(await Biometrics.confirm("Approve a risky command in \(s.project)")) { return }
            busy = true
            defer { busy = false }
            do {
                try await route(s.id).client.choose(s.sid, key: c.key, sig: s.sig, confirm: needsConfirm)
                error = nil
                await model.refresh()
            } catch { self.error = error.localizedDescription }
        }
    }

    private func send() {
        speech.stop()
        typing = false
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            busy = true
            defer { busy = false }
            do {
                try await route(id).client.message(route(id).sid, t)
                text = ""
                error = nil
                await model.refresh()
            } catch { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Diff

// The tab's screen exactly as the desktop shows it, refreshed while visible and scaled to fit the phone's width.
struct TerminalScreen: View {
    let id: String
    @State private var snap: ScreenSnapshot?
    @State private var width: CGFloat = 360

    var body: some View {
        let size = snap.map { max(5, min(12, (width - 4) / (CGFloat($0.cols) * 0.6))) } ?? 12
        VStack(alignment: .leading, spacing: 0) {
            if let snap {
                ForEach(Array(snap.lines.enumerated()), id: \.offset) { y, runs in
                    Text(line(runs, cursorAt: y == snap.cursor.y ? snap.cursor.x : nil))
                        .font(.system(size: size, design: .monospaced))
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(GeometryReader { g in Color.clear.onAppear { width = g.size.width }.onChange(of: g.size.width) { _, w in width = w } })
        .textSelection(.enabled)
        .accessibilityLabel("Terminal screen")
        .task {
            while !Task.isCancelled {
                if let s = try? await route(id).client.screen(route(id).sid), s != snap { snap = s }
                try? await Task.sleep(for: .milliseconds(700))
            }
        }
    }

    private func line(_ runs: [ScreenRun], cursorAt cx: Int?) -> AttributedString {
        var out = AttributedString()
        var col = 0
        for r in runs {
            var piece = AttributedString(r.text)
            piece.foregroundColor = r.color.isEmpty ? Color(white: 0.82) : Color(hex: r.color)
            if r.bold { piece.inlinePresentationIntent = .stronglyEmphasized }
            if let cx, cx >= col, cx < col + r.text.count {
                let start = piece.index(piece.startIndex, offsetByCharacters: cx - col)
                let end = piece.index(start, offsetByCharacters: 1)
                piece[start..<end].backgroundColor = .lime
                piece[start..<end].foregroundColor = .ink
            }
            col += r.text.count
            out += piece
        }
        if let cx, cx >= col {
            out += AttributedString(String(repeating: " ", count: cx - col))
            var cur = AttributedString(" ")
            cur.backgroundColor = .lime
            out += cur
        }
        return out.characters.isEmpty ? AttributedString(" ") : out
    }
}

// Keys a terminal UI needs that the phone keyboard lacks.
struct KeyBar: View {
    let id: String
    private let keys: [(String, String)] = [("Esc", "\u{1b}"), ("Tab", "\t"), ("↑", "\u{1b}[A"), ("↓", "\u{1b}[B"), ("←", "\u{1b}[D"), ("→", "\u{1b}[C"), ("Enter", "\r"), ("Ctrl+C", "\u{03}"), ("1", "1"), ("2", "2"), ("3", "3"), ("y", "y"), ("n", "n")]
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(keys, id: \.0) { k in
                    Button(k.0) { Task { try? await route(id).client.keys(route(id).sid, k.1) } }
                        .font(.system(size: 13, design: .monospaced))
                        .buttonStyle(.bordered)
                        .accessibilityLabel(k.0 == "↑" ? "Up arrow" : k.0 == "↓" ? "Down arrow" : k.0 == "←" ? "Left arrow" : k.0 == "→" ? "Right arrow" : k.0)
                }
            }
        }
    }
}

// Under an approval prompt: what the agent changed so far, so you can judge before saying yes.
struct ChangesPeek: View {
    let id: String
    @State private var result: DiffResult?
    @State private var open = false
    var body: some View {
        Group {
            if let r = result, !(r.stat.isEmpty && r.untracked.isEmpty) {
                DisclosureGroup(isExpanded: $open) {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(r.diff.split(separator: "\n", omittingEmptySubsequences: false).prefix(400).enumerated()), id: \.offset) { _, line in
                                DiffLine(line: String(line))
                            }
                        }
                    }
                    .frame(maxHeight: 260)
                } label: {
                    Text(summary(r)).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .task { result = try? await route(id).client.diff(route(id).sid) }
    }
    private func summary(_ r: DiffResult) -> String {
        let last = r.stat.split(separator: "\n").last.map(String.init)?.trimmingCharacters(in: .whitespaces) ?? ""
        let added = r.untracked.isEmpty ? "" : " · \(r.untracked.count) new"
        return "What changed: " + (last.isEmpty ? "new files" : last) + added
    }
}

struct DiffView: View {
    let id: String
    @State private var result: DiffResult?
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if let r = result {
                    Text(r.stat.isEmpty ? "No uncommitted changes." : r.stat)
                        .font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary).padding(.bottom, 8)
                    if !r.untracked.isEmpty {
                        Text("New files: " + r.untracked.joined(separator: ", ")).font(.caption).foregroundStyle(Color.lime).padding(.bottom, 8)
                    }
                    ForEach(Array(r.diff.split(separator: "\n", omittingEmptySubsequences: false).enumerated()), id: \.offset) { _, line in
                        DiffLine(line: String(line))
                    }
                } else if let error {
                    Text(error).foregroundStyle(.orange)
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
            .padding(10)
        }
        .background(Color.black)
        .navigationTitle(result.map { "Changes · \($0.project)" } ?? "Changes")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do { result = try await route(id).client.diff(route(id).sid) } catch { self.error = error.localizedDescription }
        }
    }
}

struct DiffLine: View {
    let line: String
    var body: some View {
        let added = line.hasPrefix("+") && !line.hasPrefix("+++")
        let removed = line.hasPrefix("-") && !line.hasPrefix("---")
        let hunk = line.hasPrefix("@@")
        Text(line.isEmpty ? " " : line)
            .font(.system(size: 11, design: .monospaced))
            .foregroundStyle(added ? Color.green : removed ? Color.red : hunk ? Color.cyan : Color(white: 0.75))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(added ? Color.green.opacity(0.12) : removed ? Color.red.opacity(0.12) : Color.clear)
    }
}

// MARK: - Conversations

struct ConversationRow: View {
    let c: Conversation
    var body: some View {
        HStack(spacing: 10) {
            Circle().fill(c.live ? Color.lime : Color.gray.opacity(0.4)).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(c.project).font(.headline)
                    Text(c.agent).font(.caption2.bold()).foregroundStyle(Color.lime.opacity(0.8))
                }
                Text(c.title.isEmpty ? "Conversation" : c.title).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer()
            Text(Date(timeIntervalSince1970: c.updatedAt / 1000), style: .relative).font(.caption2).foregroundStyle(.secondary)
        }
    }
}

struct ConversationView: View {
    let c: Conversation
    @State private var log: ChatLog?
    @State private var error: String?
    @State private var confirmResume = false
    @State private var resumed = false

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    if let log {
                        ForEach(Array(log.messages.enumerated()), id: \.offset) { _, m in Bubble(m: m) }
                    } else if let error {
                        Text(error).foregroundStyle(.orange)
                    } else {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                    Color.clear.frame(height: 1).id("end")
                }
                .padding(12)
            }
            .onChange(of: log?.messages.count) { _, _ in withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
        }
        .navigationTitle(c.project)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(resumed ? "Opened" : "Continue here") { confirmResume = true }.disabled(resumed || c.projectId.isEmpty)
            }
        }
        .confirmationDialog("Continue this conversation in a Pilothouse tab?", isPresented: $confirmResume, titleVisibility: .visible) {
            Button("Open in Pilothouse") {
                Task {
                    do { try await route(c.id).client.resume(c.key); resumed = true } catch { self.error = error.localizedDescription }
                }
            }
        } message: {
            Text("If it is still running in another terminal, close it there first, or both will write to the same conversation.")
        }
        // Follows a live session: polls while this screen is open.
        .task {
            while !Task.isCancelled {
                do { log = try await route(c.id).client.conversation(c.key); error = nil } catch { if log == nil { self.error = error.localizedDescription } }
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }
}

struct Bubble: View {
    let m: ChatMessage
    var body: some View {
        let mine = m.role == "user"
        HStack {
            if mine { Spacer(minLength: 40) }
            Text(LocalizedStringKey(m.text))
                .font(.callout)
                .textSelection(.enabled)
                .padding(10)
                .background(mine ? Color.lime.opacity(0.18) : Color(white: 0.13))
                .clipShape(RoundedRectangle(cornerRadius: 14))
            if !mine { Spacer(minLength: 24) }
        }
    }
}

// MARK: - Usage

struct UsageRow: View {
    let u: AgentUsage
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(u.agent).font(.headline)
                if let plan = u.plan { Text(plan).font(.caption).foregroundStyle(.secondary) }
                Spacer()
                if let t = u.updatedAt {
                    Text(Date(timeIntervalSince1970: t / 1000), style: .relative).font(.caption2).foregroundStyle(.secondary)
                }
            }
            ForEach(u.windows, id: \.self) { w in
                let used = min(100, max(0, w.usedPercent))
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text("\(Int(used))% used · \(w.label)").font(.caption)
                        Spacer()
                        if let r = w.resetsAt, r > Date().timeIntervalSince1970 * 1000 {
                            Text("resets ") .font(.caption2).foregroundStyle(.secondary)
                            + Text(Date(timeIntervalSince1970: r / 1000), style: .relative).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    // Fills from empty to full as the limit is used up.
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Color.black)
                            Capsule().fill(Color.lime).frame(width: g.size.width * used / 100)
                        }
                    }
                    .frame(height: 6)
                    .accessibilityLabel("\(Int(used)) percent of the \(w.label) limit used")
                }
            }
            if let note = u.note { Text(note).font(.caption).foregroundStyle(.secondary) }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - To-dos

struct TodosView: View {
    let projectId: String
    let name: String
    @State private var list: TodoList?
    @State private var error: String?

    var body: some View {
        List {
            if let list {
                if list.items.isEmpty {
                    Text("No TODO, FIXME or open checkboxes in this project.").foregroundStyle(.secondary)
                }
                let tasks = list.items.filter { $0.kind == "task" }
                let todos = list.items.filter { $0.kind == "todo" }
                if !tasks.isEmpty {
                    Section("Open tasks (Markdown)") { ForEach(tasks, id: \.self) { TodoRow(item: $0) } }
                }
                if !todos.isEmpty {
                    Section("In the code") { ForEach(todos, id: \.self) { TodoRow(item: $0) } }
                }
            } else if let error {
                Text(error).foregroundStyle(.orange)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("To-dos · \(name)")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do { list = try await route(projectId).client.todos(route(projectId).sid) } catch { self.error = error.localizedDescription }
        }
    }
}

struct TodoRow: View {
    let item: TodoItem
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(item.text.replacingOccurrences(of: "- [ ] ", with: "")).font(.callout)
            Text("\(item.file):\(item.line)").font(.caption2.monospaced()).foregroundStyle(.secondary)
        }
    }
}

// MARK: - Settings

struct SettingsView: View {
    @EnvironmentObject var model: Model
    @State private var language = Speech.language
    @State private var computers = Client.all

    var body: some View {
        List {
            Section {
                ForEach(computers, id: \.id) { c in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.name).font(.headline)
                        Text(c.connection).font(.caption).foregroundStyle(.secondary)
                    }
                    .swipeActions {
                        Button("Unpair", role: .destructive) {
                            Task { await c.unpair(); computers = Client.all; model.paired = Client.anyPaired; await model.refresh() }
                        }
                    }
                }
                NavigationLink("Add a computer") { PairView(adding: true) }
            } header: { Text("Computers") } footer: { Text("Swipe left to unpair one. All their agents show up in one list.") }
            Section("Voice") {
                Picker("Language", selection: $language) {
                    Text("Türkçe").tag("tr-TR")
                    Text("English").tag("en-US")
                }
                .onChange(of: language) { _, v in Speech.language = v }
            }
            Section("Safety") {
                Text("Risky commands (rm -rf, force-push, deploy, sudo, secrets) need two taps and Face ID. A tap on a prompt that changed meanwhile is refused. Every action is logged on your computer.")
                    .font(.callout).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
        .onAppear { computers = Client.all }
    }
}
