# Minute-Sync Scheduler v0.1

A real-time MP3 scheduler with recurring hourly, daily, and one-time events.

## Local Setup

To run this application on your own computer, follow these steps:

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (version 18 or higher is recommended).

### 2. Install Dependencies
Open your terminal in this folder and run:
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory and add any necessary keys. You can use `.env.example` as a template.
Note: For the mock files to play, ensure you have an active internet connection as they are currently hosted remotely.

### 4. Running the App
To start the development server:
```bash
npm run dev
```
The app will be available at `http://localhost:3000`.

### 5. Building for Production
To create a production-ready bundle:
```bash
npm run build
npm start
```

## Features
- **Real-time Synchronization**: The "now" indicator moves precisely with your system clock.
- **Efficient Rendering**: Timeline mapping only recalculates on sync events (refresh/load) to save resources.
- **Metadata Fetching**: Automatically detects MP3 duration when adding new schedules.
- **Flexible Scheduling**: Supports Hourly, Daily (fixed time), and One-Time date/time events.
- **Verification System**: Validates MP3 URLs and paths before saving.
