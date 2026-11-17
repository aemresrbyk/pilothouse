// Speak a message to the agent. Recognised on the iPhone itself when the language supports it.
import Foundation
import Speech
import AVFoundation

@MainActor
final class Speech: ObservableObject {
    @Published var listening = false
    @Published var text = ""
    @Published var problem: String?
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    // Every language this iPhone can recognise, each named in its own language (Türkçe, Deutsch, 日本語 …).
    static let languages: [(id: String, name: String)] = SFSpeechRecognizer.supportedLocales()
        .map { l in
            let id = l.identifier.replacingOccurrences(of: "_", with: "-")
            return (id, (l.localizedString(forIdentifier: l.identifier) ?? id).capitalized(with: l))
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

    // Saved choice, else the iPhone's own language when it can be recognised, else English.
    static var language: String {
        get {
            if let saved = UserDefaults.standard.string(forKey: "voiceLanguage") { return saved }
            let mine = Locale.current.identifier.replacingOccurrences(of: "_", with: "-")
            if languages.contains(where: { $0.id == mine }) { return mine }
            let lang = Locale.current.language.languageCode?.identifier ?? "en"
            return languages.first(where: { $0.id.hasPrefix(lang + "-") })?.id ?? "en-US"
        }
        set { UserDefaults.standard.set(newValue, forKey: "voiceLanguage") }
    }

    func toggle() { listening ? stop() : start() }

    func start() {
        problem = nil
        SFSpeechRecognizer.requestAuthorization { status in
            AVAudioApplication.requestRecordPermission { mic in
                Task { @MainActor in
                    if status == .authorized && mic { self.begin() } else { self.problem = "Allow microphone and speech recognition in Settings → Pilothouse." }
                }
            }
        }
    }

    private func begin() {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: Speech.language)), recognizer.isAvailable else {
            problem = "Speech recognition is not available for this language right now."
            return
        }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try? session.setActive(true, options: .notifyOthersOnDeactivation)
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
        request = req
        let input = engine.inputNode
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in req.append(buffer) }
        engine.prepare()
        do { try engine.start() } catch { problem = "The microphone is busy."; input.removeTap(onBus: 0); return }
        text = ""
        listening = true
        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            Task { @MainActor in
                guard let self else { return }
                if let result { self.text = result.bestTranscription.formattedString }
                if error != nil || result?.isFinal == true { self.stop() }
            }
        }
    }

    func stop() {
        guard listening else { return }
        listening = false
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        task = nil
        request = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
