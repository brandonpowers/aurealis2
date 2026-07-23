#pragma once

#include <atomic>
#include <cstddef>
#include <memory>
#include <vector>

// Lock-free Single-Producer Single-Consumer ring buffer.
// Producer: audio thread (Push). Consumer: UI thread (Pop).
// N must be a power of 2.
// Uses heap allocation for the buffer to support large element types.
template <typename T, size_t N>
class SPSCRingBuffer {
    static_assert((N & (N - 1)) == 0, "N must be a power of 2");

    std::vector<T> mBuffer;
    std::atomic<size_t> mWriteIdx{0};  // Only written by producer
    std::atomic<size_t> mReadIdx{0};   // Only written by consumer

public:
    SPSCRingBuffer() : mBuffer(N) {}

    // Push one item. Called from audio thread.
    // Returns false if buffer is full (consumer fell behind).
    bool Push(const T& item) {
        const size_t w = mWriteIdx.load(std::memory_order_relaxed);
        const size_t r = mReadIdx.load(std::memory_order_acquire);
        const size_t nextW = (w + 1) & (N - 1);

        if (nextW == r) {
            return false;  // Buffer full — drop frame
        }

        mBuffer[w] = item;
        mWriteIdx.store(nextW, std::memory_order_release);
        return true;
    }

    // Pop one item. Called from UI thread.
    // Returns false if buffer is empty.
    bool Pop(T& item) {
        const size_t r = mReadIdx.load(std::memory_order_relaxed);
        const size_t w = mWriteIdx.load(std::memory_order_acquire);

        if (r == w) {
            return false;  // Buffer empty
        }

        item = mBuffer[r];
        mReadIdx.store((r + 1) & (N - 1), std::memory_order_release);
        return true;
    }

    // Number of frames available to read.
    size_t Available() const {
        const size_t w = mWriteIdx.load(std::memory_order_acquire);
        const size_t r = mReadIdx.load(std::memory_order_acquire);
        return (w - r) & (N - 1);
    }

    // Reset buffer (call only when both threads are idle).
    void Reset() {
        mWriteIdx.store(0, std::memory_order_relaxed);
        mReadIdx.store(0, std::memory_order_relaxed);
    }
};
