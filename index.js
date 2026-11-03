import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import express from "express";
import cors from "cors";

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

// --------------- root api ----------------------------
app.get("/", (req, res) => {
    res.send({ message: "Server Running" });
})


// --------------- joined ------------------------------

app.get("/participants", async (req, res) => {
    const result = await joinedDb.find().toArray();
    res.send(result);
})

app.get("/check-join/:userId/:eventId", async (req, res) => {
    const { userId, eventId } = req.params

    const joined = await joinedDb.findOne({
        userId,
        eventId,
    })
    res.send({ joined: !!joined })
})

// for new add:
app.post("/participants", async (req, res) => {
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
app.get("/participants/me/:id", async (req, res) => {
    try {
        const id = req.params.id;

        const result = await joinedDb
            .find({ userId: id })
            .toArray();

        res.send(result);

    } catch (error) {
        res.status(500).send({
            message: "Failed to fetch joined events"
        });
    }
})

// increment joined:
app.patch("/count-joined/:id", async (req, res) => {
    const id = req.params.id;
    const result = await eventsDb.updateOne({ _id: new ObjectId(id) }, { $inc: { joined: 1 } });
    res.send(result);
})


// Delete Participient:
app.delete("/participants/me/:joinId", async (req, res) => {
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
app.post("/events", async (req, res) => {
    const event = req.body;
    const result = await eventsDb.insertOne(event);
    res.send(result)
})


// http://localhost:5000/events/my/id
app.get("/events/my/:id", async (req, res) => {
    const userid = req.params.id;
    const result = await eventsDb.find({ userId: userid }).toArray();
    res.send(result)
})

// upcoming 6 events:
app.get("/near-upcoming-events", async (req, res) => {
    const events = await eventsDb.find({ date: { $gte: today } }).sort({ date: 1 }).limit(6).toArray();
    res.send(events);
})

// get event by id:
app.get("/events/:id", async (req, res) => {
    const id = req.params.id;
    const event = await eventsDb.findOne({ _id: new ObjectId(id) })
    res.send(event)
})

// update event:
app.patch("/events/:id", async (req, res) => {
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
