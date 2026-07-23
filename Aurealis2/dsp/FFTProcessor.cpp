#include "FFTProcessor.h"
#include <algorithm>
#include <cstring>

FFTProcessor::FFTProcessor() {
    Init(DEFAULT_FFT_SIZE, 44100.0f);
}

FFTProcessor::~FFTProcessor() = default;

void FFTProcessor::Init(int fftSize, float sampleRate) {
    mFFTSize = fftSize;
    mHopSize = fftSize / 2;
    mSampleRate = sampleRate;

    mInputL.resize(fftSize, 0.0f);
    mInputR.resize(fftSize, 0.0f);
    mWritePos = 0;
    mSamplesUntilNextFrame = fftSize;  // Need a full window before first frame

    ComputeWindow();
    mPendingFrames.clear();
    mInitialized = true;
}

void FFTProcessor::SetFFTSize(int fftSize) {
    if (fftSize != mFFTSize) {
        Init(fftSize, mSampleRate);
    }
}

void FFTProcessor::SetSampleRate(float sampleRate) {
    mSampleRate = sampleRate;
}

void FFTProcessor::ComputeWindow() {
    mWindow.resize(mFFTSize);
    for (int i = 0; i < mFFTSize; i++) {
        // Hann window: 0.5 * (1 - cos(2*pi*i / (N-1)))
        mWindow[i] = 0.5f * (1.0f - std::cos(2.0f * static_cast<float>(M_PI) * i / (mFFTSize - 1)));
    }
}

void FFTProcessor::PushSamples(const float* left, const float* right, int numSamples) {
    if (!mInitialized) return;

    for (int i = 0; i < numSamples; i++) {
        mInputL[mWritePos] = left[i];
        mInputR[mWritePos] = right[i];
        mWritePos = (mWritePos + 1) % mFFTSize;
        mSamplesUntilNextFrame--;

        if (mSamplesUntilNextFrame <= 0) {
            // We have a full window — extract, window, and FFT
            std::vector<float> windowedL(mFFTSize);
            std::vector<float> windowedR(mFFTSize);

            for (int j = 0; j < mFFTSize; j++) {
                int idx = (mWritePos + j) % mFFTSize;  // Read from oldest to newest
                windowedL[j] = mInputL[idx] * mWindow[j];
                windowedR[j] = mInputR[idx] * mWindow[j];
            }

            FFTResult result;
            result.numBins = mFFTSize / 2;
            result.sampleRate = mSampleRate;
            RunFFT(windowedL, result.left);
            RunFFT(windowedR, result.right);

            mPendingFrames.push_back(std::move(result));

            // Next frame after one hop
            mSamplesUntilNextFrame = mHopSize;
        }
    }
}

bool FFTProcessor::HasFrame() const {
    return !mPendingFrames.empty();
}

FFTResult FFTProcessor::PopFrame() {
    FFTResult result = std::move(mPendingFrames.front());
    mPendingFrames.erase(mPendingFrames.begin());
    return result;
}

void FFTProcessor::RunFFT(const std::vector<float>& windowed, std::vector<std::complex<float>>& out) {
    int n = mFFTSize;
    out.resize(n / 2);

    // Copy real data into complex array
    std::vector<std::complex<float>> data(n);
    for (int i = 0; i < n; i++) {
        data[i] = std::complex<float>(windowed[i], 0.0f);
    }

    // In-place FFT
    FFT(data.data(), n);

    // Extract first half (positive frequencies)
    for (int i = 0; i < n / 2; i++) {
        out[i] = data[i];
    }
}

// Bit-reversal permutation
void FFTProcessor::BitReverse(std::complex<float>* data, int n) {
    int j = 0;
    for (int i = 0; i < n; i++) {
        if (i < j) {
            std::swap(data[i], data[j]);
        }
        int m = n >> 1;
        while (m >= 1 && j >= m) {
            j -= m;
            m >>= 1;
        }
        j += m;
    }
}

// Cooley-Tukey radix-2 DIT FFT
void FFTProcessor::FFT(std::complex<float>* data, int n) {
    BitReverse(data, n);

    for (int len = 2; len <= n; len <<= 1) {
        float angle = -2.0f * static_cast<float>(M_PI) / len;
        std::complex<float> wn(std::cos(angle), std::sin(angle));

        for (int i = 0; i < n; i += len) {
            std::complex<float> w(1.0f, 0.0f);
            for (int j = 0; j < len / 2; j++) {
                std::complex<float> u = data[i + j];
                std::complex<float> t = w * data[i + j + len / 2];
                data[i + j] = u + t;
                data[i + j + len / 2] = u - t;
                w *= wn;
            }
        }
    }
}
