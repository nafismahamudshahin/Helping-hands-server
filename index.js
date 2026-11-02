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
