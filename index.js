import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import express from "express";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from 'jose';
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors())
app.use(express.json())
const today = new Date().toISOString().split("T")[0]

//  --------------- Mongodb -----------------------------

const client = new MongoClient(process.env.DB_URL);

export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}
const dbConnecte = await connectToMongoDB();
const db = dbConnecte.db("helpinghandsdb");
const eventsDb = db.collection("events");
const joinedDb = db.collection("joined");
const certificatesDb = db.collection("certificates");

// Jwt token verify:

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({
            message: "Unauthorized access"
        });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).send({
            message: "Token missing"
        });
    }

    try {
        const JWKS = createRemoteJWKSet(
            new URL(`${process.env.FRONTEND_URL}/api/auth/jwks`)
        );

        const { payload } = await jwtVerify(token, JWKS);

        req.user = payload;

        next();

    } catch (error) {
        console.error("JWT Verification Error:", error);

        return res.status(401).send({
            message: "Invalid or expired token"
        });
    }
};


// --------------- root api ----------------------------
app.get("/", (req, res) => {
    res.send({ message: "Server Running" });
})




// -----------------------    Home api   ------------------------------------------

// upcoming 6 events:
app.get("/near-upcoming-events", async (req, res) => {
    const events = await eventsDb.find({ date: { $gte: today } }).sort({ date: 1 }).limit(6).toArray();
    res.send(events);
})

// get event by id:
app.get("/events/:id", async (req, res) => {
    try {
        const { id } = req.params

        // Malformed ID can never match a document -> 404, not 500
        if (!ObjectId.isValid(id) || String(new ObjectId(id)) !== id) {
            return res.status(404).json({ message: "Event not found" })
        }

        const event = await eventsDb.findOne({ _id: new ObjectId(id) })
        if (!event) {
            return res.status(404).json({ message: "Event not found" })
        }

        res.json(event)
    } catch (error) {
        console.error("GET /events/:id failed:", error)
        res.status(500).json({ message: "Internal server error" })
    }
})


// -------------------------   End Home  -------------------------------------------

// certificate:

// Certificate APIs

try {
    await certificatesDb.createIndex({ userId: 1, eventId: 1 }, { unique: true });
    await certificatesDb.createIndex({ certificateId: 1 }, { unique: true });
} catch (error) {
    // Usually means old test certificates are missing userId/eventId. Delete them in MongoDB and restart.
    console.error("[cert] Could not create certificate indexes:", error.message);
}

// who is the logged-in user? (id comes from the verified token, never from the URL)
const getUserId = (req) => req.user?.id || req.user?.sub;
const isAdmin = (req) => req.user?.role === "admin";

// An event is "ended" when its status is Completed OR its date is already in the past.
// ADAPT: if your events have an end date field, name it "endDate" (it is used when present).
// Dates are compared as "YYYY-MM-DD" text, the same format your events already use.
// (computed fresh each time, so it never gets stale while the server keeps running)
// "today" in YOUR timezone (UTC would be a day behind in Bangladesh between 12am and 6am).
// ADAPT: change the zone with APP_TIMEZONE in .env if needed.
const APP_TZ = process.env.APP_TIMEZONE || "Asia/Dhaka";
const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: APP_TZ }); // YYYY-MM-DD
const dayOf = (d) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
const isEventEnded = (ev) =>
    ev.status === "Completed" || dayOf(ev.endDate || ev.date || "9999-12-31") < todayStr();

// Creates the certificate if it doesn't exist yet (safe to call many times, never duplicates)
async function issueCertificate({ userId, eventId, eventTitle, participantName }) {
    return certificatesDb.findOneAndUpdate(
        { userId, eventId },
        {
            $setOnInsert: {
                certificateId: crypto.randomUUID(),
                userId,
                eventId,
                eventTitle,
                participantName,
                issueDate: new Date(),
            },
        },
        { upsert: true, returnDocument: "after" }
    );
}

// Your "joined" documents have NO name field, so we look the name up:
// 1) a name saved on the joined doc (if any)  2) the logged-in token's name
// 3) the auth "user" collection (Better Auth default name: "user")  4) "Participant"
// ADAPT: if your users live in another collection/database, change usersDb below.
const usersDb = db.collection("user");
async function nameFromJoined(j, fallback) {
    const direct = j?.userName || j?.name || j?.participantName;
    if (direct) return direct;
    if (fallback) return fallback;
    try {
        const uid = j?.userId;
        let u = null;
        if (uid && ObjectId.isValid(uid)) u = await usersDb.findOne({ _id: new ObjectId(uid) });
        if (!u && uid) u = await usersDb.findOne({ id: uid });
        if (u?.name) return u.name;
    } catch (e) { /* fall through */ }
    return "Participant";
}

// Get all certificates (admin only)
app.get("/certificate", verifyToken, async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).send({ message: "Admin only" });
        const certificates = await certificatesDb.find({}).sort({ issueDate: -1 }).toArray();
        res.send(certificates);
    } catch (error) {
        res.status(500).send({ message: "Failed to fetch certificates" });
    }
});

// Get MY certificates
app.get("/certificate/my", verifyToken, async (req, res) => {
    try {
        const certificates = await certificatesDb
            .find({ userId: getUserId(req) })
            .sort({ issueDate: -1 })
            .toArray();
        res.send(certificates);
    } catch (error) {
        res.status(500).send({ message: "Failed to fetch certificates" });
    }
});

// Get ONE certificate by Certificate ID (owner only)
app.get("/certificate/id/:certificateId", verifyToken, async (req, res) => {
    try {
        const cert = await certificatesDb.findOne({ certificateId: req.params.certificateId });
        if (!cert) return res.status(404).send({ message: "Certificate not found" });
        if (cert.userId !== getUserId(req) && !isAdmin(req)) {
            return res.status(403).send({ message: "Forbidden access" });
        }
        res.send(cert);
    } catch (error) {
        res.status(500).send({ message: "Failed to fetch certificate" });
    }
});

// Generate certificate for me (server checks the event has ended and I joined it)
app.post("/certificate", verifyToken, async (req, res) => {
    try {
        const { eventId } = req.body;
        const userId = getUserId(req);
        if (!ObjectId.isValid(eventId)) return res.status(400).send({ message: "Invalid eventId" });

        const event = await eventsDb.findOne({ _id: new ObjectId(eventId) });
        if (!event) return res.status(404).send({ message: "Event not found" });
        if (!isEventEnded(event)) return res.status(400).send({ message: "Event has not ended yet" });

        const joined = await joinedDb.findOne({ userId, eventId: { $in: [eventId, new ObjectId(eventId)] } });
        if (!joined) return res.status(403).send({ message: "You did not participate in this event" });

        const existing = await certificatesDb.findOne({ userId, eventId });
        if (existing) return res.status(409).send({ message: "Certificate already exists", certificate: existing });

        const certificate = await issueCertificate({
            userId,
            eventId,
            eventTitle: event.title,
            participantName: await nameFromJoined(joined, req.user?.name),
        });
        res.status(201).send({ message: "Certificate generated successfully", certificate });
    } catch (error) {
        if (error.code === 11000) return res.status(409).send({ message: "Certificate already exists" });
        res.status(500).send({ message: "Failed to generate certificate" });
    }
});

// Safety net: the Certificate page calls this to create any missing certificates
app.post("/certificate/sync", verifyToken, async (req, res) => {
    try {
        const userId = getUserId(req);
        const myJoins = await joinedDb.find({ userId }).toArray();
        const ids = myJoins.map((j) => String(j.eventId)).filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
        const completed = (await eventsDb.find({ _id: { $in: ids } }).toArray()).filter(isEventEnded);

        for (const ev of completed) {
            const eventId = ev._id.toString();
            const join = myJoins.find((j) => String(j.eventId) === eventId);
            await issueCertificate({
                userId,
                eventId,
                eventTitle: ev.title,
                participantName: await nameFromJoined(join, req.user?.name),
            });
        }
        // certificates made by the background job may carry the placeholder name: fix it now
        if (req.user?.name) {
            await certificatesDb.updateMany(
                { userId, participantName: "Participant" },
                { $set: { participantName: req.user.name } }
            );
        }
        res.send({ ok: true });
    } catch (error) {
        res.status(500).send({ message: "Sync failed" });
    }
});

// AUTOMATIC: give a certificate to every participant of every ended event.
// Runs when the server starts and then every hour. Safe to repeat (no duplicates).
async function issueCertificatesForEndedEvents() {
    try {
        const all = await eventsDb.find({}).toArray();
        const events = all.filter(isEventEnded);
        console.log(`[cert-job] today=${todayStr()} | events=${all.length} | ended=${events.length}`);
        if (all.length && events.length === 0) {
            console.log("[cert-job] No ended event found. First event looks like:",
                { date: all[0].date, endDate: all[0].endDate, status: all[0].status });
        }

        let created = 0;
        for (const ev of events) {
            const eventId = ev._id.toString();
            // "joined" may store eventId as text or as ObjectId: accept both
            const participants = await joinedDb.find({ eventId: { $in: [eventId, ev._id] } }).toArray();
            console.log(`[cert-job] "${ev.title}" (${dayOf(ev.date)}) participants=${participants.length}`);

            if (participants.length === 0) {
                const sample = await joinedDb.findOne({});
                if (sample) {
                    console.log("[cert-job] joined doc fields:",
                        Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, typeof v])),
                        "| its eventId:", String(sample.eventId), "| this event _id:", eventId);
                }
                continue;
            }

            const have = new Set(
                (await certificatesDb.find({ eventId }).project({ userId: 1 }).toArray()).map((c) => c.userId)
            );
            for (const p of participants) {
                if (!p.userId) { console.log("[cert-job] joined doc has no userId, skipped"); continue; }
                if (have.has(p.userId)) continue;
                await issueCertificate({
                    userId: p.userId,
                    eventId,
                    eventTitle: ev.title,
                    participantName: await nameFromJoined(p),
                });
                created++;
            }
        }
        console.log(`[cert-job] done. new certificates: ${created}`);
    } catch (error) {
        console.error("[cert-job] FAILED:", error);
    }
}
issueCertificatesForEndedEvents();
setInterval(issueCertificatesForEndedEvents, 60 * 60 * 1000);

// Edit certificate text (admin only)
app.patch("/certificate/:id", verifyToken, async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).send({ message: "Admin only" });
        if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid id" });

        const updateDoc = {};
        ["eventTitle", "participantName"].forEach((f) => {
            if (req.body[f] !== undefined) updateDoc[f] = req.body[f];
        });
        if (Object.keys(updateDoc).length === 0) return res.status(400).send({ message: "No valid fields provided" });

        const result = await certificatesDb.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateDoc });
        if (result.matchedCount === 0) return res.status(404).send({ message: "Certificate not found" });
        res.send({ message: "Certificate updated successfully" });
    } catch (error) {
        res.status(500).send({ message: "Failed to update certificate" });
    }
});


// verify certificate:
app.get('/cerfificate/:id', async (req, res) => {
    const id = req.params.id;
    console.log("for verify: ", id)
    const result = await certificatesDb.findOne({ certificateId: id })
    res.send(result)
})


app.patch("/events/:id", verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const updated = req.body;

        const result = await eventsDb.updateOne(
            { _id: new ObjectId(id) },
            { $set: updated }
        );

        // AUTO-GENERATE certificates when the event is marked Completed
        if (updated.status === "Completed") {
            const event = await eventsDb.findOne({ _id: new ObjectId(id) });
            const participants = await joinedDb.find({ eventId: id }).toArray();
            await Promise.all(
                participants.map(async (p) =>
                    issueCertificate({
                        userId: p.userId,
                        eventId: id,
                        eventTitle: event.title,
                        participantName: await nameFromJoined(p),
                    })
                )
            );
        }

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Failed to update event" });
    }
});

// certificate api end here


// --------------- joined ------------------------------

app.get("/participants", verifyToken, async (req, res) => {
    const result = await joinedDb.find().toArray();
    res.send(result);
})

app.get("/check-join/:userId/:eventId", verifyToken, async (req, res) => {
    const { userId, eventId } = req.params

    const joined = await joinedDb.findOne({
        userId,
        eventId,
    })
    res.send({ joined: !!joined })
})

// for new add:
app.post("/participants", verifyToken, async (req, res) => {
    try {
        const joined = req.body;
        const result = await joinedDb.insertOne(joined)
        res.send(result);
    } catch (error) {
        res.status(500).send({
            message: "Failed to joined events"
        })
    }
})

// where i participate:
app.get("/participants/me/:id", verifyToken, async (req, res) => {
    try {
        const id = req.params.id;

        const result = await joinedDb.find({ userId: id }).sort({ eventDate: 1 }).toArray();

        res.send(result);

    } catch (error) {
        res.status(500).send({
            message: "Failed to fetch joined events"
        });
    }
})

// increment joined:
app.patch("/count-joined/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    const result = await eventsDb.updateOne({ _id: new ObjectId(id) }, { $inc: { joined: 1 } });
    res.send(result);
})


// Delete Participient:
app.delete("/participants/me/:joinId", verifyToken, async (req, res) => {
    try {
        const joinId = req.params.joinId;
        // find joined event:
        const joined = await joinedDb.findOne({ _id: new ObjectId(joinId) });

        if (!joined) {
            return res.status(404).send({
                message: "Joined event not found",
            });
        }
        // decrement joined from event:
        const eventId = joined.eventId;
        await eventsDb.updateOne({ _id: new ObjectId(eventId) }, { $inc: { joined: -1 } });

        // delete participient from the joined:
        const result = await joinedDb.deleteOne({ _id: new ObjectId(joinId) });

        if (result.deletedCount === 0) {
            return res.status(404).send({
                message: "Failed to delete joined event",
            });
        }

        res.send({
            success: true,
            message: "Successfully cancelled event participation",
        });

    } catch (error) {
        res.status(500).send({
            success: false,
            message: "Internal server error",
        });
    }
})



// --------------------- Events ---------------------------

// get all events:
app.get("/events", async (req, res) => {
    try {
        const events = await eventsDb.find().sort({ date: 1 }).toArray();
        res.send(events);
    } catch (error) {
        res.status(500).send({ message: "internal server error" })
    }
})

// upcomming events
app.get("/upcoming-events", async (req, res) => {
    try {
        const events = await eventsDb.find({ date: { $gte: today } }).sort({ date: 1 }).toArray();
        res.send(events);
    } catch (error) {
        res.status(500).send({ message: "internal server error" })
    }
})
// create new event:
app.post("/events", verifyToken, async (req, res) => {
    const event = req.body;
    const result = await eventsDb.insertOne(event);
    res.send(result)
})


// http://localhost:5000/events/my/id
app.get("/events/my/:id", verifyToken, async (req, res) => {
    const userid = req.params.id;
    const result = await eventsDb.find({ userId: userid }).toArray();
    res.send(result)
})



// update event:
app.patch("/events/:id", verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const updated = req.body;

        const result = await eventsDb.updateOne(
            { _id: new ObjectId(id) },
            { $set: updated }
        );

        res.send(result);

    } catch (error) {
        res.status(500).send({
            message: "Failed to update event"
        });
    }
})

// delete event:
app.delete("/events/:id", verifyToken, async (req, res) => {
    const session = client.startSession();
    try {
        const id = req.params.id;
        await session.withTransaction(async () => {
            await joinedDb.deleteMany({ eventId: id }, { session });
            const result = await eventsDb.deleteOne(
                { _id: new ObjectId(id) },
                { session }
            );
            if (result.deletedCount === 0) {
                throw new Error("Event not found");
            }
        });
        res.send({
            success: true,
            message: "Event and all participants deleted successfully"
        });
    } catch (error) {
        const notFound = error.message === "Event not found";
        res.status(notFound ? 404 : 500).send({
            success: false,
            message: error.message
        });
    } finally {
        await session.endSession();
    }
})

app.listen(PORT, (req, res) => {
    console.log(`Server running on port ${PORT}`);
})

export default app;