#pragma once

#include "config.h"
#include "dsp/FFTProcessor.h"
#include "dsp/StereoAnalyzer.h"
#include "dsp/HarmonicDetector.h"
#include "dsp/TransientDetector.h"
#include "dsp/ChromaExtractor.h"
#include "dsp/ChordDetector.h"
#include "dsp/AnalysisFrame.h"
#include "dsp/AnalysisRingBuffer.h"

#if defined(IPLUG2_API)
  #include "IPlug_include_in_plug_hdr.h"
  using iplug::IPlug;
#endif

// Analysis ring buffer type
using AnalysisBuffer = SPSCRingBuffer<AnalysisFrame, RING_BUFFER_SIZE>;

// Aurealis2 — Multi-dimensional audio visualizer plugin.
// Audio passes through unmodified. FFT + analysis runs in the audio thread.
// Results are pushed to a lock-free ring buffer consumed by the WebView UI.
class Aurealis2
#if defined(IPLUG2_API)
  : public iplug::Plugin
#endif
{
public:
    Aurealis2(
#if defined(IPLUG2_API)
        const iplug::InstanceInfo& info
#endif
    );
    ~Aurealis2();

#if defined(IPLUG2_API)
    // iPlug2 overrides
    void ProcessBlock(iplug::sample** inputs, iplug::sample** outputs, int nFrames) override;
    void OnReset() override;
    void OnParamChange(int paramIdx) override;
    void OnIdle() override;
#endif

    // Standalone processing (for tests and web build)
    void ProcessAudio(const float* left, const float* right, float* outLeft, float* outRight, int nFrames);
    void Reset(float sampleRate, int blockSize);

    // Access ring buffer for UI consumption
    AnalysisBuffer& GetAnalysisBuffer() { return mAnalysisRingBuffer; }
    const AnalysisBuffer& GetAnalysisBuffer() const { return mAnalysisRingBuffer; }

    // Parameter getters
    float GetColorTune() const { return mColorTune; }
    float GetSensitivity() const { return mSensitivity; }
    int   GetFFTSize() const { return mFFTProcessor.GetFFTSize(); }
    int   GetTimeDepth() const { return mTimeDepth; }
    float GetStereoSpread() const { return mStereoSpread; }
    float GetZSpacing() const { return mZSpacing; }
    float GetFadeDepth() const { return mFadeDepth; }

    // Parameter setters (for standalone/web mode)
    void SetColorTune(float v) { mColorTune = v; }
    void SetSensitivity(float v) { mSensitivity = v; }
    void SetFFTSize(int fftSizeIndex);
    void SetTimeDepth(int depth) { mTimeDepth = depth; }
    void SetStereoSpread(float v) { mStereoSpread = v; }
    void SetZSpacing(float v) { mZSpacing = v; }
    void SetFadeDepth(float v) { mFadeDepth = v; }

private:
    void SetupParams();
    void InitDSP(float sampleRate);

    // DSP processors
    FFTProcessor       mFFTProcessor;
    StereoAnalyzer     mStereoAnalyzer;
    HarmonicDetector   mHarmonicDetector;
    TransientDetector  mTransientDetector;
    ChromaExtractor    mChromaExtractor;
    ChordDetector      mChordDetector;

    // Lock-free ring buffer: audio thread → UI thread
    AnalysisBuffer     mAnalysisRingBuffer;

    // Cached parameter values (read from audio thread, written from param change)
    float mColorTune    = 0.3f;
    float mSensitivity  = 1.0f;
    int   mTimeDepth    = DEFAULT_TIME_DEPTH;
    float mStereoSpread = 2.0f;
    float mZSpacing     = 0.1f;
    float mFadeDepth    = 0.5f;

    float mSampleRate   = 44100.0f;
};
