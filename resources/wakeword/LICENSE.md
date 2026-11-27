# Wake word model licenses

These files are not covered by Pilothouse's MIT license.

- `melspectrogram.onnx`, `embedding_model.onnx`: from [openWakeWord](https://github.com/dscripka/openWakeWord),
  Apache License 2.0, Copyright David Scripka. The embedding model is derived from Google's speech_embedding model
  (Apache License 2.0).
- `hey_pilothouse.onnx`: trained by the Pilothouse authors with openWakeWord's training pipeline, whose negative
  training data (precomputed ACAV100M features) is licensed for non-commercial use. To be safe this model is released
  under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/): you may share and adapt it for
  non-commercial purposes, with attribution, under the same license. Pilothouse itself is free and non-commercial.
