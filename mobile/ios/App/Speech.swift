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

    static var language: String {
        get { UserDefaults.standard.string(forKey: "voiceLanguage") ?? "tr-TR" }
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
