# Hotel Booking API

## Overview

RESTful API for managing hotel room bookings with authentication and automated scheduling.

## Features

- 🔐 Firebase JWT Authentication
- 🛏️ Room CRUD operations
- 📅 Booking management with date validation
- ⭐ Review system
- ⏰ Auto-cancellation of expired bookings
- 🌐 CORS enabled

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: MongoDB
- **Authentication**: Firebase Admin SDK
- **Utilities**:
  - Moment.js (date handling)
  - node-cron (scheduled tasks)
  - dotenv (environment variables)
  - CORS middleware

## 📌 API Endpoints

### 🏨 Room Management

| Endpoint               | Method | Description                           | Auth Required | Request Body                              |
| ---------------------- | ------ | ------------------------------------- | ------------- | ----------------------------------------- |
| `/rooms`               | GET    | Get all rooms (filter by price range) | No            | -                                         |
| `/rooms/:id`           | GET    | Get single room by ID                 | No            | -                                         |
| `/rooms`               | POST   | Add new room                          | Yes (Admin)   | `{ roomType, price, description, image }` |
| `/rooms/:id`           | DELETE | Delete room                           | Yes (Admin)   | -                                         |
| `/rooms/myAdded-rooms` | GET    | Get rooms added by user               | Yes           | -                                         |

### 📅 Booking System

| Endpoint              | Method | Description                   | Auth Required | Request Body                  |
| --------------------- | ------ | ----------------------------- | ------------- | ----------------------------- |
| `/book-room`          | POST   | Book a room                   | Yes           | `{ roomId, date, userEmail }` |
| `/my-bookings`        | GET    | Get user's bookings           | Yes           | -                             |
| `/update-booking/:id` | PATCH  | Update booking date           | Yes           | `{ date }`                    |
| `/cancel-booking/:id` | DELETE | Cancel booking (1-day policy) | Yes           | -                             |
| `/already-booking`    | GET    | Check if room is booked       | No            | `?roomId=<roomId>`            |

### ⭐ Reviews

| Endpoint          | Method | Description            | Auth Required | Request Body                  |
| ----------------- | ------ | ---------------------- | ------------- | ----------------------------- |
| `/reviews`        | GET    | Get reviews for a room | No            | `?roomId=<roomId>`            |
| `/reviews`        | POST   | Add new review         | Yes           | `{ roomId, rating, comment }` |
| `/reviews/:id`    | PATCH  | Update review          | Yes           | `{ rating?, comment? }`       |
| `/reviews/:id`    | DELETE | Delete review          | Yes           | -                             |
| `/latest-reviews` | GET    | Get latest reviews     | No            | -                             |

### 🌟 Featured Rooms

| Endpoint          | Method | Description                  | Auth Required |
| ----------------- | ------ | ---------------------------- | ------------- |
| `/featured-rooms` | GET    | Get top-rated featured rooms | No            |
