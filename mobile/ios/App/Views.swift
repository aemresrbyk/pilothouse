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
    @EnvironmentObject var model: Model
    @State private var scanning = false
    @State private var link = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer()
            Image(systemName: "location.north.circle").font(.system(size: 56)).foregroundStyle(Color.lime)
            Text("Pilothouse").font(.largeTitle.bold())
            Text("On your computer: Pilothouse → Settings → Phone remote. Make sure Tailscale is on here and there, then scan the QR code.")
                .foregroundStyle(.secondary)
            Button { scanning = true } label: {
                Label("Scan QR code", systemImage: "qrcode.viewfinder").frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
            .disabled(busy || !DataScannerViewController.isSupported)
            HStack {
                TextField("…or paste the link", text: $link).textFieldStyle(.roundedBorder).autocorrectionDisabled().textInputAutocapitalization(.never)
                Button("Pair") { pair(link) }.disabled(link.isEmpty || busy)
            }
            if busy { ProgressView() }
            if let error { Text(error).foregroundStyle(.orange).font(.callout) }
            Spacer()
        }
        .padding(24)
        .sheet(isPresented: $scanning) {
            QRScanner { code in scanning = false; pair(code) }.ignoresSafeArea()
        }
    }

    private func pair(_ code: String) {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await Client.shared.pair(link: code, name: UIDevice.current.name)
                Push.enable()
                model.paired = true
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
                if !model.projects.isEmpty {
                    Section("Projects") {
                        ForEach(model.projects) { p in
                            HStack {
                                Text(p.name)
                                Spacer()
                                if opening == p.id { ProgressView() } else {
                                    Button("Open agent") { open(p) }.buttonStyle(.bordered).disabled(opening != nil)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Pilothouse")
            .navigationDestination(for: String.self) { id in SessionView(id: id) }
            .toolbar { NavigationLink { SettingsView() } label: { Image(systemName: "gearshape") } }
            .refreshable { await model.refresh(); await model.refreshProjects() }
        }
        // On the stack, not the list: the list disappears when a session is pushed, and polling must go on.
        .task(id: phase) {
            guard phase == .active else { return }
            await model.refreshProjects()
            while !Task.isCancelled {
                await model.refresh()
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
            try? await Client.shared.open(p.id)
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
                Text(s.waiting ? s.summary : s.lastLine).font(.caption).foregroundStyle(.secondary).lineLimit(2)
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

    private var session: Session? { model.sessions.first { $0.id == id } }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                Text(session?.tail ?? "This tab was closed on the computer.")
                    .font(.system(size: 11, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                    .padding(10)
                Color.clear.frame(height: 1).id("end")
            }
            .background(Color.black)
            .onAppear { proxy.scrollTo("end", anchor: .bottom) }
            .onChange(of: session?.tail) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
        }
        .safeAreaInset(edge: .bottom) { controls.padding(12).background(.bar) }
        .navigationTitle(session?.project ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if session?.status == "running" {
                    Button("Stop", role: .destructive) { Task { try? await Client.shared.stop(id) } }
                }
                NavigationLink { DiffView(id: id) } label: { Text("Diff") }
            }
        }
        .onChange(of: speech.text) { _, t in if !t.isEmpty { text = t } }
        .onChange(of: session?.sig) { _, _ in armed = nil }
    }

    @ViewBuilder private var controls: some View {
        VStack(spacing: 8) {
            if let s = session, s.waiting, !s.choices.isEmpty {
                if s.risky {
                    Label("Risky command: deletes, force-pushes, deploys, sudo or secrets. Read it in full above.", systemImage: "exclamationmark.triangle.fill")
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
            if let e = error ?? speech.problem { Text(e).font(.caption).foregroundStyle(.orange) }
            HStack(alignment: .bottom) {
                TextField(speech.listening ? "Listening…" : "Message the agent", text: $text, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
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
                try await Client.shared.choose(s.id, key: c.key, sig: s.sig, confirm: needsConfirm)
                error = nil
                await model.refresh()
            } catch { self.error = error.localizedDescription }
        }
    }

    private func send() {
        speech.stop()
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            busy = true
            defer { busy = false }
            do {
                try await Client.shared.message(id, t)
                text = ""
                error = nil
                await model.refresh()
            } catch { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Diff

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
        .navigationTitle(result.map { "Diff · \($0.project)" } ?? "Diff")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do { result = try await Client.shared.diff(id) } catch { self.error = error.localizedDescription }
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

// MARK: - Settings

struct SettingsView: View {
    @EnvironmentObject var model: Model
    @State private var language = Speech.language

    var body: some View {
        List {
            Section("Computer") {
                Text(Client.shared.base?.host ?? "Not paired").font(.system(.body, design: .monospaced))
                Button("Unpair this iPhone", role: .destructive) {
                    Task { await Client.shared.unpair(); model.paired = false }
                }
            }
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
    }
}
