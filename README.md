<div align="center">

# 🤝 HelpingHands Server

REST API for the [HelpingHands](https://github.com/nafismahamudshahin/Helping-hands) volunteer-events platform.

[![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)

**🔗 Live API:** [https://helpinghandsserver.vercel.app](https://helpinghandsserver.vercel.app)
**🌐 Live Client:** [https://helpinghandsnafis.vercel.app](https://helpinghandsnafis.vercel.app)

</div>

---

## ✨ Features

- 📅 **Events CRUD:** create, read, update and delete events
- 🔎 **Upcoming events:** all upcoming events, or the next 6 for the home page
- 🙋 **Join & leave:** participants can join or cancel, and the event's `joined` count stays in sync
- 🔐 **JWT protection:** write routes verify a Bearer token against the client's JWKS using `jose`
- 🧹 **Safe deletion:** deleting an event also removes its participants in a MongoDB transaction
- ☁️ **Vercel ready:** includes `vercel.json` for deployment

## 🛠️ Tech Stack

Node.js (ES modules) · Express 5 · MongoDB · jose · dotenv · cors

## 🚀 Getting Started

```bash
git clone https://github.com/nafismahamudshahin/Helping-hands-server.git
cd Helping-hands-server
npm install
node index.js
```

Create a `.env` file first:

```env
DB_URL=your_mongodb_connection_string
FRONTEND_URL=http://localhost:3000
PORT=5000
```

The API runs at `http://localhost:5000`.

## 🔌 API Endpoints

🌍 public · 🔒 requires `Authorization: Bearer <token>`

| Access | Method | Endpoint | Purpose |
| :-: | :-: | --- | --- |
| 🌍 | `GET` | `/events` | List all events |
| 🌍 | `GET` | `/events/:id` | Event details |
| 🌍 | `GET` | `/upcoming-events` | Upcoming events |
| 🌍 | `GET` | `/near-upcoming-events` | Next 6 upcoming events |
| 🔒 | `GET` | `/events/my/:userId` | Events created by a user |
| 🔒 | `POST` | `/events` | Create an event |
| 🔒 | `PATCH` | `/events/:id` | Update an event |
| 🔒 | `DELETE` | `/events/:id` | Delete an event and its participants |
| 🔒 | `POST` | `/participants` | Join an event |
| 🔒 | `GET` | `/participants/me/:userId` | Events a user joined |
| 🔒 | `GET` | `/check-join/:userId/:eventId` | Check if already joined |
| 🔒 | `PATCH` | `/count-joined/:eventId` | Increase joined count |
| 🔒 | `DELETE` | `/participants/me/:joinId` | Leave an event |

## 👤 Author

**Nafis Mahamud Shahin** · [GitHub](https://github.com/nafismahamudshahin) · [Portfolio](https://nafismahamudshahin.vercel.app)