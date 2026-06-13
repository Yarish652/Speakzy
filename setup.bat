@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Speakzy Project Setup
echo ========================================

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js is not installed. Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version

echo npm version:
npm --version

echo.
echo ========================================
echo Installing dependencies...
echo ========================================
call npm run build

if errorlevel 1 (
    echo Build failed. Please check the errors above.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Setup complete!
echo ========================================
echo.
echo To run the project:
echo 1. Start the backend:  npm start
echo 2. In another terminal, start the frontend:  cd frontend && npm run dev
echo.
echo Make sure MongoDB is running and .env variables are configured correctly.
pause
