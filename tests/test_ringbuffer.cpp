// Test SPSC ring buffer correctness.
// Verify push/pop, overflow behavior, and available count.

#include "Aurealis2/dsp/AnalysisRingBuffer.h"
#include "Aurealis2/dsp/AnalysisFrame.h"
#include "Aurealis2/config.h"
#include <cstdio>
#include <cstring>

int main() {
    printf("Test Ring Buffer\n");

    int passed = 0;
    int total = 0;

    // Use a small buffer for testing
    SPSCRingBuffer<int, 8> buf;

    // Test 1: Empty buffer
    {
        total++;
        int val;
        if (!buf.Pop(val) && buf.Available() == 0) {
            printf("PASS: Empty buffer returns false on Pop\n");
            passed++;
        } else {
            printf("FAIL: Empty buffer should return false\n");
        }
    }

    // Test 2: Push and pop single item
    {
        total++;
        buf.Push(42);
        int val = 0;
        if (buf.Pop(val) && val == 42) {
            printf("PASS: Push/pop single item\n");
            passed++;
        } else {
            printf("FAIL: Expected 42, got %d\n", val);
        }
    }

    // Test 3: Fill buffer (N-1 items, since SPSC uses one slot as sentinel)
    {
        total++;
        buf.Reset();
        bool allPushed = true;
        for (int i = 0; i < 7; i++) {
            if (!buf.Push(i)) {
                allPushed = false;
                printf("FAIL: Could not push item %d\n", i);
                break;
            }
        }
        // 8th push should fail (buffer full: 7 items = N-1)
        bool overflowed = buf.Push(99);

        if (allPushed && !overflowed && buf.Available() == 7) {
            printf("PASS: Buffer fills to N-1=%d items, overflow returns false\n", 7);
            passed++;
        } else {
            printf("FAIL: Fill test (pushed=%d, overflow=%d, avail=%zu)\n",
                   allPushed, overflowed, buf.Available());
        }
    }

    // Test 4: FIFO order
    {
        total++;
        buf.Reset();
        for (int i = 0; i < 5; i++) buf.Push(i * 10);

        bool ordered = true;
        for (int i = 0; i < 5; i++) {
            int val;
            buf.Pop(val);
            if (val != i * 10) {
                ordered = false;
                printf("FAIL: Expected %d, got %d\n", i * 10, val);
                break;
            }
        }
        if (ordered) {
            printf("PASS: FIFO ordering preserved\n");
            passed++;
        }
    }

    // Test 5: Wrap-around
    {
        total++;
        buf.Reset();
        // Push 5, pop 5, push 5 more (forces wrap-around)
        for (int i = 0; i < 5; i++) buf.Push(i);
        for (int i = 0; i < 5; i++) { int v; buf.Pop(v); }
        for (int i = 10; i < 15; i++) buf.Push(i);

        bool correct = true;
        for (int i = 10; i < 15; i++) {
            int val;
            buf.Pop(val);
            if (val != i) {
                correct = false;
                printf("FAIL: Wrap-around expected %d, got %d\n", i, val);
                break;
            }
        }
        if (correct) {
            printf("PASS: Wrap-around works correctly\n");
            passed++;
        }
    }

    // Test 6: AnalysisFrame in ring buffer
    {
        total++;
        SPSCRingBuffer<AnalysisFrame, RING_BUFFER_SIZE> frameBuffer;

        AnalysisFrame frame;
        frame.magnitudes[0] = 0.5f;
        frame.magnitudes[100] = 0.75f;
        frame.stereoWidth[50] = -0.3f;
        frame.transientEnergy = 0.8f;
        frame.chordIndex = 5;
        frame.chordConfidence = 0.92f;

        frameBuffer.Push(frame);

        AnalysisFrame out;
        frameBuffer.Pop(out);

        if (out.magnitudes[0] == 0.5f &&
            out.magnitudes[100] == 0.75f &&
            out.stereoWidth[50] == -0.3f &&
            out.transientEnergy == 0.8f &&
            out.chordIndex == 5 &&
            out.chordConfidence == 0.92f) {
            printf("PASS: AnalysisFrame round-trip through ring buffer\n");
            passed++;
        } else {
            printf("FAIL: AnalysisFrame data corrupted\n");
        }
    }

    printf("\n%d/%d tests passed\n", passed, total);
    return (passed == total) ? 0 : 1;
}
