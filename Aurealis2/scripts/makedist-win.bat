@echo off
REM Build Aurealis2 for Windows (VST3)
setlocal

set PROJECT_DIR=%~dp0..\..
cd /d %PROJECT_DIR%

echo === Building Aurealis2 for Windows ===

cmake -B build-release -DCMAKE_BUILD_TYPE=Release ^
    -DAUREALIS2_BUILD_VST3=ON ^
    -DAUREALIS2_BUILD_TESTS=OFF

cmake --build build-release --config Release

echo === Build complete ===
echo Outputs in: %PROJECT_DIR%\build-release\
