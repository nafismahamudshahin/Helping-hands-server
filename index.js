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
