# Speakzy Project Setup Guide

## Environment Variables

The backend `.env` file has been created at `backend/.env` with the following variables:

```
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/speakzy
JWT_SECRET_KEY=your_jwt_secret_key_change_this_in_production
STEAM_API_KEY=your_stream_api_key_here
STEAM_API_SECRET=your_stream_api_secret_here
```

### Configure These Values:

1. **MONGO_URI**: Update with your MongoDB connection string
   - Local: `mongodb://localhost:27017/speakzy`
   - Atlas: `mongodb+srv://username:password@cluster.mongodb.net/speakzy`

2. **JWT_SECRET_KEY**: Generate a strong secret for JWT tokens
   - Use: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

3. **STEAM_API_KEY & STEAM_API_SECRET**: Get from Stream.io dashboard
   - Sign up at https://getstream.io/
   - Create an app and get your API Key and Secret

## Installation Steps

### Option 1: Using Batch Files (Recommended for Windows CMD)

1. **Double-click `setup.bat`** to:
   - Check Node.js installation
   - Install backend dependencies
   - Install frontend dependencies
   - Build frontend

2. **After setup is complete**, you'll have two options:
   - Run `start-backend.bat` in one terminal
   - Run `start-frontend.bat` in another terminal

### Option 2: Manual Commands in CMD

1. **Open Command Prompt** and navigate to the project root:

   ```
   cd c:\Users\kyari\OneDrive\Desktop\Speakzy-main.worktrees\agents-run-project-setup
   ```

2. **Install dependencies**:

   ```
   npm run build
   ```

3. **In Terminal 1 - Start Backend**:

   ```
   npm start
   ```

   Backend will run on `http://localhost:5000`

4. **In Terminal 2 - Start Frontend** (navigate to frontend folder first):
   ```
   cd frontend
   npm run dev
   ```
   Frontend will run on `http://localhost:5173`

## Prerequisites

- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- **MongoDB** (running locally or remote connection string)

## Verify Installation

1. Check Node.js: `node --version`
2. Check npm: `npm --version`
3. Check MongoDB connection by looking at backend startup messages

## Project Structure

```
Speakzy/
├── backend/          # Express.js server
│   ├── src/
│   │   ├── controllers/   # Route handlers
│   │   ├── models/        # MongoDB schemas
│   │   ├── routes/        # API endpoints
│   │   ├── middleware/    # Express middleware
│   │   ├── lib/           # Utilities (DB, Stream)
│   │   └── server.js      # Main server file
│   └── .env              # Environment variables
├── frontend/         # React + Vite app
│   ├── src/
│   ├── index.html
│   └── vite.config.js
└── package.json      # Root npm config
```

## Features

- User authentication with JWT
- MongoDB database
- Stream Chat integration
- React frontend with Vite
- Real-time messaging

## Troubleshooting

### Port already in use

- Backend: Change `PORT` in `.env`
- Frontend: Press `q` in dev terminal and restart

### MongoDB connection failed

- Ensure MongoDB is running
- Check `MONGO_URI` in `.env`

### Stream API errors

- Verify API Key and Secret in `.env`
- Create Stream.io account at https://getstream.io/

### Dependencies not installing

- Delete `node_modules` folders
- Delete `package-lock.json` files
- Run `npm run build` again
