# doTask Service Marketplace – Backend

The **doTask Backend** powers the service marketplace platform, providing APIs for user management, gigs, orders, messaging, payments, and notifications.  
It is built with **Node.js**, **Express.js**, and **MongoDB**.

---

### Project Structure

```
doTask-backend/
│── app.js                 # Main application setup
│── server.js              # Server entry point
│── package.json           # Project dependencies
│── package-lock.json      # Dependency lock file
│── vercel.json            # Deployment config
│── .gitIgnore             # Git ignore rules
│
├── controllers/           # Route handlers (business logic)
│   ├── category.js
│   ├── clients.js
│   ├── email.js
│   ├── gigs.js
│   ├── messages.js
│   ├── notepad.js
│   ├── notification.js
│   ├── orders.js
│   ├── portfolio.js
│   ├── user.js
│   ├── wallet.js
│   └── zoom.js
│
├── data/                  # Config & DB connection
│   ├── config.env
│   └── database.js
│
├── middlewares/           # Express middlewares
│   ├── auth.js
│   ├── error.js
│   ├── gigUpload.js
│   ├── orderUpload.js
│   └── upload.js
│
├── models/                # Mongoose schemas
│   ├── category.js
│   ├── clients.js
│   ├── conversation.js
│   ├── counter.js
│   ├── email.js
│   ├── gigs.js
│   ├── Meeting.js
│   ├── messages.js
│   ├── notepad.js
│   ├── notification.js
│   ├── orders.js
│   ├── portfolio.js
│   ├── user.js
│   └── wallet.js
│
├── routes/                # API route definitions
│   ├── category.js
│   ├── clients.js
│   ├── email.js
│   ├── gigs.js
│   ├── messages.js
│   ├── notepad.js
│   ├── notification.js
│   ├── orders.js
│   ├── portfolio.js
│   ├── user.js
│   ├── wallet.js
│   └── zoom.js
│
└── utils/                 # Helper utilities
├── cloudinary.js
├── emailTemplate.js
├── features.js
├── mailer.js
├── pusher.js
├── stripe.js
├── verifyRecaptcha.js
└── zoom.js
```

---

## ⚙️ Setup & Installation

1. **Clone the repository:**

   git clone https://github.com/WajihulHassan944/backend-service-marketplace
   cd doTask-backend


2. **Install dependencies:**

   npm install

3. **Configure Environment Variables:**
   Create a `.env` file (or use `data/config.env`) with required variables:

MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
ADMIN_EMAIL=your_admin_email
ADMIN_EMAIL_PASS=your_admin_email_password
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
PUSHER_APP_ID=your_pusher_app_id
PUSHER_KEY=your_pusher_key
PUSHER_SECRET=your_pusher_secret
PUSHER_CLUSTER=your_pusher_cluster
ZOOM_ACCOUNT_ID=your_zoom_account_id
ZOOM_CLIENT_ID=your_zoom_client_id
ZOOM_CLIENT_SECRET=your_zoom_client_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
CLIENT_URL=http://localhost:3000
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key



4. **Run the server in development mode:**

   npm run dev

   Or in production:

   npm start

---

## 🚀 Features

* **Authentication & Authorization** (JWT-based)
* **User Profiles & Wallet System**
* **Gigs & Portfolios** (CRUD operations)
* **Orders & Payments** (Stripe integration)
* **Messaging System** with real-time updates (Pusher)
* **Notifications** for activities
* **File Uploads** (Cloudinary integration)
* **Video Conferencing** with Zoom API
* **Email Service** with templating

---

## 📡 API Overview

* **/api/users** – User management & authentication
* **/api/gigs** – Gigs and services
* **/api/orders** – Orders & transactions
* **/api/messages** – Messaging between users
* **/api/wallet** – Wallet & credits
* **/api/notifications** – User notifications
* **/api/portfolio** – Portfolio management
* **/api/email** – Email services
* **/api/zoom** – Zoom meeting integration

---

## 🛠 Tech Stack

* **Backend Framework:** Node.js, Express.js
* **Database:** MongoDB (Mongoose)
* **Authentication:** JWT
* **Payments:** Stripe
* **Real-time:** Pusher
* **File Storage:** Cloudinary
* **Deployment:** Vercel / Node Server

---

# Main Branch