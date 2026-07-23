#include "Aurealis2.h"
#include <cstring>

// Base64 encoding for efficient C++ → JS data transfer
static const char BASE64_CHARS[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static std::string Base64Encode(const uint8_t* data, size_t len) {
    std::string result;
    result.reserve(((len + 2) / 3) * 4);

    for (size_t i = 0; i < len; i += 3) {
        uint32_t b = (static_cast<uint32_t>(data[i]) << 16);
        if (i + 1 < len) b |= (static_cast<uint32_t>(data[i + 1]) << 8);
        if (i + 2 < len) b |= static_cast<uint32_t>(data[i + 2]);

        result.push_back(BASE64_CHARS[(b >> 18) & 0x3F]);
        result.push_back(BASE64_CHARS[(b >> 12) & 0x3F]);
        result.push_back((i + 1 < len) ? BASE64_CHARS[(b >> 6) & 0x3F] : '=');
        result.push_back((i + 2 < len) ? BASE64_CHARS[b & 0x3F] : '=');
    }

    return result;
}

// ---- Construction / Destruction ----

Aurealis2::Aurealis2(
#if defined(IPLUG2_API)
    const iplug::InstanceInfo& info
) : iplug::Plugin(info, iplug::MakeConfig(kNumParams, 1))
#else
)
#endif
{
    SetupParams();
    InitDSP(44100.0f);
}

Aurealis2::~Aurealis2() = default;

void Aurealis2::SetupParams() {
#if defined(IPLUG2_API)
    GetParam(kParamColorTune)->InitDouble("Color Tune", 0.3, 0.0, 1.0, 0.01);
    GetParam(kParamSensitivity)->InitDouble("Sensitivity", 1.0, 0.1, 5.0, 0.01);
    GetParam(kParamFFTSize)->InitEnum("FFT Size", 1, 3, "", 0, "",
        "2048", "4096", "8192");
    GetParam(kParamTimeDepth)->InitInt("Time Depth", 128, 32, 256);
    GetParam(kParamStereoSpread)->InitDouble("Stereo Spread", 2.0, 0.0, 5.0, 0.01);
    GetParam(kParamZSpacing)->InitDouble("Z Spacing", 0.1, 0.01, 0.5, 0.001);
    GetParam(kParamFadeDepth)->InitDouble("Fade Depth", 0.5, 0.0, 1.0, 0.01);
#endif
}

void Aurealis2::InitDSP(float sampleRate) {
    mSampleRate = sampleRate;

    int fftSize = mFFTProcessor.GetFFTSize();
    int numBins = fftSize / 2;

    mFFTProcessor.Init(fftSize, sampleRate);
    mStereoAnalyzer.Init(numBins);
    mHarmonicDetector.Init(numBins);
    mTransientDetector.Init(numBins);
    mChromaExtractor.Init(numBins, sampleRate, fftSize);
    mChordDetector.Init();
    mAnalysisRingBuffer.Reset();
}

// ---- Audio Processing ----

void Aurealis2::ProcessAudio(const float* left, const float* right,
                              float* outLeft, float* outRight, int nFrames) {
    // 1. Pass-through (analyzer — no modification)
    if (outLeft != left) std::memcpy(outLeft, left, nFrames * sizeof(float));
    if (outRight != right) std::memcpy(outRight, right, nFrames * sizeof(float));

    // 2. Feed samples into FFT processor
    mFFTProcessor.PushSamples(left, right, nFrames);

    // 3. Process all ready FFT frames
    while (mFFTProcessor.HasFrame()) {
        FFTResult fft = mFFTProcessor.PopFrame();

        AnalysisFrame frame;
        int numBins = fft.numBins;
        frame.numBins = numBins;

        // Stereo analysis: magnitude + stereo width
        mStereoAnalyzer.Process(fft, frame.magnitudes, frame.stereoWidth);

        // Harmonic detection
        mHarmonicDetector.Process(frame.magnitudes, numBins, frame.harmonicEnergy);

        // Transient detection
        frame.transientEnergy = mTransientDetector.Process(frame.magnitudes, numBins);

        // Chroma extraction + chord detection
        mChromaExtractor.Process(frame.magnitudes, numBins, frame.chroma);
        ChordResult chord = mChordDetector.Process(frame.chroma);
        frame.chordIndex = chord.index;
        frame.chordConfidence = chord.confidence;

        // Push to ring buffer (lock-free, drops if full)
        mAnalysisRingBuffer.Push(frame);
    }
}

#if defined(IPLUG2_API)
void Aurealis2::ProcessBlock(iplug::sample** inputs, iplug::sample** outputs, int nFrames) {
    const int nChans = NOutChansConnected();

    // Pass-through + analyze
    // iPlug2 sample type may be double, so we need to convert
    // For efficiency, process in-place if sample == float
    if constexpr (std::is_same_v<iplug::sample, float>) {
        ProcessAudio(inputs[0], inputs[1], outputs[0], outputs[1], nFrames);
    } else {
        // Double precision path — convert to float for DSP
        std::vector<float> inL(nFrames), inR(nFrames), outL(nFrames), outR(nFrames);
        for (int s = 0; s < nFrames; s++) {
            inL[s] = static_cast<float>(inputs[0][s]);
            inR[s] = (nChans >= 2) ? static_cast<float>(inputs[1][s]) : inL[s];
        }

        ProcessAudio(inL.data(), inR.data(), outL.data(), outR.data(), nFrames);

        for (int s = 0; s < nFrames; s++) {
            outputs[0][s] = static_cast<iplug::sample>(outL[s]);
            if (nChans >= 2) outputs[1][s] = static_cast<iplug::sample>(outR[s]);
        }
    }
}

void Aurealis2::OnReset() {
    mSampleRate = static_cast<float>(GetSampleRate());
    InitDSP(mSampleRate);
}

void Aurealis2::OnParamChange(int paramIdx) {
    switch (paramIdx) {
        case kParamColorTune:
            mColorTune = static_cast<float>(GetParam(kParamColorTune)->Value());
            break;
        case kParamSensitivity:
            mSensitivity = static_cast<float>(GetParam(kParamSensitivity)->Value());
            break;
        case kParamFFTSize:
            SetFFTSize(static_cast<int>(GetParam(kParamFFTSize)->Value()));
            break;
        case kParamTimeDepth:
            mTimeDepth = static_cast<int>(GetParam(kParamTimeDepth)->Value());
            break;
        case kParamStereoSpread:
            mStereoSpread = static_cast<float>(GetParam(kParamStereoSpread)->Value());
            break;
        case kParamZSpacing:
            mZSpacing = static_cast<float>(GetParam(kParamZSpacing)->Value());
            break;
        case kParamFadeDepth:
            mFadeDepth = static_cast<float>(GetParam(kParamFadeDepth)->Value());
            break;
    }
}

void Aurealis2::OnIdle() {
    // This is called ~30-60Hz on the main/UI thread.
    // Pop all available frames and send to WebView via EvaluateJavaScript.
    // In the actual iPlug2 WebView integration, we'd serialize and send here.
    // For now, this is a placeholder — the WebView bridge is wired in the JS layer.
}
#endif

void Aurealis2::Reset(float sampleRate, int /*blockSize*/) {
    InitDSP(sampleRate);
}

void Aurealis2::SetFFTSize(int fftSizeIndex) {
    static const int sizes[] = {2048, 4096, 8192};
    int idx = std::max(0, std::min(2, fftSizeIndex));
    int newSize = sizes[idx];

    if (newSize != mFFTProcessor.GetFFTSize()) {
        int numBins = newSize / 2;
        mFFTProcessor.Init(newSize, mSampleRate);
        mStereoAnalyzer.Init(numBins);
        mHarmonicDetector.Init(numBins);
        mTransientDetector.Init(numBins);
        mChromaExtractor.Init(numBins, mSampleRate, newSize);
        mAnalysisRingBuffer.Reset();
    }
}
