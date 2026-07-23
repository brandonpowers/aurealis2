#pragma once

#include "../config.h"
#include <vector>
#include <complex>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// FFT result for one channel pair
struct FFTResult {
    std::vector<std::complex<float>> left;   // Complex spectrum, left channel
    std::vector<std::complex<float>> right;  // Complex spectrum, right channel
    int numBins;                              // Number of frequency bins (fftSize/2)
    float sampleRate;
};

// Accumulates stereo audio samples, applies Hann window, runs FFT.
// Supports configurable FFT sizes (2048, 4096, 8192).
class FFTProcessor {
public:
    FFTProcessor();
    ~FFTProcessor();

    void Init(int fftSize, float sampleRate);
    void SetFFTSize(int fftSize);
    void SetSampleRate(float sampleRate);

    // Push interleaved stereo samples from ProcessBlock
    void PushSamples(const float* left, const float* right, int numSamples);

    // Check if a complete FFT frame is ready
    bool HasFrame() const;

    // Pop the next FFT result (call only when HasFrame() == true)
    FFTResult PopFrame();

    int GetFFTSize() const { return mFFTSize; }
    int GetNumBins() const { return mFFTSize / 2; }
    int GetHopSize() const { return mHopSize; }

private:
    void ComputeWindow();
    void RunFFT(const std::vector<float>& windowed, std::vector<std::complex<float>>& out);

    // Simple in-place Cooley-Tukey radix-2 FFT (no external dependency needed)
    static void FFT(std::complex<float>* data, int n);
    static void BitReverse(std::complex<float>* data, int n);

    int   mFFTSize = DEFAULT_FFT_SIZE;
    int   mHopSize = DEFAULT_HOP_SIZE;
    float mSampleRate = 44100.0f;

    // Circular input buffers for L and R channels
    std::vector<float> mInputL;
    std::vector<float> mInputR;
    int mWritePos = 0;
    int mSamplesUntilNextFrame = 0;  // Countdown to next hop

    // Hann window coefficients
    std::vector<float> mWindow;

    // Output queue (typically just 0 or 1 frames)
    std::vector<FFTResult> mPendingFrames;

    bool mInitialized = false;
};
