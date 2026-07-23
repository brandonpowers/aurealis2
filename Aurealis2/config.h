#pragma once

// Plugin metadata
#define PLUG_NAME "Aurealis2"
#define PLUG_MFR "BrandonSoft"
#define PLUG_VERSION_HEX 0x00010000
#define PLUG_VERSION_STR "1.0.0"
#define PLUG_UNIQUE_ID 'Aur2'
#define PLUG_MFR_ID 'Brsf'
#define PLUG_URL_STR "https://github.com/brandon/aurealis2"
#define PLUG_EMAIL_STR "brandon@example.com"
#define PLUG_COPYRIGHT_STR "Copyright 2025 BrandonSoft"
#define PLUG_CLASS_NAME Aurealis2

// Audio configuration
#define PLUG_CHANNEL_IO "2-2"       // Stereo in, stereo out (pass-through analyzer)
#define PLUG_LATENCY 0              // No added latency
#define PLUG_DOES_MIDI_IN 0
#define PLUG_DOES_MIDI_OUT 0
#define PLUG_DOES_MPE 0
#define PLUG_DOES_STATE_CHUNKS 0
#define PLUG_HAS_UI 1
#define PLUG_WIDTH 900
#define PLUG_HEIGHT 600
#define PLUG_FPS 60
#define PLUG_SHARED_RESOURCES 0
#define PLUG_HOST_RESIZE 1

// DSP configuration
#define PLUG_SAMPLE_RATE 44100.0

// Analysis constants — from aurealis v1
constexpr float FREQ_MIN    = 8.18f;       // C0
constexpr float FREQ_MAX    = 12543.85f;   // ~B9
constexpr float FREQ_REF    = 440.0f;      // A4 concert pitch

constexpr int   DEFAULT_FFT_SIZE   = 4096;
constexpr int   DEFAULT_NUM_BINS   = DEFAULT_FFT_SIZE / 2;
constexpr int   DEFAULT_HOP_SIZE   = DEFAULT_FFT_SIZE / 2;
constexpr int   DEFAULT_TIME_DEPTH = 128;
constexpr int   RING_BUFFER_SIZE   = 256;  // Power of 2, > TIME_DEPTH
constexpr int   MAX_FFT_SIZE       = 8192;
constexpr int   MAX_NUM_BINS       = MAX_FFT_SIZE / 2;

// Note names
constexpr const char* NOTE_NAMES[] = {
    "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"
};

// Chord template names
constexpr const char* CHORD_QUALITIES[] = {
    "maj", "min", "dom7", "min7", "maj7", "dim", "aug", "sus4", "sus2"
};

// Parameter IDs
enum EParams {
    kParamColorTune = 0,
    kParamSensitivity,
    kParamFFTSize,
    kParamTimeDepth,
    kParamStereoSpread,
    kParamZSpacing,
    kParamFadeDepth,
    kNumParams
};
